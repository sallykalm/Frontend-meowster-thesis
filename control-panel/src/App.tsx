import { useState, useEffect, useRef, useCallback } from 'react';
import InputSection from './components/InputSection';
import MicIndicator from './components/MicIndicator';
import { useWebSpeech } from './hooks/useWebSpeech';
import { useVoiceInput } from './hooks/useVoiceInput';
import { useDotAnimation } from './hooks/useDotAnimation';
import { useDebate } from './hooks/useDebate';
import { useStatus } from './hooks/useStatus';
import {
  fetchHealth,
  fetchDebateQuestions,
  postInterrupt,
  postCorrectTranscript,
  postImageSet,
  postFastForward,
  postSoftPause,
  postHardReset,
  postTotalReset,
  postCreditsToggle,
  postDeactivateTalking,
  postRoundUp,
  postClearHistory,
  postClearQuestion,
  postToggleTtsMute,
  postClassifyBargein,
  postBoot,
  postClearBargein,
  postMicState,
} from './api';

import { BARGE_IN_SUBMIT_DELAY_MS } from './constants';
import styles from './App.module.css';
import './App.css';

// ---------------------------------------------------------------------------
// Position-aware philosopher name corrector
// ---------------------------------------------------------------------------
// Pre-LLM pass that catches novel STT misrecognitions (e.g. "Aurelio" for
// "Virilio") before the transcript reaches the classifier. Only corrects words
// that appear in grammatical name positions and are phonetically similar to one
// of the four philosopher names. Runs entirely client-side — zero latency cost.

const _PHILOSOPHER_NAMES = ['Flusser', 'Virilio', 'Weizenbaum', 'Weibel'] as const;

function _phoneticSimilarity(a: string, b: string): number {
  // Character bigrams + suffix bonus. More sensitive to shared endings than
  // pure trigram similarity, which is important for catching "-lio"/"-elio"
  // variants of "Virilio" ("Aurelio", "Orilio", etc.).
  const al = a.toLowerCase();
  const bl = b.toLowerCase();
  const bigrams = (s: string): Set<string> => {
    const r = new Set<string>();
    for (let i = 0; i < s.length - 1; i++) r.add(s.slice(i, i + 2));
    return r;
  };
  const ba = bigrams(al);
  const bb = bigrams(bl);
  let shared = 0;
  ba.forEach((t) => { if (bb.has(t)) shared++; });
  const bigramSim = ba.size + bb.size > 0 ? (2 * shared) / (ba.size + bb.size) : 0;
  // Shared suffix bonus — "lio" shared by "aurelio"/"virilio" boosts score.
  let suffixLen = 0;
  const minLen = Math.min(al.length, bl.length);
  for (let i = 1; i <= minLen; i++) {
    if (al.slice(-i) === bl.slice(-i)) suffixLen = i;
    else break;
  }
  const suffixBonus = suffixLen / Math.max(al.length, bl.length);
  return Math.min(1, bigramSim + suffixBonus * 0.5);
}

// Words that should never be treated as philosopher name candidates.
const _COMMON_WORDS = new Set([
  'this','that','what','when','where','which','from','into','some','more',
  'just','also','very','think','know','talk','speak','tell','about','them',
  'they','their','there','here','have','been','will','would','could','should',
  'might','must','your','true','false','agree','time','life','work','back',
  'well','good','look','come','over','take','make','want','need','help',
  'even','only','both','each','many','much','most','such','long','next',
  'then','than','like','does','done','else','first','last','real','actually',
  'hello','please','thank','sorry','okay','sure','right','wrong','think',
]);

function _tryCorrectWord(word: string): string {
  const lw = word.toLowerCase();
  if (_PHILOSOPHER_NAMES.some((n) => n.toLowerCase() === lw)) return word;
  if (word.length < 4) return word;
  if (_COMMON_WORDS.has(lw)) return word;
  let best = '';
  let bestScore = 0.42; // Tuned: "aurelio"→"virilio" scores ~0.55, "viral"→"virilio" ~0.40
  for (const name of _PHILOSOPHER_NAMES) {
    const s = _phoneticSimilarity(word, name);
    if (s > bestScore) { bestScore = s; best = name; }
  }
  return best || word;
}

function correctPhilosopherNamesPositional(text: string): string {
  // 1. Words after address-verbs / person-introducing prepositions.
  //    E.g. "do you agree with Aurelio?" → "do you agree with Virilio?"
  const withTrigger = text.replace(
    /\b(ask|address|question|agree\s+with|speak\s+(?:to|with)|talk\s+to|reply\s+to|respond\s+to|directed\s+at)\s+([A-Za-z]+)/gi,
    (m, trigger: string, word: string) => {
      const c = _tryCorrectWord(word);
      return c !== word ? `${trigger} ${c}` : m;
    },
  );

  // 2. Sentence-initial direct address: "Aurelio, what do you think?"
  const withStart = withTrigger.replace(
    /^([A-Za-z]{4,})(\s*[,?!])/,
    (m, word: string, punct: string) => {
      const c = _tryCorrectWord(word);
      return c !== word ? `${c}${punct}` : m;
    },
  );

  return withStart;
}

function App() {
  const [debateQuestions, setDebateQuestions] = useState<string[]>([]);
  const [userQuestion, setUserQuestion] = useState('');
  const [submittedQuestion, setSubmittedQuestion] = useState('');
  const [isFastForwarding, setIsFastForwarding] = useState(false);
  const [isTtsEnabled, setIsTtsEnabled] = useState(false);
  const [bargeinEnabled, setBargeinEnabled] = useState(true);
  const [micMuted, setMicMuted] = useState(true);
  const [liveInstructions, setLiveInstructions] = useState<string[]>([]);
  const [bargeinPhase, setBargeinPhase] = useState<'idle' | 'listening' | 'processing'>('idle');
  const [imageSet, setImageSet] = useState<1 | 2 | 3 | 4>(1);

  const inputRef = useRef<HTMLInputElement>(null);
  const submittedQuestionRef = useRef('');
  // Token: incremented on each new transcript so a stale classification result
  // arriving after a newer transcript is silently discarded.
  const classificationTokenRef = useRef(0);
  // Timer ref for the pre-submit delay. Cleared when new speech arrives.
  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Safety timer: last-resort gate release if the pipeline never completes.
  const bargeinSafetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Latest non-empty Web Speech text seen during the current barge-in utterance.
  // Updated from interimTranscript via useEffect; used by the safety timer fallback.
  const bargeinLatestTextRef = useRef('');
  // Stable ref to handleBargeinTranscript so the safety timer can call it
  // without creating a forward-reference dependency.
  const bargeinTranscriptFnRef = useRef<((text: string) => void) | null>(null);

  const status = useStatus();
  const isDebating = status.active;
  const isDebatingRef = useRef(isDebating);
  useEffect(() => { isDebatingRef.current = isDebating; }, [isDebating]);
  const isPausePending = status.is_pause_pending;
  const isRoundUpPending = status.is_round_up_pending;

  const { error, startDebate, abortDebate } = useDebate();

  const displayedQuestion = isDebating ? submittedQuestion : '';

  useEffect(() => {
    if (!isDebating) {
      submittedQuestionRef.current = '';
    }
    // Clear barge-in phase as soon as the backend confirms a debate is active
    // (or has ended). Covers the case where startDebate() fires but the phase
    // wasn't reset in the closure (e.g. typed-question submit path).
    // eslint-disable-next-line react-compiler/react-compiler
    setBargeinPhase('idle');
  }, [isDebating]);

  useEffect(() => {
    const load = async (): Promise<void> => {
      const [questions, health] = await Promise.all([
        fetchDebateQuestions(),
        fetchHealth(),
      ]);
      if (questions.length > 0) setDebateQuestions(questions);
      if (health) {
        setIsTtsEnabled(health.tts);
        setBargeinEnabled(Boolean(health.barge_in_enabled));
      }
    };
    void load();
  }, []);

  const {
    isListening,
    transcript,
    start: startVoice,
    stop: stopVoice,
    reset: resetVoice,
  } = useWebSpeech();

  const dotCount = useDotAnimation(isListening && !transcript.trim());

  const handleBargeinSpeechStart = useCallback((): void => {
    // Cancel any pending delayed submit from a previous utterance.
    if (pendingTimerRef.current !== null) {
      clearTimeout(pendingTimerRef.current);
      pendingTimerRef.current = null;
    }
    // Clear accumulated text for this new utterance.
    bargeinLatestTextRef.current = '';
    // Safety timer: last resort if the commit timers never fire (e.g. Web Speech
    // stalls and produces no output). Instead of silently discarding, check if
    // Web Speech accumulated any interim text and submit that via the normal
    // classification path. Falls back to gate-clear if nothing was captured.
    if (bargeinSafetyTimerRef.current !== null) {
      clearTimeout(bargeinSafetyTimerRef.current);
    }
    bargeinSafetyTimerRef.current = setTimeout(() => {
      bargeinSafetyTimerRef.current = null;
      const latest = bargeinLatestTextRef.current.trim();
      if (latest && latest.split(/\s+/).length >= 2) {
        bargeinTranscriptFnRef.current?.(latest);
      } else {
        setBargeinPhase('idle');
        void postClearBargein();
      }
    }, 25000);
    setBargeinPhase('listening');
    // Always fire interrupt when speech is detected — even when the debate is
    // technically "over" (is_last was received) but TTS is still playing the
    // final philosopher turn. The server broadcasts stop_audio unconditionally
    // and only gates the debate (barge_in_pending) when a question is active.
    postInterrupt().catch(() => {});
  }, []);

  const handleBargeinTranscript = useCallback((text: string): void => {
    // Cancel any delayed submit that was queued from a previous classification.
    // New speech means the previous result is superseded — discard it.
    if (pendingTimerRef.current !== null) {
      clearTimeout(pendingTimerRef.current);
      pendingTimerRef.current = null;
    }
    // Transcript arrived — cancel the safety timer that would have cleared the
    // gate on timeout (the normal classification path handles gate release now).
    if (bargeinSafetyTimerRef.current !== null) {
      clearTimeout(bargeinSafetyTimerRef.current);
      bargeinSafetyTimerRef.current = null;
    }

    setBargeinPhase('processing');

    const raw = correctPhilosopherNamesPositional(text.trim());
    const prevQuestion = submittedQuestionRef.current;

    if (!raw || raw.split(/\s+/).length < 2) {
      setBargeinPhase('idle');
      void postClearBargein();
      return;
    }

    // Mint a token for this classification request. If a newer transcript arrives
    // before this async chain resolves, the token will no longer match and the
    // stale result is silently dropped.
    const myToken = ++classificationTokenRef.current;

    void (async () => {
      try {
        // Classify the transcript. We do NOT abort the debate here — POST /api/interrupt
        // (fired in onSpeechStart) already set barge_in_pending=True on the backend,
        // which gates GET /api/next-response so no stale philosopher turn can be served
        // while classification is running. startDebate() calls DELETE /api/question
        // internally before POST /api/question, so the abort happens atomically with
        // the new question submission.
        const classification = await postClassifyBargein(raw, prevQuestion);

        // Drop stale result — a newer transcript arrived while we were classifying.
        // The newer call is responsible for releasing the gate.
        if (myToken !== classificationTokenRef.current) return;

        // Build the action to run after the submit delay.  Capturing all values now
        // (before the timer fires) ensures the closure sees consistent state.
        let doSubmit: () => void;

        if (!classification) {
          // LLM failure — submit the raw text directly rather than silently discarding.
          doSubmit = () => { void startDebate(raw, true, true, undefined, false, undefined, raw); };

        } else {
          const { type, corrected_text, instruction_part, addressed_to } = classification;
          // addressed_to is resolved by the classification LLM — handles any phrasing,
          // not just leading-name format ("I have a question for Flusser" → "Flusser").
          const addressed = addressed_to ?? null;

          if (type === 'question') {
            // Always pass corrected_text as bargeInDisplayText so the pink box on the
            // display shows the full corrected input (including philosopher name) rather
            // than whatever the debate engine receives as the question text.
            doSubmit = () => {
              setSubmittedQuestion(corrected_text);
              submittedQuestionRef.current = corrected_text;
              setLiveInstructions([]);
              void startDebate(
                corrected_text, true, true,
                addressed ?? undefined,
                addressed != null,
                undefined,
                corrected_text,
              );
            };

          } else if (type === 'instruction') {
            // Restart with same question. End after addressed philosopher if instruction
            // contains exclusivity words ("only", "just", "alone").
            const instrText = instruction_part ?? corrected_text;
            const q = prevQuestion || corrected_text;
            const endAfter = addressed != null && /\bonly\b|\bjust\b|\balone\b/i.test(instrText);
            doSubmit = () => {
              submittedQuestionRef.current = q;
              setLiveInstructions([corrected_text]);
              void startDebate(q, true, true, addressed ?? undefined, endAfter, instrText, corrected_text);
            };

          } else {
            // 'both': new question, addressed philosopher answers alone then idle.
            const instrText = instruction_part ?? corrected_text;
            doSubmit = () => {
              setSubmittedQuestion(corrected_text);
              submittedQuestionRef.current = corrected_text;
              setLiveInstructions([]);
              void startDebate(corrected_text, true, true, addressed ?? undefined, true, instrText, corrected_text);
            };
          }
        }

        // Delay the submit so the speaker can add more to their question, and so the
        // operator can see the corrected text before it goes live.  New speech arriving
        // in this window will cancel the timer (see top of this callback).
        pendingTimerRef.current = setTimeout(() => {
          pendingTimerRef.current = null;
          setBargeinPhase('idle');
          doSubmit();
        }, BARGE_IN_SUBMIT_DELAY_MS);

      } catch {
        // Unexpected exception — release the barge-in gate so the debate can resume.
        // Without this, barge_in_pending stays true for 10 s until the backend times out.
        setBargeinPhase('idle');
        void postClearBargein();
      }
    })();
  }, [startDebate]);

  // Whisper path: receive audio blob from the hook, transcribe via backend,
  // fall back to Web Speech text if Whisper is unavailable or fails.
  const handleBargeinAudio = useCallback((_blob: Blob, fallbackText: string): void => {
    // Audio collected — cancel the safety timer; the classification path now
    // owns gate release. Use the Web Speech fallback text directly (skip Groq).
    if (bargeinSafetyTimerRef.current !== null) {
      clearTimeout(bargeinSafetyTimerRef.current);
      bargeinSafetyTimerRef.current = null;
    }
    if (!fallbackText.trim()) {
      setBargeinPhase('idle');
      void postClearBargein();
      return;
    }
    handleBargeinTranscript(fallbackText);
  }, [handleBargeinTranscript]);

  // Keep bargeinTranscriptFnRef in sync so the safety timer can call it
  // without a forward-reference dependency from handleBargeinSpeechStart.
  useEffect(() => { bargeinTranscriptFnRef.current = handleBargeinTranscript; }, [handleBargeinTranscript]);

  const { micState, interimTranscript } = useVoiceInput({
    isAudioPlaying: false,
    enabled: bargeinEnabled && !micMuted && !isListening,
    onSpeechStart: handleBargeinSpeechStart,
    onTranscriptReady: handleBargeinTranscript,
    onAudioReady: handleBargeinAudio,
  });

  // Track latest non-empty Web Speech text for the safety timer fallback.
  useEffect(() => {
    if (interimTranscript.trim()) bargeinLatestTextRef.current = interimTranscript;
  }, [interimTranscript]);

  // Push micState to the backend whenever it changes so the philosopher-app
  // display can show the correct indicator color without local mic access.
  useEffect(() => {
    void postMicState(micState);
  }, [micState]);

  function handleSubmit(question: string): void {
    if (!question.trim() || isDebating) return;
    const q = question.trim();
    setSubmittedQuestion(q);
    submittedQuestionRef.current = q;
    setLiveInstructions([]);
    setUserQuestion('');
    void startDebate(q, true);
  }

  function handleHardReset(): void {
    if (pendingTimerRef.current !== null) {
      clearTimeout(pendingTimerRef.current);
      pendingTimerRef.current = null;
    }
    if (bargeinSafetyTimerRef.current !== null) {
      clearTimeout(bargeinSafetyTimerRef.current);
      bargeinSafetyTimerRef.current = null;
    }
    classificationTokenRef.current += 1;
    void postHardReset();
    setIsFastForwarding(false);
    setUserQuestion('');
    setLiveInstructions([]);
    setBargeinPhase('idle');
  }

  function handleClearQuestion(): void {
    void postHardReset();
    void postClearQuestion();
    setIsFastForwarding(false);
    setUserQuestion('');
    setLiveInstructions([]);
    setBargeinPhase('idle');
  }

  function handleTotalReset(): void {
    if (pendingTimerRef.current !== null) {
      clearTimeout(pendingTimerRef.current);
      pendingTimerRef.current = null;
    }
    if (bargeinSafetyTimerRef.current !== null) {
      clearTimeout(bargeinSafetyTimerRef.current);
      bargeinSafetyTimerRef.current = null;
    }
    classificationTokenRef.current += 1;
    setBargeinPhase('idle');
    setUserQuestion('');
    setSubmittedQuestion('');
    setLiveInstructions([]);
    setIsFastForwarding(false);
    void postTotalReset();
  }

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;

      if (e.code === 'Space') {
        if (isDebating) { void abortDebate(); return; }
        if (!isListening) { e.preventDefault(); startVoice(); }
      }
      if (e.key.toUpperCase() === 'P') void postSoftPause();
      if (e.key.toUpperCase() === 'Q') handleHardReset();
      if (e.key.toUpperCase() === 'F' && !isTtsEnabled) {
        setIsFastForwarding(true);
        void postFastForward(true);
      }
      if (e.key.toUpperCase() === 'V') void postToggleTtsMute();
      if (e.key.toUpperCase() === 'C') void postCreditsToggle();
      if (e.key.toUpperCase() === 'H') void postClearHistory();
      if (e.key.toUpperCase() === 'Z') handleClearQuestion();
      if (e.key.toUpperCase() === 'D') void postDeactivateTalking();
      if (e.key.toUpperCase() === 'R' && isDebating) void postRoundUp();
      if (e.key.toUpperCase() === 'X') setMicMuted((m) => !m);
      if (e.key.toUpperCase() === 'B') void postBoot();
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      if (e.code === 'Space' && isListening) {
        e.preventDefault();
        stopVoice();
        setTimeout(() => {
          const raw = transcript.trim();
          if (raw) {
            postCorrectTranscript(raw, submittedQuestionRef.current, null)
              .then((corrected: string) => { void startDebate(corrected, true); })
              .catch(() => { void startDebate(raw, true); });
            resetVoice();
          }
        }, 100);
      }
      if (e.key.toUpperCase() === 'F') {
        setIsFastForwarding(false);
        void postFastForward(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [
    isListening, isDebating, transcript,
    startVoice, stopVoice, resetVoice, abortDebate,
    isTtsEnabled,
  ]);

  const statusClass = isDebating ? styles.active : '';

  return (
    <div className={styles.panel}>

      {/* Status bar */}
      <div className={`${styles.statusBar} ${statusClass}`}>
        <span className={styles.statusDot} />
        <span>
          {isPausePending
            ? '[ pause pending — finishing current speaker ]'
            : isDebating
              ? `[ debating${displayedQuestion ? `: "${displayedQuestion}"` : ''} ]`
              : bargeinPhase === 'listening'
                ? '[ listening... ]'
                : bargeinPhase === 'processing'
                  ? '[ processing... ]'
                  : '[ idle — waiting for question ]'}
        </span>
      </div>

      {/* Input field */}
      <div className={styles.content}>
        {error && <div className={styles.error}>{error}</div>}

        <InputSection
          inputRef={inputRef}
          value={userQuestion}
          onChange={setUserQuestion}
          onSubmit={handleSubmit}
          disabled={isDebating}
          suggestions={debateQuestions}
        />
      </div>

      {/* Hints — directly below input */}
      <div className={styles.hints}>
        <span>Hold F to speed up (no voice)</span>
        <span>Hold SPACE to record a question</span>
      </div>

      {/* Button grid */}
      <div className={styles.buttonGrid}>

        {/* Emergency reset — clears ALL state including history */}
        <button
          className={styles.totalResetButton}
          onClick={handleTotalReset}
          title="Nuclear reset: clears all state, history, and pending inputs. Use when system is stuck."
        >
          TOTAL RESET
        </button>

        {/* Row 1: Image sets */}
        <div className={styles.buttonRow}>
          {([1, 2, 3, 4] as const).map((set) => (
            <button
              key={set}
              className={`${styles.gridBtn} ${imageSet === set ? styles.gridBtnActiveYellow : ''}`}
              onClick={() => { setImageSet(set); void postImageSet(set); }}
              title={`Image set ${set} (shortcut: ${set})`}
            >
              <div className={styles.gridBtnSymbol}>{set}</div>
              <div className={styles.gridBtnLabel}>SET {set}</div>
            </button>
          ))}
        </div>

        {/* Row 2: Toggles */}
        <div className={styles.buttonRow}>
          <button
            className={`${styles.gridBtn} ${status.tts_muted ? styles.gridBtnActiveRed : styles.gridBtnActiveGreen}`}
            onClick={() => void postToggleTtsMute()}
            title="Mute/unmute TTS audio output (shortcut: V)"
          >
            <div className={styles.gridBtnSymbol}>V</div>
            <div className={styles.gridBtnLabel}>VOICE</div>
            <div className={`${styles.gridBtnStatus} ${status.tts_muted ? styles.gridBtnStatusRed : styles.gridBtnStatusGreen}`}>
              {status.tts_muted ? 'MUTED' : 'ON'}
            </div>
          </button>

          <button
            className={`${styles.gridBtn} ${micMuted ? styles.gridBtnActiveRed : ''}`}
            onClick={() => setMicMuted((m) => !m)}
            title="Mute/unmute barge-in microphone (shortcut: X)"
          >
            <div className={styles.gridBtnSymbol}>X</div>
            <div className={styles.gridBtnLabel}>MIC</div>
            <div className={`${styles.gridBtnStatus} ${micMuted ? styles.gridBtnStatusRed : styles.gridBtnStatusGreen}`}>
              {micMuted ? 'MUTED' : 'ON'}
            </div>
          </button>
        </div>

        {/* Row 3: Utility */}
        <div className={styles.buttonRow}>
          <button
            className={styles.gridBtn}
            onClick={() => void postCreditsToggle()}
            title="Toggle credits on display (shortcut: C)"
          >
            <div className={styles.gridBtnSymbol}>C</div>
            <div className={styles.gridBtnLabel}>CREDITS</div>
          </button>

          <button
            className={styles.gridBtn}
            onClick={() => void postClearHistory()}
            title="Clear conversation history on display (shortcut: H)"
          >
            <div className={styles.gridBtnSymbol}>H</div>
            <div className={styles.gridBtnLabel}>CLR HIST</div>
          </button>

          <button
            className={styles.gridBtn}
            onClick={handleClearQuestion}
            title="Clear question from display (shortcut: Z)"
          >
            <div className={styles.gridBtnSymbol}>Z</div>
            <div className={styles.gridBtnLabel}>CLR Q</div>
          </button>

          <button
            className={styles.gridBtn}
            onClick={() => void postBoot()}
            title="Trigger boot animation on display (shortcut: B)"
          >
            <div className={styles.gridBtnSymbol}>B</div>
            <div className={styles.gridBtnLabel}>BOOT</div>
          </button>
        </div>

        {/* Row 4: Playback */}
        <div className={styles.buttonRow}>
          <button
            className={`${styles.gridBtn} ${isPausePending ? styles.gridBtnActiveBlue : ''}`}
            onClick={() => void postSoftPause()}
            title="Soft pause — finishes current speaker then stops (shortcut: P)"
          >
            <div className={styles.gridBtnSymbol}>P</div>
            <div className={styles.gridBtnLabel}>{isPausePending ? 'PAUSING' : 'PAUSE'}</div>
          </button>

          <button
            className={styles.gridBtn}
            onClick={handleHardReset}
            title="Hard reset — stop audio + typewriter, keep text (shortcut: Q)"
          >
            <div className={styles.gridBtnSymbol}>Q</div>
            <div className={styles.gridBtnLabel}>HARD RESET</div>
          </button>

          <button
            className={`${styles.gridBtn} ${isFastForwarding ? styles.gridBtnActiveRed : ''}`}
            onMouseDown={() => { if (!isTtsEnabled) { setIsFastForwarding(true); void postFastForward(true); } }}
            onMouseUp={() => { setIsFastForwarding(false); void postFastForward(false); }}
            onMouseLeave={() => { setIsFastForwarding(false); void postFastForward(false); }}
            title="Fast-forward (hold — shortcut: F)"
          >
            <div className={styles.gridBtnSymbol}>F</div>
            <div className={styles.gridBtnLabel}>FAST-FWD</div>
          </button>

          <button
            className={`${styles.gridBtn} ${isRoundUpPending ? styles.gridBtnActiveBlue : ''}`}
            onClick={() => void postRoundUp()}
            disabled={!isDebating}
            title="Round up — Weibel closes with summary (shortcut: R)"
          >
            <div className={styles.gridBtnSymbol}>R</div>
            <div className={styles.gridBtnLabel}>{isRoundUpPending ? 'ROUNDING UP' : 'ROUND UP'}</div>
          </button>

          <button
            className={styles.gridBtn}
            onClick={() => void postDeactivateTalking()}
            title="Force all philosopher GIFs to idle (shortcut: D)"
          >
            <div className={styles.gridBtnSymbol}>D</div>
            <div className={styles.gridBtnLabel}>DEACT. TALK</div>
          </button>
        </div>

      </div>

      {/* Remaining content */}
      <div className={styles.content}>
        {isListening && (
          <div className={styles.voiceCapture}>
            {!transcript.trim()
              ? `● RECORDING ${'.'.repeat(dotCount)}`
              : transcript}
          </div>
        )}

        {liveInstructions.length > 0 && isDebating && (
          <div className={styles.liveInstruction}>
            ▸ {liveInstructions[liveInstructions.length - 1]}
          </div>
        )}

        <MicIndicator
          micState={micState}
          interimTranscript={interimTranscript}
        />
      </div>
    </div>
  );
}

export default App;

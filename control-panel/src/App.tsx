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

const PHILOSOPHER_NAMES_LOWER = ['flusser', 'virilio', 'weizenbaum', 'weibel'] as const;

/** Extracts a philosopher name when it appears ANYWHERE in text (for instructions). */
function extractAddressedPhilosopher(text: string | null | undefined): string | null {
  if (!text) return null;
  const lower = text.toLowerCase();
  for (const name of PHILOSOPHER_NAMES_LOWER) {
    if (lower.startsWith(name) || new RegExp(`\\b${name}\\b`).test(lower)) {
      return name.charAt(0).toUpperCase() + name.slice(1);
    }
  }
  return null;
}

/** Extracts a philosopher name only when the text STARTS with that name (for directed questions). */
function extractLeadingPhilosopher(text: string | null | undefined): string | null {
  if (!text) return null;
  const lower = text.toLowerCase().trim();
  for (const name of PHILOSOPHER_NAMES_LOWER) {
    if (lower.startsWith(name)) {
      return name.charAt(0).toUpperCase() + name.slice(1);
    }
  }
  return null;
}
import styles from './App.module.css';
import './App.css';

function App() {
  const [debateQuestions, setDebateQuestions] = useState<string[]>([]);
  const [userQuestion, setUserQuestion] = useState('');
  const [submittedQuestion, setSubmittedQuestion] = useState('');
  const [isFastForwarding, setIsFastForwarding] = useState(false);
  const [isTtsEnabled, setIsTtsEnabled] = useState(false);
  const [bargeinEnabled, setBargeinEnabled] = useState(true);
  const [micMuted, setMicMuted] = useState(true);
  const [liveInstructions, setLiveInstructions] = useState<string[]>([]);
  const [isPreparingQuestion, setIsPreparingQuestion] = useState(false);
  const [imageSet, setImageSet] = useState<1 | 2 | 3 | 4>(1);

  const inputRef = useRef<HTMLInputElement>(null);
  const submittedQuestionRef = useRef('');

  const status = useStatus();
  const isDebating = status.active;
  const isDebatingRef = useRef(isDebating);
  useEffect(() => { isDebatingRef.current = isDebating; }, [isDebating]);
  const isPausePending = status.is_pause_pending;
  const isRoundUpPending = status.is_round_up_pending;

  const { error, startDebate, abortDebate } = useDebate();

  useEffect(() => {
    if (!isDebating) {
      setSubmittedQuestion('');
      submittedQuestionRef.current = '';
    }
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
    if (isDebatingRef.current) {
      postInterrupt().catch(() => {});
    }
  }, []);

  const handleBargeinTranscript = useCallback((text: string): void => {
    const raw = text.trim();
    const prevQuestion = submittedQuestionRef.current;
    const wasDebating = isDebatingRef.current;

    if (!raw || raw.split(/\s+/).length < 3) {
      void postClearBargein();
      return;
    }

    void (async () => {
      // Classify the transcript. We do NOT abort the debate here — POST /api/interrupt
      // (fired in onSpeechStart) already set barge_in_pending=True on the backend,
      // which gates GET /api/next-response so no stale philosopher turn can be served
      // while classification is running. Calling abortDebate() concurrently was
      // setting current_question_id=None, which caused the gate to be bypassed
      // (the 404 check fires before the gate), resulting in the display sleeping
      // for 5 s before picking up the new debate. startDebate() already calls
      // DELETE /api/question internally before POST /api/question, so the abort
      // happens atomically with the new question submission.
      const classification = await postClassifyBargein(raw, prevQuestion);

      if (!classification || classification.likely_echo) {
        if (wasDebating && prevQuestion) {
          void startDebate(prevQuestion, true, false);
        } else {
          void postClearBargein();
        }
        return;
      }

      const { type, corrected_text, question_part, instruction_part } = classification;
      // For instructions: extract philosopher from anywhere in the text.
      // For questions: only treat as directed if the philosopher name LEADS the
      // question (e.g. "Virilio, what is AI?" → solo Virilio), consistent with
      // how the backend's text-prefix detection works.
      const addressed = type === 'question'
        ? extractLeadingPhilosopher(question_part ?? corrected_text)
        : extractAddressedPhilosopher(instruction_part ?? corrected_text);

      if (type === 'question') {
        const q = question_part ?? corrected_text;
        setSubmittedQuestion(q);
        submittedQuestionRef.current = q;
        setLiveInstructions([]);
        setIsPreparingQuestion(false);
        // If the question is directed at a specific philosopher (leading name),
        // that philosopher answers alone then the session goes idle — same
        // behaviour as a typed directed question ("Virilio, what is AI?").
        void startDebate(q, true, true, addressed ?? undefined, addressed != null ? true : false);

      } else if (type === 'instruction') {
        // Instruction: restart with same question.
        // End after addressed philosopher if instruction contains exclusivity words ("only", "just", "alone").
        // Otherwise debate continues so the addressed philosopher speaks first then others join.
        // Everything is sent atomically in POST /api/question — no race condition.
        const instrText = instruction_part ?? corrected_text;
        const q = prevQuestion || corrected_text;
        const endAfter = addressed != null && /\bonly\b|\bjust\b|\balone\b/i.test(instrText);
        void startDebate(q, true, true, addressed ?? undefined, endAfter, instrText, corrected_text);
        setLiveInstructions([corrected_text]);

      } else {
        // 'both': new question, addressed philosopher answers alone then idle.
        // Everything atomic in POST /api/question.
        const q = question_part ?? corrected_text;
        const instrText = instruction_part ?? corrected_text;
        setSubmittedQuestion(q);
        submittedQuestionRef.current = q;
        setLiveInstructions([]);
        setIsPreparingQuestion(false);
        void startDebate(q, true, true, addressed ?? undefined, true, instrText, q);
      }
    })();
  }, [abortDebate, startDebate]);

  const { micState, interimTranscript } = useVoiceInput({
    isAudioPlaying: false,
    enabled: bargeinEnabled && !micMuted && !isListening,
    onSpeechStart: handleBargeinSpeechStart,
    onTranscriptReady: handleBargeinTranscript,
  });

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
    void postHardReset();
    setIsFastForwarding(false);
    setUserQuestion('');
    setLiveInstructions([]);
    setIsPreparingQuestion(false);
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
      if (e.key.toUpperCase() === 'Z') void postClearQuestion();
      if (e.key.toUpperCase() === 'D') void postDeactivateTalking();
      if (e.key.toUpperCase() === 'R' && isDebating) void postRoundUp();
      if (e.key.toUpperCase() === 'X') setMicMuted((m) => { void postMicState(m); return !m; });
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
              ? `[ debating${submittedQuestion ? `: "${submittedQuestion}"` : ''} ]`
              : '[ idle — waiting for question ]'}
          {isPreparingQuestion && ' — processing barge-in...'}
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
            onClick={() => { const newMuted = !micMuted; setMicMuted(newMuted); void postMicState(!newMuted); }}
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
            onClick={() => void postClearQuestion()}
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

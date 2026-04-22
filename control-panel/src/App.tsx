import { useState, useEffect, useRef, useCallback } from 'react';
import InputSection from './components/InputSection';
import AudienceInput, { type AudienceInputHandle } from './components/AudienceInput';
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
} from './api';
import { BARGE_IN_SUBMIT_DELAY_MS, parseAddressedTo } from './constants';
import styles from './App.module.css';
import './App.css';

function App() {
  const [debateQuestions, setDebateQuestions] = useState<string[]>([]);
  const [userQuestion, setUserQuestion] = useState('');
  const [submittedQuestion, setSubmittedQuestion] = useState('');
  const [isFastForwarding, setIsFastForwarding] = useState(false);
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(true);
  const [isButtonsVisible, setIsButtonsVisible] = useState(false);
  const [isTtsEnabled, setIsTtsEnabled] = useState(false);
  const [bargeinEnabled, setBargeinEnabled] = useState(true);
  const [micMuted, setMicMuted] = useState(true);
  const [bargeinMode, setBargeinMode] = useState<'moderator' | 'audience' | 'live'>('live');
  const [liveInstructions, setLiveInstructions] = useState<string[]>([]);
  const [isPreparingQuestion, setIsPreparingQuestion] = useState(false);
  const [bargeinTranscript, setBargeinTranscript] = useState('');
  const [imageSet, setImageSet] = useState<1 | 2 | 3 | 4>(1);

  const inputRef = useRef<HTMLInputElement>(null);
  const audienceInputRef = useRef<AudienceInputHandle>(null);
  const submittedQuestionRef = useRef('');

  const status = useStatus();
  const isDebating = status.active;
  const awaitingAudienceInput = status.awaiting_audience_input;
  const isPausePending = status.is_pause_pending;
  const isRoundUpPending = status.is_round_up_pending;

  const { error, startDebate, abortDebate, sendLiveInstruction, handleAudienceQuestion } = useDebate();

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
    postInterrupt().catch(() => {});
  }, []);

  const handleBargeinTranscript = useCallback((text: string): void => {
    const raw = text.trim();
    if (!raw || raw.split(/\s+/).length < 3) return;

    if (bargeinMode === 'live') {
      void (async () => {
        const accepted = await sendLiveInstruction(
          raw,
          submittedQuestionRef.current,
          null,
        ).catch(() => null);
        if (accepted) setLiveInstructions([accepted]);
      })();
    } else {
      void abortDebate();
      setBargeinTranscript('');
      setLiveInstructions([]);
      setIsPreparingQuestion(true);
      postCorrectTranscript(raw, submittedQuestionRef.current, null)
        .then((corrected: string) => {
          setIsPreparingQuestion(false);
          void startDebate(corrected, isVoiceEnabled);
        })
        .catch(() => {
          setIsPreparingQuestion(false);
          void startDebate(raw, isVoiceEnabled);
        });
    }
  }, [bargeinMode, sendLiveInstruction, abortDebate, startDebate, isVoiceEnabled]);

  const { micState, interimTranscript } = useVoiceInput({
    isAudioPlaying: false,
    enabled: bargeinEnabled && !micMuted && isDebating && !awaitingAudienceInput && !isListening,
    onSpeechStart: handleBargeinSpeechStart,
    onTranscriptReady: handleBargeinTranscript,
  });

  useEffect(() => {
    if (!awaitingAudienceInput || !bargeinTranscript) return;
    const timer = setTimeout(() => {
      void handleAudienceQuestion(bargeinTranscript, parseAddressedTo(bargeinTranscript), false);
      setBargeinTranscript('');
    }, BARGE_IN_SUBMIT_DELAY_MS);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [awaitingAudienceInput, bargeinTranscript]);

  function handleSubmit(question: string): void {
    if (!question.trim() || isDebating) return;
    const q = question.trim();
    setSubmittedQuestion(q);
    submittedQuestionRef.current = q;
    setBargeinTranscript('');
    setLiveInstructions([]);
    setUserQuestion('');
    void startDebate(q, isVoiceEnabled);
  }

  function handleHardReset(): void {
    void postHardReset();
    setIsFastForwarding(false);
    setUserQuestion('');
    setBargeinTranscript('');
    setLiveInstructions([]);
    setIsPreparingQuestion(false);
  }

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;

      if (awaitingAudienceInput) {
        if (e.code === 'Space') {
          e.preventDefault();
          audienceInputRef.current?.toggleVoice();
        }
        return;
      }

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
      if (e.key.toUpperCase() === 'V') setIsVoiceEnabled((v) => !v);
      if (e.key.toUpperCase() === 'C') void postCreditsToggle();
      if (e.key.toUpperCase() === 'H') void postClearHistory();
      if (e.key.toUpperCase() === 'Z') void postClearQuestion();
      if (e.key.toUpperCase() === 'D') void postDeactivateTalking();
      if (e.key.toUpperCase() === 'R') void postRoundUp();
      if (e.key.toUpperCase() === 'A') setBargeinMode((m) => (m === 'audience' ? 'live' : 'audience'));
      if (e.key.toUpperCase() === 'M') setBargeinMode((m) => (m === 'moderator' ? 'live' : 'moderator'));
      if (e.key.toUpperCase() === 'X') setMicMuted((m) => !m);
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
              .then((corrected: string) => { void startDebate(corrected, isVoiceEnabled); })
              .catch(() => { void startDebate(raw, isVoiceEnabled); });
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
    isVoiceEnabled, awaitingAudienceInput, isTtsEnabled,
  ]);

  const statusClass = isDebating
    ? awaitingAudienceInput ? styles.awaiting : styles.active
    : '';

  return (
    <div className={styles.panel}>

      {/* Status bar */}
      <div className={`${styles.statusBar} ${statusClass}`}>
        <span className={styles.statusDot} />
        <span>
          {isPausePending
            ? '[ pause pending — finishing current speaker ]'
            : isDebating
              ? awaitingAudienceInput
                ? '[ awaiting audience question ]'
                : `[ debating${submittedQuestion ? `: "${submittedQuestion}"` : ''} ]`
              : '[ idle — waiting for question ]'}
          {isPreparingQuestion && ' — processing barge-in...'}
        </span>
      </div>

      {/* Input field */}
      <div className={styles.content}>
        {error && <div className={styles.error}>{error}</div>}

        {!awaitingAudienceInput && (
          <InputSection
            inputRef={inputRef}
            value={userQuestion}
            onChange={setUserQuestion}
            onSubmit={handleSubmit}
            disabled={isDebating}
            suggestions={debateQuestions}
          />
        )}
      </div>

      {/* Hints — directly below input */}
      <div className={styles.hints}>
        <span>Hold F to speed up (no voice)</span>
        <span>VOICE: {isVoiceEnabled ? 'ON' : 'OFF'}</span>
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
            className={`${styles.gridBtn} ${isVoiceEnabled ? styles.gridBtnActiveGreen : ''}`}
            onClick={() => setIsVoiceEnabled((v) => !v)}
            title={`Voice ${isVoiceEnabled ? 'ON' : 'OFF'} (shortcut: V)`}
          >
            <div className={styles.gridBtnSymbol}>V</div>
            <div className={styles.gridBtnLabel}>VOICE</div>
            <div className={`${styles.gridBtnStatus} ${isVoiceEnabled ? styles.gridBtnStatusGreen : styles.gridBtnStatusRed}`}>
              {isVoiceEnabled ? 'ON' : 'OFF'}
            </div>
          </button>

          <button
            className={`${styles.gridBtn} ${isButtonsVisible ? styles.gridBtnActiveWhite : ''}`}
            onClick={() => setIsButtonsVisible((v) => !v)}
            title="Toggle input buttons visibility (shortcut: B)"
          >
            <div className={styles.gridBtnSymbol}>B</div>
            <div className={styles.gridBtnLabel}>HIDE</div>
            <div className={`${styles.gridBtnStatus} ${isButtonsVisible ? styles.gridBtnStatusGreen : styles.gridBtnStatusDim}`}>
              {isButtonsVisible ? 'ON' : 'OFF'}
            </div>
          </button>

          <button
            className={`${styles.gridBtn} ${bargeinMode === 'audience' ? styles.gridBtnActiveWhite : ''}`}
            onClick={() => setBargeinMode((m) => (m === 'audience' ? 'live' : 'audience'))}
            title="Barge-in submits as audience question (shortcut: A)"
          >
            <div className={styles.gridBtnSymbol}>A</div>
            <div className={styles.gridBtnLabel}>AUD Q</div>
            <div className={`${styles.gridBtnStatus} ${bargeinMode === 'audience' ? styles.gridBtnStatusGreen : styles.gridBtnStatusDim}`}>
              {bargeinMode === 'audience' ? 'ON' : 'OFF'}
            </div>
          </button>

          <button
            className={`${styles.gridBtn} ${bargeinMode === 'moderator' ? styles.gridBtnActiveWhite : ''}`}
            onClick={() => setBargeinMode((m) => (m === 'moderator' ? 'live' : 'moderator'))}
            title="Barge-in restarts debate with moderator question (shortcut: M)"
          >
            <div className={styles.gridBtnSymbol}>M</div>
            <div className={styles.gridBtnLabel}>MOD Q</div>
            <div className={`${styles.gridBtnStatus} ${bargeinMode === 'moderator' ? styles.gridBtnStatusGreen : styles.gridBtnStatusDim}`}>
              {bargeinMode === 'moderator' ? 'ON' : 'OFF'}
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
            onClick={() => void postClearQuestion()}
            title="Clear question from display (shortcut: Z)"
          >
            <div className={styles.gridBtnSymbol}>Z</div>
            <div className={styles.gridBtnLabel}>CLR Q</div>
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

        {awaitingAudienceInput && (
          <AudienceInput
            ref={audienceInputRef}
            onSubmit={handleAudienceQuestion}
            contextQuestion={submittedQuestion}
          />
        )}

        {liveInstructions.length > 0 && isDebating && (
          <div className={styles.liveInstruction}>
            ▸ {liveInstructions[liveInstructions.length - 1]}
          </div>
        )}

        <MicIndicator
          micState={micState}
          interimTranscript={interimTranscript}
          pendingTranscript={bargeinTranscript || undefined}
        />
      </div>
    </div>
  );
}

export default App;

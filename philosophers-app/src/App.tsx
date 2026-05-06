import { useState, useEffect, useCallback, useRef } from 'react';
import BootScreen from './components/BootScreen';
import Credits from './components/Credits';
import DiscussionLog from './components/DiscussionLog';
import SubtitleView from './components/SubtitleView';
import Typewriter from './components/Typewriter';
import ImageGrid from './components/ImageGrid';
import { useDebate } from './hooks/useDebate';
import { useStatus } from './hooks/useStatus';
import { useEvents } from './hooks/useEvents';
import { BASE_URL } from './constants';
import styles from './App.module.css';
import './App.css';

function App() {
  const [isBooting, setIsBooting] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  // Refs so polling closures always read the latest values without re-subscribing
  const hasStartedRef = useRef(false);
  const isBootingRef = useRef(false);
  const [bootDismissSignal, setBootDismissSignal] = useState(false);

  // Stable reference prevents BootScreen's useEffect from re-firing on every re-render
  const handleBootDone = useCallback(() => {
    hasStartedRef.current = true;
    isBootingRef.current = false;
    setBootDismissSignal(false);
    setHasStarted(true);
    setIsBooting(false);
  }, []);

  const {
    barge_in_active,
    bargein_display_text,
    image_set,
    current_question,
    question_id,
    is_fast_forwarding,
    is_pause_pending,
    credits_open,
    hard_reset_seq,
    deactivate_talking_seq,
    clear_history_seq,
    clear_question_seq,
    tts_muted,
    stop_audio_seq,
    mic_state,
  } = useStatus(50);

  const {
    finishedLines,
    currentLine,
    currentPhilosopher,
    thinkingName,
    interruptingName,
    isDebating,
    error,
    setTtsMuted,
    subtitleChunk,
    resolveQuestionTypewriter,
    startPassiveLoop,
    setPausePending,
    triggerHardReset,
    deactivateTalking,
    resetForNewQuestion,
    resetForBargein,
    clearHistory,
    ragRelevanceMap,
    notifyQuestionId,
  } = useDebate();

  // When the controls app submits a new question, stop old audio and restart
  // the passive loop immediately — don't wait for old TTS to finish playing.
  // Set to true the moment question_id changes so the old question text is blanked
  // immediately, before the next poll returns the new question text.
  const [questionSwitching, setQuestionSwitching] = useState(false);

  const prevQuestionIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (question_id && question_id !== prevQuestionIdRef.current) {
      // Always track the latest active question_id so the second+ questions
      // correctly trigger resetForNewQuestion when they arrive mid-debate.
      const hadPrev = prevQuestionIdRef.current !== null;
      prevQuestionIdRef.current = question_id;
      if (hadPrev) {
        resetForNewQuestion();
        setQuestionSwitching(true);
      }
    }
  // resetForNewQuestion is stable (uses only refs internally)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question_id]);

  // Keep the passive loop's stale-detection ref in sync with the current question_id.
  useEffect(() => {
    notifyQuestionId(question_id);
  }, [question_id, notifyQuestionId]);

  // Track question revisions for barge-in typewriter animation:
  // revision 1 = first appearance (static), revision 2+ = barge-in replacement (typewriter)
  const [questionRevision, setQuestionRevision] = useState(0);
  const prevQuestionRef = useRef('');

  useEffect(() => {
    if (current_question && current_question !== prevQuestionRef.current) {
      prevQuestionRef.current = current_question;
      setQuestionRevision((r) => r + 1);
      setQuestionSwitching(false);
    }
  }, [current_question]);

  // Rising edge of barge_in_active → stop audio, discard any pre-fetched (possibly
  // already-resolved) response, abort the passive loop and restart it clean.
  // Using resetForBargein() (which calls startPassiveLoop() internally) guarantees
  // that a resolved prefetch for the OLD philosopher can never be consumed by the loop
  // after the loop is restarted — the new loop has no prefetch and blocks on the
  // barge-in gate until the new question is submitted.
  const prevBargeinActiveRef = useRef(false);
  useEffect(() => {
    if (barge_in_active && !prevBargeinActiveRef.current) {
      resetForBargein();
    }
    prevBargeinActiveRef.current = barge_in_active;
  }, [barge_in_active, resetForBargein]);

  // SSE deduplication — track which seq values were already handled via the SSE
  // stream so the status-poll fallback below doesn't double-fire on the same event.
  const lastHandledStopAudioSeqRef = useRef(stop_audio_seq);
  const lastHandledHardResetSeqRef = useRef(hard_reset_seq);

  useEvents({
    onStopAudio: useCallback((seq: number) => {
      lastHandledStopAudioSeqRef.current = seq;
      resetForBargein();
    }, [resetForBargein]),
    onReset: useCallback((seq: number) => {
      lastHandledHardResetSeqRef.current = seq;
      triggerHardReset();
    }, [triggerHardReset]),
  });

  // Rising edge of stop_audio_seq — 50 ms status-poll fallback for when the SSE
  // stream wasn't connected or the event was missed.
  const prevStopAudioSeqRef = useRef(stop_audio_seq);
  useEffect(() => {
    if (stop_audio_seq !== prevStopAudioSeqRef.current) {
      prevStopAudioSeqRef.current = stop_audio_seq;
      if (stop_audio_seq !== lastHandledStopAudioSeqRef.current) {
        resetForBargein();
      }
    }
  }, [stop_audio_seq, resetForBargein]);

  // Track bargein_display_text changes for typewriter animation in the pink box
  const [bargeinDisplayRevision, setBargeinDisplayRevision] = useState(0);
  const prevBargeinDisplayRef = useRef('');
  useEffect(() => {
    if (bargein_display_text && bargein_display_text !== prevBargeinDisplayRef.current) {
      prevBargeinDisplayRef.current = bargein_display_text;
      setBargeinDisplayRevision((r) => r + 1);
    }
    if (!bargein_display_text) {
      prevBargeinDisplayRef.current = '';
    }
  }, [bargein_display_text]);

  // Sync TTS mute flag into the debate hook (stops audio immediately when muted)
  useEffect(() => {
    setTtsMuted(tts_muted);
  }, [tts_muted, setTtsMuted]);

  // Sync soft-pause flag into the passive loop
  useEffect(() => {
    setPausePending(is_pause_pending);
  }, [is_pause_pending, setPausePending]);

  // React to hard-reset signal from controls (50 ms status-poll fallback).
  const prevHardResetSeqRef = useRef(hard_reset_seq);
  useEffect(() => {
    if (hard_reset_seq !== prevHardResetSeqRef.current) {
      prevHardResetSeqRef.current = hard_reset_seq;
      if (hard_reset_seq !== lastHandledHardResetSeqRef.current) {
        triggerHardReset();
      }
    }
  }, [hard_reset_seq, triggerHardReset]);

  // React to deactivate-talking signal from controls
  const prevDeactivateTalkingRef = useRef(deactivate_talking_seq);
  useEffect(() => {
    if (deactivate_talking_seq !== prevDeactivateTalkingRef.current) {
      prevDeactivateTalkingRef.current = deactivate_talking_seq;
      deactivateTalking();
    }
  }, [deactivate_talking_seq, deactivateTalking]);

  // React to clear-history signal from controls
  const prevClearHistoryRef = useRef(clear_history_seq);
  useEffect(() => {
    if (clear_history_seq !== prevClearHistoryRef.current) {
      prevClearHistoryRef.current = clear_history_seq;
      clearHistory();
    }
  }, [clear_history_seq, clearHistory]);

  // React to clear-question signal from controls
  const [questionHidden, setQuestionHidden] = useState(false);
  const prevClearQuestionRef = useRef(clear_question_seq);
  useEffect(() => {
    if (clear_question_seq !== prevClearQuestionRef.current) {
      prevClearQuestionRef.current = clear_question_seq;
      setQuestionHidden(true);
    }
  }, [clear_question_seq]);

  // Reset questionHidden when a new question arrives
  useEffect(() => {
    if (current_question) setQuestionHidden(false);
  }, [current_question]);

  // React to boot signal from controls — re-show the boot animation.
  // Self-contained poll: uses a local closure variable so React state/ref
  // propagation timing cannot swallow the change.
  useEffect(() => {
    let prevSeq = -1;
    let cancelled = false;

    const checkBoot = async (): Promise<void> => {
      if (cancelled) return;
      try {
        const res = await fetch(`${BASE_URL}status`, {
          signal: AbortSignal.timeout(3000),
        });
        if (cancelled || !res.ok) return;
        const data = await res.json() as { boot_seq?: number };
        const seq = typeof data.boot_seq === 'number' ? data.boot_seq : -1;
        if (seq >= 0) {
          if (prevSeq >= 0 && seq !== prevSeq) {
            if (isBootingRef.current) {
              // Second boot signal while boot screen is showing → dismiss it
              setBootDismissSignal(true);
            } else {
              // Boot signal → show the boot screen (works at any time, incl. after hasStarted)
              isBootingRef.current = true;
              hasStartedRef.current = false;
              setBootDismissSignal(false);
              setHasStarted(false);
              setIsBooting(true);
            }
          }
          prevSeq = seq;
        }
      } catch { /* ignore */ }
    };

    void checkBoot();
    const id = setInterval(() => void checkBoot(), 500);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    startPassiveLoop();
  // startPassiveLoop is stable (defined inside useDebate without dependencies)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isPendingFirstResponse = !!question_id && !isDebating && !currentPhilosopher && !thinkingName;

  const allThinking =
    (isDebating || isPendingFirstResponse) &&
    !thinkingName &&
    !currentPhilosopher &&
    !currentLine;

  return (
    <main
      className={styles.appContainer}
      aria-busy={hasStarted && (!!thinkingName || isDebating)}
    >
      {isBooting && <BootScreen onDone={handleBootDone} dismissSignal={bootDismissSignal} />}

      {hasStarted && (
        <>
          {credits_open && (
            <Credits onClose={() => void fetch(`${BASE_URL}credits`, { method: 'POST' })} />
          )}

          <ImageGrid
            imageSet={image_set}
            onImageSetChange={() => {}}
            typingPhilosopher={currentPhilosopher}
            thinkingName={thinkingName}
            interruptingName={interruptingName}
            currentPhilosopher={currentPhilosopher}
            isPaused={false}
            ragRelevanceMap={ragRelevanceMap}
            allThinking={allThinking}
          />

          {error && (
            <div className={styles.errorMessage} role="alert">
              {error}
            </div>
          )}

          {(() => {
            // Suppress ALL question text the moment the user starts speaking or barge-in is active,
            // including any bargein_display_text left over from the previous exchange.
            const bargeinInProgress = mic_state === 'speaking' || barge_in_active;
            const displayText = (!bargeinInProgress && bargein_display_text) || (current_question && !questionHidden && !questionSwitching && !bargeinInProgress ? current_question : '');
            if (!displayText) return null;
            const isBargein = !!bargein_display_text;
            const revision = isBargein ? bargeinDisplayRevision : questionRevision;
            return (
              <div className={styles.userQuestion}>
                {revision > 1 ? (
                  <Typewriter
                    key={`${isBargein ? 'bargein' : 'question'}-${revision}`}
                    text={displayText}
                    onComplete={isBargein ? undefined : resolveQuestionTypewriter}
                    wordByWord
                  />
                ) : (
                  displayText
                )}
              </div>
            );
          })()}

          {mic_state === 'speaking' ? (
            <div className={styles.deliberating} aria-live="polite">
              [ listening... ]
            </div>
          ) : barge_in_active ? (
            <div className={styles.deliberating} aria-live="polite">
              [ processing... ]
            </div>
          ) : !isDebating && !isPendingFirstResponse && !thinkingName && !currentPhilosopher ? (
            <div className={styles.deliberating} aria-live="polite">
              [ waiting for a new question... ]
            </div>
          ) : null}

          {subtitleChunk ? (
            <SubtitleView chunk={subtitleChunk} />
          ) : (
            <DiscussionLog
              finishedLines={finishedLines}
              currentLine={currentLine}
              isFastForwarding={is_fast_forwarding}
              isPaused={false}
            />
          )}
        </>
      )}

      {/* Mic status dot — red=off, orange=warming up, green=ready, blue=speaking */}
      <div
        style={{
          position: 'fixed',
          bottom: '12px',
          right: '12px',
          width: '10px',
          height: '10px',
          borderRadius: '50%',
          backgroundColor:
            mic_state === 'speaking' ? '#2288ff' :
            mic_state === 'ready'    ? '#00cc44' :
            mic_state === 'warming'  ? '#ff8800' :
            '#cc2200',
          opacity: 0.75,
          transition: 'background-color 0.3s ease',
          zIndex: 9999,
        }}
        title={
          mic_state === 'speaking' ? 'Mic: hearing input' :
          mic_state === 'ready'    ? 'Mic: ready' :
          mic_state === 'warming'  ? 'Mic: warming up' :
          'Mic: off'
        }
      />
    </main>
  );
}

export default App;

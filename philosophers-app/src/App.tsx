import { useState, useEffect, useCallback, useRef } from 'react';
import BootScreen from './components/BootScreen';
import Credits from './components/Credits';
import DiscussionLog from './components/DiscussionLog';
import MicIndicator from './components/MicIndicator';
import SubtitleView from './components/SubtitleView';
import Typewriter from './components/Typewriter';
import ImageGrid from './components/ImageGrid';
import { useDebate } from './hooks/useDebate';
import { useStatus } from './hooks/useStatus';
import { BASE_URL } from './constants';
import styles from './App.module.css';
import './App.css';

function App() {
  const [isBooting, setIsBooting] = useState(true);

  // Stable reference prevents BootScreen's useEffect from re-firing on every re-render
  const handleBootDone = useCallback(() => setIsBooting(false), []);

  const {
    barge_in_active,
    image_set,
    current_question,
    question_id,
    is_fast_forwarding,
    is_pause_pending,
    credits_open,
    hard_reset_seq,
    deactivate_talking_seq,
  } = useStatus(500);

  const {
    finishedLines,
    currentLine,
    currentPhilosopher,
    thinkingName,
    interruptingName,
    isDebating,
    error,
    awaitingAudienceInput,
    subtitleChunk,
    resolveQuestionTypewriter,
    startPassiveLoop,
    setPausePending,
    triggerHardReset,
    deactivateTalking,
    resetForNewQuestion,
    ragRelevanceMap,
  } = useDebate();

  // When the controls app submits a new question, stop old audio and restart
  // the passive loop immediately — don't wait for old TTS to finish playing.
  const prevQuestionIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (question_id && question_id !== prevQuestionIdRef.current) {
      // Always track the latest active question_id so the second+ questions
      // correctly trigger resetForNewQuestion when they arrive mid-debate.
      const hadPrev = prevQuestionIdRef.current !== null;
      prevQuestionIdRef.current = question_id;
      if (hadPrev) {
        resetForNewQuestion();
      }
    }
  // resetForNewQuestion is stable (uses only refs internally)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question_id]);

  // Track question revisions for barge-in typewriter animation:
  // revision 1 = first appearance (static), revision 2+ = barge-in replacement (typewriter)
  const [questionRevision, setQuestionRevision] = useState(0);
  const prevQuestionRef = useRef('');

  useEffect(() => {
    if (current_question && current_question !== prevQuestionRef.current) {
      prevQuestionRef.current = current_question;
      setQuestionRevision((r) => r + 1);
    }
  }, [current_question]);

  // Sync soft-pause flag into the passive loop
  useEffect(() => {
    setPausePending(is_pause_pending);
  }, [is_pause_pending, setPausePending]);

  // React to hard-reset signal from controls
  const prevHardResetSeqRef = useRef(hard_reset_seq);
  useEffect(() => {
    if (hard_reset_seq !== prevHardResetSeqRef.current) {
      prevHardResetSeqRef.current = hard_reset_seq;
      triggerHardReset();
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

  useEffect(() => {
    startPassiveLoop();
  // startPassiveLoop is stable (defined inside useDebate without dependencies)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main
      className={styles.appContainer}
      aria-busy={!!thinkingName || (isDebating && !awaitingAudienceInput)}
    >
      {isBooting && <BootScreen onDone={handleBootDone} />}

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
      />

      {error && (
        <div className={styles.errorMessage} role="alert">
          {error}
        </div>
      )}

      {current_question && (
        <div className={styles.userQuestion}>
          Question:{' '}
          {questionRevision > 1 ? (
            <Typewriter
              key={String(questionRevision)}
              text={current_question}
              onComplete={resolveQuestionTypewriter}
            />
          ) : (
            current_question
          )}
        </div>
      )}

      {isDebating && !awaitingAudienceInput && !thinkingName && !currentPhilosopher && !currentLine && (
        <div
          className={styles.deliberating}
          aria-live="polite"
          aria-label="Philosophers are thinking"
        >
          [ all thinkers are deliberating... ]
        </div>
      )}

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

      <MicIndicator
        micState={barge_in_active ? 'speaking' : 'idle'}
        interimTranscript=""
      />
    </main>
  );
}

export default App;

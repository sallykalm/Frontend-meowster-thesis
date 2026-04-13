import { useState, useEffect, useRef, useCallback } from 'react';
import BootScreen from './components/BootScreen';
import Credits from './components/Credits';
import DiscussionLog from './components/DiscussionLog';
import Typewriter from './components/Typewriter';
import ImageGrid from './components/ImageGrid';
import InputSection from './components/InputSection';
import AudienceInput, { type AudienceInputHandle } from './components/AudienceInput';
import Menu from './components/Menu';
import { useWebSpeech } from './hooks/useWebSpeech';
import { useDotAnimation } from './hooks/useDotAnimation';
import { useDebate } from './hooks/useDebate';
import { clearQuestion, fetchDebateQuestions, fetchHealth } from './api';
// import { PORT } from './constants';
import styles from './App.module.css';
import './App.css';

function App() {
  const [isBooting, setIsBooting] = useState(true);
  const [debateQuestions, setDebateQuestions] = useState<string[]>([]);
  const [isCreditsOpen, setIsCreditsOpen] = useState(false);
  const [imageSet, setImageSet] = useState(1);
  const [userQuestion, setUserQuestion] = useState('');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isFastForwarding, setIsFastForwarding] = useState(false);
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(true);
  const [isButtonsVisible, setIsButtonsVisible] = useState(false);
  const [isInputMinimal, setIsInputMinimal] = useState(true);
  const [isTtsEnabled, setIsTtsEnabled] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const audienceInputRef = useRef<AudienceInputHandle>(null);

  useEffect(() => {
    const load = async (): Promise<void> => {
      const [questions, health] = await Promise.all([
        fetchDebateQuestions(),
        fetchHealth(),
      ]);
      if (questions.length > 0) setDebateQuestions(questions);
      if (health) setIsTtsEnabled(health.tts);
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

  const {
    finishedLines,
    currentLine,
    currentPhilosopher,
    thinkingName,
    interruptingName,
    submittedQuestion,
    questionRevision,
    isDebating,
    error,
    awaitingAudienceInput,
    isAudienceQuestion,
    startDebate,
    abortDebate,
    resolveQuestionTypewriter,
    handleAudienceQuestion,
    runIntroduction,
  } = useDebate();

  const isAudienceStageActive = awaitingAudienceInput;

  function handleSubmit(question: string) {
    if (!question.trim() || isDebating) return;
    setUserQuestion('');
    void startDebate(question.trim(), isVoiceEnabled);
  }

  function handleVoiceToggle() {
    if (isListening) {
      stopVoice();
      setTimeout(() => {
        if (transcript.trim()) {
          if (isDebating) abortDebate();
          setIsPaused(false);
          setIsFastForwarding(false);
          void startDebate(transcript.trim(), isVoiceEnabled);
          resetVoice();
        }
      }, 100);
    } else {
      if (isDebating) abortDebate();
      setIsPaused(false);
      setIsFastForwarding(false);
      startVoice();
    }
  }

  const handleIntroduction = useCallback(() => {
    void runIntroduction(isVoiceEnabled);
  }, [runIntroduction, isVoiceEnabled]);

  const handleStop = useCallback(() => {
    if (isDebating) {
      abortDebate();
    }
    setIsPaused(false);
    setIsFastForwarding(false);
    setUserQuestion('');
    clearQuestion().catch(console.error);
  }, [isDebating, abortDebate]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      if (isAudienceStageActive) {
        if (e.code === 'Space') {
          e.preventDefault();
          audienceInputRef.current?.toggleVoice();
        }
        return;
      }

      if (e.code === 'Space') {
        if (isDebating) {
          abortDebate();
          return;
        }
        if (!isListening) {
          e.preventDefault();
          startVoice();
        }
      }

      if (e.key.toUpperCase() === 'M') setIsMenuOpen(!isMenuOpen);
      if (e.key.toUpperCase() === 'P') setIsPaused(!isPaused);
      if (e.key.toUpperCase() === 'Q') handleStop();
      if (e.key.toUpperCase() === 'F' && !isTtsEnabled) setIsFastForwarding(true);
      if (e.key.toUpperCase() === 'V') setIsVoiceEnabled(!isVoiceEnabled);
      if (e.key.toUpperCase() === 'I') handleIntroduction();
      if (e.key.toUpperCase() === 'C') setIsCreditsOpen((o) => !o);
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;

      if (e.code === 'Space' && isListening) {
        e.preventDefault();
        stopVoice();
        setTimeout(() => {
          if (transcript.trim()) {
            void startDebate(transcript.trim(), isVoiceEnabled);
            resetVoice();
          }
        }, 100);
      }

      if (e.key.toUpperCase() === 'F') setIsFastForwarding(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [
    isListening,
    isDebating,
    transcript,
    startVoice,
    stopVoice,
    resetVoice,
    startDebate,
    abortDebate,
    isMenuOpen,
    isPaused,
    isVoiceEnabled,
    handleStop,
    handleIntroduction,
    setIsCreditsOpen,
    isAudienceStageActive,
    isTtsEnabled,
  ]);

  useEffect(() => {
    if (!isPaused) {
      if (currentAudioRef.current) {
        if (currentAudioRef.current.paused) {
          currentAudioRef.current.play().catch(() => {});
        }
      }
    } else {
      if (currentAudioRef.current) {
        if (!currentAudioRef.current.paused) {
          currentAudioRef.current.pause();
        }
      }
    }
  }, [isPaused]);

  return (
    <main
      className={styles.appContainer}
      aria-busy={!!thinkingName || (isDebating && !awaitingAudienceInput)}
    >
      {isBooting && <BootScreen onDone={() => setIsBooting(false)} />}
      {isCreditsOpen && <Credits onClose={() => setIsCreditsOpen(false)} />}

      {isMenuOpen && (
        <Menu
          isMenuOpen={isMenuOpen}
          isPaused={isPaused}
          isFastForwarding={isFastForwarding}
          isVoiceEnabled={isVoiceEnabled}
          isInputMinimal={isInputMinimal}
          imageSet={imageSet}
          isButtonsVisible={isButtonsVisible}
          onPausePlay={() => setIsPaused(!isPaused)}
          onStop={handleStop}
          onFastForward={(isActive: boolean) => { if (!isTtsEnabled) setIsFastForwarding(isActive); }}
          onImageSetChange={setImageSet}
          onVoiceToggle={(enabled: boolean) => setIsVoiceEnabled(enabled)}
          onButtonsToggle={(visible: boolean) => setIsButtonsVisible(visible)}
          onInputModeToggle={(minimal: boolean) => setIsInputMinimal(minimal)}
          onIntroduction={handleIntroduction}
          onCredits={() => setIsCreditsOpen(true)}
          onClose={() => setIsMenuOpen(false)}
        />
      )}

      {!isAudienceStageActive && (
        <InputSection
          inputRef={inputRef}
          value={userQuestion}
          onChange={setUserQuestion}
          onSubmit={handleSubmit}
          onVoiceToggle={handleVoiceToggle}
          isListening={isListening}
          disabled={isDebating}
          isButtonsVisible={isButtonsVisible}
          isMinimal={isInputMinimal}
          suggestions={debateQuestions}
        />
      )}

      {!isAudienceStageActive && (
        <ImageGrid
          imageSet={imageSet}
          onImageSetChange={setImageSet}
          typingPhilosopher={currentPhilosopher}
          thinkingName={thinkingName}
          interruptingName={interruptingName}
          currentPhilosopher={currentPhilosopher}
          isPaused={isPaused}
        />
      )}

      {isAudienceStageActive && (
        <div
          style={{
            width: '100%',
            display: 'flex',
            justifyContent: 'center',
            margin: '20px 0 28px',
          }}
        >
          <AudienceInput ref={audienceInputRef} onSubmit={handleAudienceQuestion} />
        </div>
      )}

      {error && (
        <div className={styles.errorMessage} role="alert">
          {error}
        </div>
      )}

      {submittedQuestion && (
        <div className={styles.userQuestion}>
          {isAudienceQuestion ? 'Audience Question:' : 'Question:'}{' '}
          {questionRevision > 0 ? (
            <Typewriter
              key={String(questionRevision)}
              text={submittedQuestion}
              onComplete={() => { (resolveQuestionTypewriter as () => void)(); }}
            />
          ) : (
            submittedQuestion
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

      {isListening && !submittedQuestion && !isAudienceStageActive && (
        <div
          className={styles.userQuestion}
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}
        >
          {!transcript.trim() && (
            <span className={styles.recordingIndicator} aria-hidden="true">
              ● RECORDING_QUESTION
            </span>
          )}
          <output className={styles.liveTranscript} aria-live="polite">
            {transcript.trim() ? transcript : '.'.repeat(dotCount)}
          </output>
        </div>
      )}

      <DiscussionLog
        finishedLines={finishedLines}
        currentLine={currentLine}
        isFastForwarding={isFastForwarding}
        isPaused={isPaused}
      />
    </main>
  );
}

export default App;
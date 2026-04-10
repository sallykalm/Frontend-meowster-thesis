import { useState, useEffect, useRef } from 'react';
import DiscussionLog from './components/DiscussionLog';
import ImageGrid from './components/ImageGrid';
import InputSection from './components/InputSection';
import Menu from './components/Menu';
import { useWebSpeech } from './hooks/useWebSpeech';
import { useDotAnimation } from './hooks/useDotAnimation';
import { useDebate } from './hooks/useDebate';
import { clearQuestion } from './api';
// import { PORT } from './constants';
import styles from './App.module.css';
import './App.css';

function App() {
  const [imageSet, setImageSet] = useState(1);
  const [userQuestion, setUserQuestion] = useState('');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isFastForwarding, setIsFastForwarding] = useState(false);
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);

  const { isListening, transcript, start: startVoice, stop: stopVoice, reset: resetVoice } = useWebSpeech();
  const dotCount = useDotAnimation(isListening && !transcript.trim());
  const { finishedLines, currentLine, currentPhilosopher, thinkingName, submittedQuestion, isDebating, error, startDebate, abortDebate } = useDebate();

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
          void startDebate(transcript.trim(), isVoiceEnabled);
          resetVoice();
        }
      }, 100);
    } else {
      startVoice();
    }
  }

  function handleStop() {
    if (isDebating) {
      abortDebate();
    }
    setIsPaused(false);
    setIsFastForwarding(false);
    setUserQuestion('');
    clearQuestion().catch(console.error);
  }

  function handleIntroduction() {
    // Placeholder for future introduction functionality
    console.log('Introduction button clicked');
  }

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check if input is focused
      const isInputFocused = document.activeElement === inputRef.current;

      // If spacebar pressed, abort any ongoing debate
      if (e.code === 'Space') {
        if (isDebating) {
          abortDebate();
          return;
        }
        if (!isListening && !isInputFocused) {
          e.preventDefault();
          startVoice();
        }
      }

      // Menu shortcuts - only if input is not focused
      if (e.key.toUpperCase() === 'M' && !isInputFocused) {
        setIsMenuOpen(!isMenuOpen);
      }

      // Only process menu shortcuts if input is not focused
      if (!isInputFocused) {
        if (e.key.toUpperCase() === 'P') {
          setIsPaused(!isPaused);
        }
        if (e.key.toUpperCase() === 'Q') {
          handleStop();
        }
        if (e.key.toUpperCase() === 'F') {
          setIsFastForwarding(true);
        }
        if (e.key.toUpperCase() === 'V') {
          setIsVoiceEnabled(!isVoiceEnabled);
        }
        if (e.key.toUpperCase() === 'I') {
          handleIntroduction();
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const isInputFocused = document.activeElement === inputRef.current;

      // Only stop voice if spacebar released and currently listening
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

      // Only process menu shortcuts if input is not focused
      if (!isInputFocused) {
        if (e.key.toUpperCase() === 'F') {
          setIsFastForwarding(false);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isListening, isDebating, transcript, startVoice, stopVoice, resetVoice, startDebate, abortDebate, isMenuOpen, isPaused, isVoiceEnabled, handleStop]);

  // Handle pause/play effect
  useEffect(() => {
    if (!isPaused) {
      // Resume: unpause audio if it's paused
      if (currentAudioRef.current) {
        if (currentAudioRef.current.paused) {
          currentAudioRef.current.play().catch(() => {});
        }
      }
    } else {
      // Pause: pause the audio
      if (currentAudioRef.current) {
        if (!currentAudioRef.current.paused) {
          currentAudioRef.current.pause();
        }
      }
    }
  }, [isPaused]);

  return (
    <main className={styles.appContainer} aria-busy={!!thinkingName || isDebating}>
      {/* Menu overlay */}
      {isMenuOpen && (
        <Menu
          isMenuOpen={isMenuOpen}
          isPaused={isPaused}
          isFastForwarding={isFastForwarding}
          isVoiceEnabled={isVoiceEnabled}
          imageSet={imageSet}
          onPausePlay={() => setIsPaused(!isPaused)}
          onStop={handleStop}
          onFastForward={(isActive: boolean) => setIsFastForwarding(isActive)}
          onImageSetChange={setImageSet}
          onVoiceToggle={(enabled: boolean) => setIsVoiceEnabled(enabled)}
          onIntroduction={handleIntroduction}
        />
      )}
      <InputSection
        inputRef={inputRef}
        value={userQuestion}
        onChange={setUserQuestion}
        onSubmit={handleSubmit}
        onVoiceToggle={handleVoiceToggle}
        isListening={isListening}
        disabled={isDebating}
      />

      <ImageGrid
        imageSet={imageSet}
        onImageSetChange={setImageSet}
        typingPhilosopher={currentPhilosopher}
        thinkingName={thinkingName}
        currentPhilosopher={currentPhilosopher}
      />

      {error && (
        <div className={styles.errorMessage} role="alert">
          {error}
        </div>
      )}

      {submittedQuestion && (
        <div className={styles.userQuestion}>
          Question: {submittedQuestion}
        </div>
      )}

      {isListening && !submittedQuestion && (
        <div className={styles.userQuestion} style={{ display: 'flex', justifyContent: 'center' }}>
          <output className={styles.liveTranscript} aria-live="polite">
            {transcript.trim() ? transcript : '.'.repeat(dotCount)}
          </output>
        </div>
      )}

      <DiscussionLog
        finishedLines={finishedLines}
        currentLine={currentLine}
        isListening={isListening}
        liveTranscript={transcript}
        isFastForwarding={isFastForwarding}
        isPaused={isPaused}
      />
    </main>
  );
}

export default App;

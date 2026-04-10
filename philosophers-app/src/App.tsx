import { useState, useEffect, useRef } from 'react';
import DiscussionLog from './components/DiscussionLog';
import ImageGrid from './components/ImageGrid';
import InputSection from './components/InputSection';
import { useWebSpeech } from './hooks/useWebSpeech';
import { useDotAnimation } from './hooks/useDotAnimation';
import { useDebate } from './hooks/useDebate';
import styles from './App.module.css';
import './App.css';

function App() {
  const [imageSet, setImageSet] = useState(1);
  const [userQuestion, setUserQuestion] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const { isListening, transcript, start: startVoice, stop: stopVoice, reset: resetVoice } = useWebSpeech();
  const dotCount = useDotAnimation(isListening && !transcript.trim());
  const { finishedLines, currentLine, currentPhilosopher, thinkingName, submittedQuestion, isDebating, error, startDebate, abortDebate } = useDebate();

  function handleSubmit(question: string) {
    if (!question.trim() || isDebating) return;
    setUserQuestion('');
    void startDebate(question.trim());
  }

  function handleVoiceToggle() {
    if (isListening) {
      stopVoice();
      setTimeout(() => {
        if (transcript.trim()) {
          void startDebate(transcript.trim());
          resetVoice();
        }
      }, 100);
    } else {
      startVoice();
    }
  }

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        if (isDebating) {
          abortDebate();
          return;
        }
        if (!isListening && document.activeElement !== inputRef.current) {
          e.preventDefault();
          startVoice();
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' && isListening) {
        e.preventDefault();
        stopVoice();
        setTimeout(() => {
          if (transcript.trim()) {
            void startDebate(transcript.trim());
            resetVoice();
          }
        }, 100);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isListening, isDebating, transcript, startVoice, stopVoice, resetVoice, startDebate, abortDebate]);

  return (
    <main className={styles.appContainer} aria-busy={!!thinkingName || isDebating}>
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
      />
    </main>
  );
}

export default App;

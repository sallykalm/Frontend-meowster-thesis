import { useState, useEffect, useRef, useCallback } from 'react';
import BootScreen from './components/BootScreen';
import Credits from './components/Credits';
import DiscussionLog from './components/DiscussionLog';
import Typewriter from './components/Typewriter';
import ImageGrid from './components/ImageGrid';
import InputSection from './components/InputSection';
import AudienceInput, { type AudienceInputHandle } from './components/AudienceInput';
import MicIndicator from './components/MicIndicator';
import Menu from './components/Menu';
import { useWebSpeech } from './hooks/useWebSpeech';
import { useVoiceInput } from './hooks/useVoiceInput';
import { useDotAnimation } from './hooks/useDotAnimation';
import { useDebate } from './hooks/useDebate';
import { clearQuestion, fetchDebateQuestions, fetchHealth, postInterrupt, postCorrectTranscript } from './api';
import { BARGE_IN_SUBMIT_DELAY_MS, parseAddressedTo } from './constants';
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
  const [bargeinEnabled, setBargeinEnabled] = useState(true);
  const [micMuted, setMicMuted] = useState(false);
  const [bargeinMode, setBargeinMode] = useState<'moderator' | 'audience' | 'live'>('live');
  const [liveInstructions, setLiveInstructions] = useState<string[]>([]);
  // True while barge-in has fired but startDebate hasn't been called yet (correction in-flight).
  const [isPreparingQuestion, setIsPreparingQuestion] = useState(false);
  // Final transcript captured by barge-in, held until the session enters audience phase.
  const [bargeinTranscript, setBargeinTranscript] = useState('');

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
    stopCurrentAudio,
    interruptCurrentLine,
    sendLiveInstruction,
    startDebate,
    abortDebate,
    resolveQuestionTypewriter,
    handleAudienceQuestion,
    runIntroduction,
  } = useDebate();


  const handleBargeinSpeechStart = useCallback((): void => {
    stopCurrentAudio();
    interruptCurrentLine();
    postInterrupt().catch(() => {});
  }, [stopCurrentAudio, interruptCurrentLine]);

  const handleBargeinTranscript = useCallback((text: string): void => {
    const raw = text.trim();
    if (!raw) return;

    // Reject very short transcripts — likely filler words, coughs, or noise.
    if (raw.split(/\s+/).length < 3) return;

    // Always stop audio and interrupt typewriter immediately — fallback for when
    // onspeechstart didn't fire (which is unreliable across browsers/platforms).
    stopCurrentAudio();
    interruptCurrentLine();

    if (bargeinMode === 'live') {
      // sendLiveInstruction corrects the raw transcript internally before posting.
      void (async () => {
        const accepted = await sendLiveInstruction(raw).catch(() => null);
        // Replace (don't accumulate) — only the latest instruction is shown.
        if (accepted) setLiveInstructions([accepted]);
      })();
    } else {
      // Audience or moderator: abort current debate and restart with the transcript.
      abortDebate();
      setBargeinTranscript('');
      setLiveInstructions([]);
      setIsPreparingQuestion(true);
      postCorrectTranscript(raw, submittedQuestion, currentPhilosopher)
        .then((corrected: string) => { setIsPreparingQuestion(false); void startDebate(corrected, isVoiceEnabled); })
        .catch(() => { setIsPreparingQuestion(false); void startDebate(raw, isVoiceEnabled); });
    }
  }, [bargeinMode, stopCurrentAudio, interruptCurrentLine, sendLiveInstruction, abortDebate, submittedQuestion, currentPhilosopher, startDebate, isVoiceEnabled, setIsPreparingQuestion]);

  // Always-on barge-in mic. Active only while a debate is running and the
  // user is not already recording a question with push-to-talk.
  // isAudioPlaying is passed as false so the mic stays active even during TTS
  // playback — barge-in is specifically for interrupting audio.
  const { micState, interimTranscript } = useVoiceInput({
    isAudioPlaying: false,
    enabled: bargeinEnabled && !micMuted && isDebating && !awaitingAudienceInput && !isListening,
    onSpeechStart: handleBargeinSpeechStart,
    onTranscriptReady: handleBargeinTranscript,
  });

  // Auto-submit the barge-in transcript once the session enters its audience-input pause.
  useEffect(() => {
    if (!awaitingAudienceInput || !bargeinTranscript) return;
    const timer = setTimeout(() => {
      void handleAudienceQuestion(bargeinTranscript, parseAddressedTo(bargeinTranscript), false);
      setBargeinTranscript('');
    }, BARGE_IN_SUBMIT_DELAY_MS);
    return () => clearTimeout(timer);
  // parseAddressedTo and handleAudienceQuestion are stable within a render cycle;
  // including them would cause spurious re-runs as the debate hook re-creates them.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [awaitingAudienceInput, bargeinTranscript]);

  const isAudienceStageActive = awaitingAudienceInput;

  function handleSubmit(question: string) {
    if (!question.trim() || isDebating) return;
    setBargeinTranscript('');
    setLiveInstructions([]);
    setUserQuestion('');
    void startDebate(question.trim(), isVoiceEnabled);
  }

  function handleVoiceToggle() {
    if (isListening) {
      stopVoice();
      setTimeout(() => {
        const raw = transcript.trim();
        if (raw) {
          if (isDebating) abortDebate();
          setIsPaused(false);
          setIsFastForwarding(false);
          postCorrectTranscript(raw, submittedQuestion, currentPhilosopher)
            .then((corrected: string) => { void startDebate(corrected, isVoiceEnabled); })
            .catch(() => { void startDebate(raw, isVoiceEnabled); });
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
    setBargeinTranscript('');
    setLiveInstructions([]);
    setIsPreparingQuestion(false);
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
      if (e.key.toUpperCase() === 'A') setBargeinMode((m) => (m === 'audience' ? 'live' : 'audience'));
      if (e.key.toUpperCase() === 'O') setBargeinMode((m) => (m === 'moderator' ? 'live' : 'moderator'));
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
            postCorrectTranscript(raw, submittedQuestion, currentPhilosopher)
              .then((corrected: string) => { void startDebate(corrected, isVoiceEnabled); })
              .catch(() => { void startDebate(raw, isVoiceEnabled); });
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
    submittedQuestion,
    currentPhilosopher,
    bargeinMode,
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
          bargeinMode={bargeinMode}
          micMuted={micMuted}
          onPausePlay={() => setIsPaused(!isPaused)}
          onStop={handleStop}
          onFastForward={(isActive: boolean) => { if (!isTtsEnabled) setIsFastForwarding(isActive); }}
          onImageSetChange={setImageSet}
          onVoiceToggle={(enabled: boolean) => setIsVoiceEnabled(enabled)}
          onButtonsToggle={(visible: boolean) => setIsButtonsVisible(visible)}
          onInputModeToggle={(minimal: boolean) => setIsInputMinimal(minimal)}
          onAudienceModeToggle={() => setBargeinMode((m) => (m === 'audience' ? 'live' : 'audience'))}
          onModeratorModeToggle={() => setBargeinMode((m) => (m === 'moderator' ? 'live' : 'moderator'))}
          onMicMuteToggle={() => setMicMuted((m) => !m)}
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
          <AudienceInput ref={audienceInputRef} onSubmit={handleAudienceQuestion} contextQuestion={submittedQuestion} />
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
              onComplete={resolveQuestionTypewriter}
            />
          ) : (
            submittedQuestion
          )}
        </div>
      )}

      {liveInstructions.length > 0 && isDebating && (
        <div className={styles.moderatorInstruction} aria-live="polite">
          ▸ {liveInstructions[liveInstructions.length - 1]}
        </div>
      )}

      {isPreparingQuestion && (
        <div
          className={styles.deliberating}
          aria-live="polite"
          aria-label="Processing question"
        >
          [ processing... ]
        </div>
      )}

      {!isPreparingQuestion && isDebating && !awaitingAudienceInput && !thinkingName && !currentPhilosopher && !currentLine && (
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

      <MicIndicator
        micState={micState}
        interimTranscript={interimTranscript}
        pendingTranscript={bargeinTranscript || undefined}
      />
    </main>
  );
}

export default App;
import { forwardRef, useImperativeHandle, useMemo, useState } from 'react';
import { PHILOSOPHER_NAMES, parseAddressedTo } from '../constants';
import type { PhilosopherName } from '../constants';
import { useWebSpeech } from '../hooks/useWebSpeech';
import { postCorrectTranscript } from '../api';
import styles from './AudienceInput.module.css';

interface AudienceInputProps {
  onSubmit: (question: string, addressedTo: string[], isFollowup: boolean) => Promise<void>;
  /** Current debate question — used as context for speech recognition correction. */
  contextQuestion?: string;
}

export interface AudienceInputHandle {
  toggleVoice: () => void;
}

const AudienceInput = forwardRef<AudienceInputHandle, AudienceInputProps>(function AudienceInput({ onSubmit, contextQuestion = '' }, ref) {
  const [question, setQuestion] = useState('');
  const [selected, setSelected] = useState<Set<PhilosopherName>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  const {
    isListening,
    transcript,
    start,
    stop,
    reset,
  } = useWebSpeech();

  // While recording, show the live transcript; otherwise show the typed question.
  const displayedQuestion = isListening ? transcript : question;
  const trimmedQuestion = useMemo(() => displayedQuestion.trim(), [displayedQuestion]);

  function togglePhilosopher(name: PhilosopherName) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  }

  function handleVoiceToggle() {
    if (submitting) return;

    if (isListening) {
      stop();
      // Commit whatever was transcribed so the user can edit it before submitting.
      setQuestion(transcript);
    } else {
      reset();
      start();
    }
  }

  useImperativeHandle(ref, () => ({ toggleVoice: handleVoiceToggle }));

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const raw = displayedQuestion.trim();
    if (!raw || submitting) return;

    setSubmitting(true);

    // Capture before stop() changes the state.
    const wasVoiceInput = isListening;
    if (isListening) {
      stop();
    }

    // Only correct voice-recorded input — typed text doesn't need speech recognition fixes.
    const finalQuestion = wasVoiceInput
      ? await postCorrectTranscript(raw, contextQuestion).catch(() => raw)
      : raw;

    // Merge manually selected chips with names parsed from the question text,
    // so "Flusser, I want to know..." works without manually clicking the chip.
    const fromText = parseAddressedTo(finalQuestion);
    const merged = Array.from(new Set([...Array.from(selected), ...fromText]));

    await onSubmit(finalQuestion, merged, false);

    setQuestion('');
    setSelected(new Set());
    reset();
    setSubmitting(false);
  }

  return (
    <div className={styles.container} role="region" aria-label="Audience question">
      <p className={styles.label}>[ audience · ask your question ]</p>

      <div className={styles.chips}>
        {PHILOSOPHER_NAMES.map((name) => (
          <button
            key={name}
            type="button"
            className={`${styles.chip} ${selected.has(name) ? styles.chipActive : ''}`}
            onClick={() => { togglePhilosopher(name); }}
            aria-pressed={selected.has(name)}
          >
            {name}
          </button>
        ))}
      </div>

      {selected.size > 0 && (
        <p className={styles.hint}>→ {Array.from(selected).join(', ')}</p>
      )}

      {isListening && (
        <p className={styles.recordingHint}>● recording audience question</p>
      )}

      <form className={styles.form} onSubmit={(e) => { void handleSubmit(e); }}>
        <input
          className={styles.input}
          value={displayedQuestion}
          onChange={(e) => { setQuestion(e.target.value); }}
          placeholder="[ type or record your question ]"
          disabled={submitting || isListening}
          autoFocus
          aria-label="Audience question text"
        />

        <button
          type="button"
          className={isListening ? styles.voiceButtonActive : styles.voiceButton}
          onClick={handleVoiceToggle}
          disabled={submitting}
          aria-label={isListening ? 'Stop voice input' : 'Start voice input'}
          aria-pressed={isListening}
        >
          {isListening ? '[ ◉ ]' : '[ ◎ ]'}
        </button>

        <button
          type="submit"
          className={styles.button}
          disabled={!trimmedQuestion || submitting}
          aria-label="Submit audience question"
        >
          [ ↵ ]
        </button>
      </form>
    </div>
  );
});

export default AudienceInput;

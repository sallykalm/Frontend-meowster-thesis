import { useEffect, useMemo, useState } from 'react';
import { PHILOSOPHER_NAMES } from '../constants';
import type { PhilosopherName } from '../constants';
import { useWebSpeech } from '../hooks/useWebSpeech';
import styles from './AudienceInput.module.css';

interface AudienceInputProps {
  onSubmit: (question: string, addressedTo: string[], isFollowup: boolean) => Promise<void>;
}

const AudienceInput = ({ onSubmit }: AudienceInputProps) => {
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

  const trimmedQuestion = useMemo(() => question.trim(), [question]);

  useEffect(() => {
    if (isListening) {
      setQuestion(transcript);
    }
  }, [transcript, isListening]);

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
    } else {
      reset();
      start();
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const finalQuestion = question.trim();
    if (!finalQuestion || submitting) return;

    setSubmitting(true);

    if (isListening) {
      stop();
    }

    await onSubmit(finalQuestion, Array.from(selected), false);

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
          value={question}
          onChange={(e) => { setQuestion(e.target.value); }}
          placeholder="[ type or record your question ]"
          disabled={submitting}
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
};

export default AudienceInput;
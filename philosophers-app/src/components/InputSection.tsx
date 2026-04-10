import type { RefObject } from 'react';
import styles from './InputSection.module.css';

interface InputSectionProps {
  inputRef: RefObject<HTMLInputElement | null>;
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  onVoiceToggle: () => void;
  isListening: boolean;
  disabled: boolean;
}

const InputSection = ({
  inputRef,
  value,
  onChange,
  onSubmit,
  onVoiceToggle,
  isListening,
  disabled,
}: InputSectionProps) => {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      onSubmit(value);
      (e.target as HTMLInputElement).blur();
    }
  };

  return (
    <form
      className={styles.inputSection}
      onSubmit={(e) => { e.preventDefault(); onSubmit(value); }}
      aria-label="Ask the philosophers a question"
    >
      <input
        ref={inputRef}
        className={styles.input}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="[ type your question here ]"
        onKeyDown={handleKeyDown}
        disabled={disabled}
        aria-label="Your question"
        aria-disabled={disabled}
      />
      <button
        type="submit"
        className={styles.button}
        disabled={disabled || !value.trim()}
        aria-label="Submit question"
      >
        [ ↵ ]
      </button>
      <button
        type="button"
        className={isListening ? styles.voiceButtonActive : styles.voiceButton}
        onClick={onVoiceToggle}
        disabled={disabled}
        aria-label={isListening ? 'Stop voice input' : 'Start voice input (hold Space)'}
        aria-pressed={isListening}
      >
        {isListening ? '[ ◉ ]' : '[ ◎ ]'}
      </button>
    </form>
  );
};

export default InputSection;

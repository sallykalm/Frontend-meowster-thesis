import type { RefObject } from 'react';
import { useState } from 'react';
import styles from './InputSection.module.css';

interface InputSectionProps {
  inputRef: RefObject<HTMLInputElement | null>;
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  onVoiceToggle: () => void;
  isListening: boolean;
  disabled: boolean;
  isButtonsVisible?: boolean;
  isMinimal?: boolean;
}

const InputSection = ({
  inputRef,
  value,
  onChange,
  onSubmit,
  onVoiceToggle,
  isListening,
  disabled,
  isButtonsVisible = true,
  isMinimal = false,
}: InputSectionProps) => {
  const [isFocused, setIsFocused] = useState(false);

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
        className={`${styles.input} ${isMinimal ? styles.inputMinimal : ''}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={isMinimal ? '' : '[ type your question here ]'}
        onKeyDown={handleKeyDown}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        disabled={disabled}
        data-focused={isFocused}
        aria-label="Your question"
        aria-disabled={disabled}
      />
      <button
        type="submit"
        className={styles.button}
        disabled={disabled || !value.trim()}
        aria-label="Submit question"
        style={{ display: isButtonsVisible ? 'block' : 'none' }}
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
        style={{ display: isButtonsVisible ? 'block' : 'none' }}
      >
        {isListening ? '[ ◉ ]' : '[ ◎ ]'}
      </button>
    </form>
  );
};

export default InputSection;

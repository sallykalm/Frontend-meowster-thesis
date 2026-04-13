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
  suggestions?: string[];
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
  suggestions = [],
}: InputSectionProps) => {
  const [isFocused, setIsFocused] = useState(false);
  const [suggestionIndex, setSuggestionIndex] = useState(0);

  const hasSuggestions = suggestions.length > 0;
  const currentSuggestion = hasSuggestions ? suggestions[suggestionIndex] : '';

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const toSubmit = value.trim() || currentSuggestion;
      if (toSubmit) {
        onChange('');
        onSubmit(toSubmit);
      }
      (e.target as HTMLInputElement).blur();
      return;
    }

    if (e.key === 'Tab' && hasSuggestions) {
      e.preventDefault();
      setSuggestionIndex((i) => (i + 1) % suggestions.length);
    }
  };

  const placeholder = (() => {
    if (hasSuggestions && isFocused) return currentSuggestion;
    if (isMinimal) return '';
    return '[ type your question here ]';
  })();

  return (
    <div className={styles.inputWrapper}>
      <form
        className={styles.inputSection}
        onSubmit={(e) => {
          e.preventDefault();
          const toSubmit = value.trim() || currentSuggestion;
          if (toSubmit) {
            onChange('');
            onSubmit(toSubmit);
          }
        }}
        aria-label="Ask the philosophers a question"
      >
        <input
          ref={inputRef}
          className={`${styles.input} ${isMinimal ? styles.inputMinimal : ''}`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
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
          disabled={disabled || (!value.trim() && !currentSuggestion)}
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
      {hasSuggestions && isFocused && (
        <p className={styles.suggestionHint}>
          [ tab ] next question &nbsp;·&nbsp; {suggestionIndex + 1} / {suggestions.length}
        </p>
      )}
    </div>
  );
};

export default InputSection;

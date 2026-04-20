import type { RefObject } from 'react';
import { useState } from 'react';
import styles from './InputSection.module.css';

interface InputSectionProps {
  inputRef: RefObject<HTMLInputElement | null>;
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  disabled: boolean;
  suggestions?: string[];
}

const InputSection = ({
  inputRef,
  value,
  onChange,
  onSubmit,
  disabled,
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

  const placeholder = hasSuggestions && isFocused
    ? currentSuggestion
    : 'Type your question here...';

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault();
    const toSubmit = value.trim() || currentSuggestion;
    if (toSubmit) {
      onChange('');
      onSubmit(toSubmit);
    }
  }

  return (
    <div className={styles.inputWrapper}>
      <form
        className={`${styles.inputBox} ${disabled ? styles.disabled : ''}`}
        onSubmit={handleSubmit}
        aria-label="Ask the philosophers a question"
      >
        <input
          ref={inputRef}
          className={styles.input}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          disabled={disabled}
          aria-label="Your question"
          aria-disabled={disabled}
        />
        <button
          type="submit"
          className={styles.sendButton}
          disabled={disabled || (!value.trim() && !currentSuggestion)}
          aria-label="Submit question"
        >
          ↵
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

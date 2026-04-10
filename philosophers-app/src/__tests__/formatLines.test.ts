import { describe, it, expect } from 'vitest';
import { formatLines } from '../hooks/useDebate';

describe('formatLines', () => {
  it('returns the text as a single line when it fits within maxLen', () => {
    expect(formatLines('Hello world', 80)).toEqual(['Hello world']);
  });

  it('breaks at word boundaries when text exceeds maxLen', () => {
    const text = 'The quick brown fox jumped over the lazy dog and kept on running forever';
    const lines = formatLines(text, 30);
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(30);
    }
    expect(lines.join(' ')).toBe(text);
  });

  it('handles empty string', () => {
    expect(formatLines('')).toEqual([]);
  });

  it('handles a single word longer than maxLen by forcing a hard break', () => {
    const long = 'superlongwordwithnospacesatall';
    const lines = formatLines(long, 10);
    // Should break at exactly maxLen
    expect(lines[0].length).toBeLessThanOrEqual(10);
  });

  it('handles text of exactly maxLen without breaking', () => {
    const text = 'a'.repeat(80);
    expect(formatLines(text, 80)).toEqual([text]);
  });

  it('produces non-empty lines only', () => {
    const text = 'word '.repeat(20).trim();
    const lines = formatLines(text, 40);
    for (const line of lines) {
      expect(line.length).toBeGreaterThan(0);
    }
  });
});

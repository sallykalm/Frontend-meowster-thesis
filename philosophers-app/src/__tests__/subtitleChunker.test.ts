import { describe, it, expect } from 'vitest';
import { chunkSubtitleText } from '../utils/subtitleChunker';

const MAX = 80;

describe('chunkSubtitleText', () => {

  // ── Edge cases ──────────────────────────────────────────────────────────────

  it('empty string → no chunks', () => {
    expect(chunkSubtitleText('', MAX)).toHaveLength(0);
    expect(chunkSubtitleText('   ', MAX)).toHaveLength(0);
  });

  it('short sentence → 1 chunk', () => {
    const chunks = chunkSubtitleText('Hello world.', MAX);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe('Hello world.');
  });

  // ── Rule 1: Full stop is an absolute hard boundary ──────────────────────────

  it('two short sentences → 2 chunks (full stop is king)', () => {
    // Even though both fit on 2 lines, they must never share a chunk.
    const chunks = chunkSubtitleText('What counts as worth recording. You function within it.', MAX);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toBe('What counts as worth recording.');
    expect(chunks[1]).toBe('You function within it.');
  });

  it('four short sentences → 4 chunks', () => {
    const chunks = chunkSubtitleText(
      'One two three. Four five six. Seven eight nine. Ten eleven twelve.',
      MAX,
    );
    expect(chunks).toHaveLength(4);
    for (const chunk of chunks) {
      expect(chunk.split('\n').length).toBeLessThanOrEqual(2);
    }
  });

  // ── Rule 2: Minor punctuation does NOT force a break when text fits ─────────

  it('single sentence with comma that fits in 1 line → 1 chunk, no comma split', () => {
    // "what counts as worth recording, you function within it." is ~55 chars → 1 line
    const text = 'what counts as worth recording, you function within it.';
    const chunks = chunkSubtitleText(text, MAX);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe(text);
  });

  it('sentence with colon that fits in 2 lines → 1 chunk', () => {
    const text = 'The answer is simple: you must choose wisely and act accordingly.';
    const chunks = chunkSubtitleText(text, MAX);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe(text);
  });

  it('sentence with hyphen that fits in 2 lines → 1 chunk', () => {
    const text = 'This is a well-known fact - everyone agrees on the basic premise.';
    const chunks = chunkSubtitleText(text, MAX);
    expect(chunks).toHaveLength(1);
  });

  // ── Rule 3: Minor punctuation is the fallback for long sentences ────────────

  it('long sentence with commas exceeding 2 lines → splits at commas, each chunk ≤ 2 lines', () => {
    // Use a very narrow maxLen to force the sentence to exceed 2 lines.
    const text =
      'First clause is here, second clause is here, third clause is here, fourth clause is here.';
    const chunks = chunkSubtitleText(text, 30); // narrow width forces overflow
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.split('\n').length).toBeLessThanOrEqual(2);
    }
  });

  it('single very long sentence with no punctuation → hard-wraps at word boundary, ≤ 2 lines per chunk', () => {
    const words = Array.from({ length: 30 }, (_, i) => `word${i}`).join(' ');
    const chunks = chunkSubtitleText(words, 30);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.split('\n').length).toBeLessThanOrEqual(2);
    }
  });

  // ── Invariant: no words are dropped ─────────────────────────────────────────

  it('preserves all words across chunks (no words dropped)', () => {
    const text = 'One two three. Four five six. Seven eight nine. Ten eleven twelve.';
    const chunks = chunkSubtitleText(text, MAX);
    const rejoined = chunks
      .join(' ')
      .replace(/\n/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const original = text.replace(/\s+/g, ' ').trim();
    expect(rejoined).toBe(original);
  });

  it('preserves all words when long sentence is comma-split', () => {
    const text =
      'First clause is here, second clause is here, third clause is here, fourth clause is here.';
    const chunks = chunkSubtitleText(text, 30);
    const rejoined = chunks
      .join(' ')
      .replace(/\n/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const original = text.replace(/\s+/g, ' ').trim();
    expect(rejoined).toBe(original);
  });
});

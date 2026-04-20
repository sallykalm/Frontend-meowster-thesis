import { describe, it, expect } from 'vitest';
import { mapChunksToTimings } from '../utils/mapChunksToTimings';
import type { Subtitle } from '../api';

function makeSubtitles(words: string[], startGap = 0.5): Subtitle[] {
  let t = 0;
  return words.map((word) => {
    const sub: Subtitle = { word, start: t, end: t + startGap };
    t += startGap;
    return sub;
  });
}

describe('mapChunksToTimings', () => {
  it('chunk 0 always has showAt = 0', () => {
    const subtitles = makeSubtitles(['hello', 'world', 'foo', 'bar']);
    const result = mapChunksToTimings(['hello world', 'foo bar'], subtitles);
    expect(result[0].showAt).toBe(0);
  });

  it("chunk 1's showAt equals the end of chunk 0's last word", () => {
    const subtitles = makeSubtitles(['hello', 'world', 'foo', 'bar']);
    const result = mapChunksToTimings(['hello world', 'foo bar'], subtitles);
    // chunk 0 has words [hello, world] → lastWordIdx = 1 → subtitles[1].end = 1.0
    expect(result[1].showAt).toBe(subtitles[1].end);
  });

  it('lastWordIdx is clamped when word count exceeds subtitles length', () => {
    const subtitles = makeSubtitles(['a', 'b']); // only 2 subtitle entries
    // chunk has 5 words but only 2 subtitles
    const result = mapChunksToTimings(['a b c d e'], subtitles);
    expect(result[0].lastWordIdx).toBe(1); // clamped to subtitles.length - 1
  });

  it('single chunk → showAt 0 and lastWordIdx = wordCount - 1 (clamped)', () => {
    const subtitles = makeSubtitles(['one', 'two', 'three']);
    const result = mapChunksToTimings(['one two three'], subtitles);
    expect(result).toHaveLength(1);
    expect(result[0].showAt).toBe(0);
    expect(result[0].lastWordIdx).toBe(2);
  });

  it('returns empty array for empty chunks', () => {
    const subtitles = makeSubtitles(['a', 'b']);
    expect(mapChunksToTimings([], subtitles)).toEqual([]);
  });

  it('chunk text is preserved in the result', () => {
    const subtitles = makeSubtitles(['hello', 'world']);
    const result = mapChunksToTimings(['hello world'], subtitles);
    expect(result[0].chunk).toBe('hello world');
  });
});

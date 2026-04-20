import type { Subtitle } from '../api';

export interface TimedChunk {
  chunk: string;
  showAt: number;
  lastWordIdx: number;
}

/**
 * Maps subtitle text chunks to audio timings.
 *
 * - Chunk 0: showAt = 0 (appears immediately when audio starts).
 * - Chunk N (N > 0): showAt = subtitles[lastWordIdxOfChunk(N-1)].end
 *   i.e. the new chunk advances the moment the previous chunk's last word
 *   finishes being spoken.
 * - lastWordIdx is clamped to subtitles.length - 1 if it would overflow.
 */
export function mapChunksToTimings(
  chunks: string[],
  subtitles: Subtitle[],
): TimedChunk[] {
  const result: TimedChunk[] = [];
  let cumulativeWordIdx = 0;

  for (let i = 0; i < chunks.length; i++) {
    const chunkText = chunks[i];
    const wordCount = chunkText
      .split(/\s+/)
      .filter(Boolean).length;

    // lastWordIdx: index of the final word in this chunk within the subtitles array.
    const rawLastWordIdx = cumulativeWordIdx + wordCount - 1;
    const lastWordIdx = Math.min(rawLastWordIdx, subtitles.length - 1);

    let showAt: number;
    if (i === 0) {
      showAt = 0;
    } else {
      // showAt = end time of the previous chunk's last word.
      const prevLastWordIdx = result[i - 1].lastWordIdx;
      showAt = subtitles[prevLastWordIdx]?.end ?? 0;
    }

    result.push({ chunk: chunkText, showAt, lastWordIdx });
    cumulativeWordIdx += wordCount;
  }

  return result;
}

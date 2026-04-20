import { formatLines } from '../hooks/useDebate';

/**
 * Splits text at hard sentence boundaries: . ! ?
 * Each punctuation mark is kept with its left segment.
 * Only splits when followed by whitespace or end of string (avoids false
 * positives like "Mr. Smith" or "3.14").
 */
function splitAtSentences(text: string): string[] {
  const sentences: string[] = [];
  let remaining = text.trim();

  while (remaining.length > 0) {
    const match = /[.!?](\s+|$)/.exec(remaining);
    if (match === null) {
      sentences.push(remaining);
      break;
    }
    const endPos = match.index + 1; // position after the punctuation char
    sentences.push(remaining.slice(0, endPos).trim());
    remaining = remaining.slice(endPos + match[1].length).trim();
  }

  return sentences.filter(s => s.length > 0);
}

/**
 * Searches a line for the last minor punctuation mark
 * (, - — – : ;) followed by whitespace or end of string.
 *
 * Returns the split index (position immediately after the punctuation char),
 * or -1 if none found.
 */
function findLastMinorPunct(line: string): number {
  let lastIdx = -1;
  // (?=\s|$) — split point must be a word boundary (space) or end of line
  const re = /[,\-—–:;](?=\s|$)/g;
  let match;
  while ((match = re.exec(line)) !== null) {
    lastIdx = match.index + 1; // split AFTER the punctuation char
  }
  return lastIdx;
}

/**
 * Chunks a single sentence that exceeds 2 display lines using a
 * "fill-first, break backwards" strategy:
 *
 *  1. Fill exactly 2 display lines (word-wrapped).
 *  2. Search backwards in line 2 only for the LAST minor punctuation mark.
 *  3. If found in line 2, split there; left side becomes the chunk,
 *     right side + remaining lines become the new remainder.
 *  4. If NOT found in line 2 (e.g. only punctuation is in line 1 or absent),
 *     split at the exact 2-line word boundary — the full 2 lines become
 *     the chunk and processing continues with the overflow.
 *  5. Repeat until no overflow remains.
 */
function chunkLongSentence(sentence: string, maxLineLen: number): string[] {
  const chunks: string[] = [];
  let remaining = sentence.trim();

  while (remaining.length > 0) {
    const lines = formatLines(remaining, maxLineLen);

    if (lines.length <= 2) {
      // Fits in 2 lines — emit and finish.
      chunks.push(lines.join('\n'));
      break;
    }

    const line1 = lines[0];
    const line2 = lines[1];
    // Overflow lines (line 3+) reconstructed as plain text for the next pass.
    const restText = lines.slice(2).join(' ');

    // Search line 2 backwards for the last minor punctuation.
    const splitPos = findLastMinorPunct(line2);

    let chunkText: string;
    let newRemaining: string;

    if (splitPos !== -1) {
      const leftLine2  = line2.slice(0, splitPos).trim();
      const rightLine2 = line2.slice(splitPos).trim();

      if (leftLine2.length > 0) {
        // Clean break at punctuation inside line 2.
        chunkText    = (line1 + '\n' + leftLine2).trim();
        newRemaining = (rightLine2 + (restText ? ' ' + restText : '')).trim();
      } else {
        // Punctuation was at the very start of line 2 — fall back to word boundary.
        chunkText    = line1 + '\n' + line2;
        newRemaining = restText;
      }
    } else {
      // No minor punctuation in line 2 — split at the 2-line word boundary.
      chunkText    = line1 + '\n' + line2;
      newRemaining = restText;
    }

    chunks.push(chunkText);

    // Safety: prevent infinite loop on degenerate input.
    if (newRemaining === remaining) break;

    remaining = newRemaining;
  }

  return chunks;
}

/**
 * Splits `text` into subtitle chunks of at most 2 display lines each.
 *
 * Hierarchy:
 *  1. Hard boundaries (. ! ?) are absolute — each sentence becomes its own
 *     chunk group. Two sentences are NEVER packed into the same chunk.
 *  2. If a sentence fits in ≤ 2 display lines it is emitted as a single chunk.
 *     Minor punctuation (,  -  —  –  :  ;) does NOT force a break in this case.
 *  3. Only if a sentence exceeds 2 display lines is the "fill-first, break
 *     backwards" strategy applied: fill 2 lines, then look backwards in line 2
 *     for the last minor punctuation. If found, split there; otherwise split at
 *     the 2-line word boundary.
 *
 * Each chunk is returned as a single string with lines joined by '\n'.
 */
export function chunkSubtitleText(text: string, maxLineLen: number): string[] {
  if (!text.trim()) return [];

  const sentences = splitAtSentences(text.trim());
  const chunks: string[] = [];

  for (const sentence of sentences) {
    const lines = formatLines(sentence, maxLineLen);
    if (lines.length === 0) continue;

    if (lines.length <= 2) {
      // Sentence fits — emit as one chunk, no minor-punctuation splitting.
      chunks.push(lines.join('\n'));
    } else {
      // Sentence is too long — apply fill-first, break-backwards strategy.
      chunks.push(...chunkLongSentence(sentence, maxLineLen));
    }
  }

  return chunks;
}

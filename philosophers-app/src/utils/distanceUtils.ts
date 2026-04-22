/** Thinking duration in ms based on distance [0.1, 1.5].
 *  0.1-0.7: 1s (flat)
 *  0.7-1.3: scales from 1s to 5s (linear)
 *  1.3+: 5s (flat)
 */
export function computeThinkingTime(distance: number): number {
  if (distance <= 0.7) return 1000;
  if (distance <= 1.3) {
    return 1000 + ((distance - 0.7) / 0.6) * 4000; // 1000→5000 ms over [0.7, 1.3]
  }
  return 5000;
}

/** Dead-air answer delay in ms based on distance [0.1, 1.5].
 *  0.1-0.75: 0.5s (flat)
 *  0.75-1.2: scales from 0.5s to 3s (linear)
 *  1.2+: 3s (flat)
 */
export function computeAnswerDelay(distance: number): number {
  if (distance <= 0.75) return 500;
  if (distance <= 1.2) {
    return 500 + ((distance - 0.75) / 0.45) * 2500; // 500→3000 ms over [0.75, 1.2]
  }
  return 3000;
}

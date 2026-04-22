/** Thinking duration in ms based on distance [0.1, 1.5]. */
export function computeThinkingTime(distance: number): number {
  if (distance <= 0.5) return 1000;
  return 1000 + ((distance - 0.5) / 1.0) * 4000; // 1000→5000 ms over [0.5, 1.5]
}

/** Dead-air answer delay in ms based on distance [0.1, 1.5]. */
export function computeAnswerDelay(distance: number): number {
  if (distance <= 0.8) return 500;
  return 500 + ((distance - 0.8) / 0.7) * 2500; // 500→3000 ms over [0.8, 1.5]
}

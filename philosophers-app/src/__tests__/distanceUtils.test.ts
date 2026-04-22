import { describe, it, expect } from 'vitest';
import { computeThinkingTime, computeAnswerDelay } from '../utils/distanceUtils';

describe('computeThinkingTime', () => {
  it('returns 1000 for distance 0.1 (below lower bound)', () => {
    expect(computeThinkingTime(0.1)).toBe(1000);
  });
  it('returns 1000 for distance 0.5 (lower bound)', () => {
    expect(computeThinkingTime(0.5)).toBe(1000);
  });
  it('returns 3000 for distance 1.0 (midpoint)', () => {
    expect(computeThinkingTime(1.0)).toBe(3000);
  });
  it('returns 5000 for distance 1.5 (upper bound)', () => {
    expect(computeThinkingTime(1.5)).toBe(5000);
  });
});

describe('computeAnswerDelay', () => {
  it('returns 500 for distance 0.1 (below lower bound)', () => {
    expect(computeAnswerDelay(0.1)).toBe(500);
  });
  it('returns 500 for distance 0.8 (lower bound)', () => {
    expect(computeAnswerDelay(0.8)).toBe(500);
  });
  it('returns ~1750 for distance 1.15 (midpoint)', () => {
    expect(computeAnswerDelay(1.15)).toBeCloseTo(1750, 0);
  });
  it('returns 3000 for distance 1.5 (upper bound)', () => {
    expect(computeAnswerDelay(1.5)).toBe(3000);
  });
});

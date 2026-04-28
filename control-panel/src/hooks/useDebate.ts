/**
 * Write-only debate hook for the controls frontend.
 *
 * Does NOT poll GET /api/next-response — that is the display frontend's job.
 * All state (isDebating) comes from useStatus().
 * This hook only exposes the write-side: submit, abort, live instructions,
 * audience questions.
 */
import { useState } from 'react';
import {
  submitQuestion,
  clearQuestion,
} from '../api';

interface UseDebateReturn {
  error: string | null;
  startDebate: (
    question: string,
    isVoiceEnabled?: boolean,
    bargeIn?: boolean,
    addressedTo?: string,
    endAfterResponse?: boolean,
    bargeInInstruction?: string,
    bargeInDisplayText?: string,
  ) => Promise<void>;
  abortDebate: () => Promise<void>;
}

export function useDebate(): UseDebateReturn {
  const [error, setError] = useState<string | null>(null);

  async function startDebate(
    question: string,
    isVoiceEnabled: boolean = true,
    bargeIn: boolean = false,
    addressedTo?: string,
    endAfterResponse?: boolean,
    bargeInInstruction?: string,
    bargeInDisplayText?: string,
  ): Promise<void> {
    setError(null);
    await clearQuestion();
    const ok = await submitQuestion(
      question, isVoiceEnabled, bargeIn,
      addressedTo, endAfterResponse, bargeInInstruction, bargeInDisplayText,
    );
    if (!ok) setError('Failed to submit question. Is the backend running?');
  }

  async function abortDebate(): Promise<void> {
    setError(null);
    await clearQuestion();
  }

  return { error, startDebate, abortDebate };
}

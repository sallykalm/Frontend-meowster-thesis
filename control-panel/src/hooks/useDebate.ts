/**
 * Write-only debate hook for the controls frontend.
 *
 * Does NOT poll GET /api/next-response — that is the display frontend's job.
 * All state (isDebating, awaitingAudienceInput) comes from useStatus().
 * This hook only exposes the write-side: submit, abort, live instructions,
 * audience questions.
 */
import { useState } from 'react';
import {
  submitQuestion,
  clearQuestion,
  submitAudienceQuestion,
  postLiveInstruction,
  postCorrectTranscript,
} from '../api';

interface UseDebateReturn {
  error: string | null;
  startDebate: (question: string, isVoiceEnabled?: boolean) => Promise<void>;
  abortDebate: () => Promise<void>;
  sendLiveInstruction: (
    instruction: string,
    contextQuestion?: string,
    recentSpeaker?: string | null,
  ) => Promise<string | null>;
  handleAudienceQuestion: (
    question: string,
    addressedTo: string[],
    isFollowup: boolean,
  ) => Promise<void>;
}

export function useDebate(): UseDebateReturn {
  const [error, setError] = useState<string | null>(null);

  async function startDebate(question: string, isVoiceEnabled: boolean = true): Promise<void> {
    setError(null);
    await clearQuestion();
    const ok = await submitQuestion(question, isVoiceEnabled);
    if (!ok) setError('Failed to submit question. Is the backend running?');
  }

  async function abortDebate(): Promise<void> {
    setError(null);
    await clearQuestion();
  }

  async function sendLiveInstruction(
    instruction: string,
    contextQuestion: string = '',
    recentSpeaker: string | null = null,
  ): Promise<string | null> {
    const corrected = await postCorrectTranscript(
      instruction,
      contextQuestion,
      recentSpeaker,
    ).catch(() => instruction);
    return postLiveInstruction(corrected);
  }

  async function handleAudienceQuestion(
    question: string,
    addressedTo: string[],
    isFollowup: boolean,
  ): Promise<void> {
    const accepted = await submitAudienceQuestion(question, addressedTo, isFollowup);
    if (!accepted) setError('Failed to submit audience question. Session may no longer be waiting.');
    else setError(null);
  }

  return { error, startDebate, abortDebate, sendLiveInstruction, handleAudienceQuestion };
}

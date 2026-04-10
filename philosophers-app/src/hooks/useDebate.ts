import { useState, useRef } from 'react';
import { submitQuestion, getNextResponse } from '../api';
import type { ApiResponse } from '../api';
import { BASE_URL, MAX_LINE_LENGTH, THINKING_DELAY_MS, FINISHED_LINES_KEPT } from '../constants';
import type { ChatMessage } from '../types';

/** Splits text into lines no longer than maxLen characters, breaking at word boundaries. */
export function formatLines(text: string, maxLen = MAX_LINE_LENGTH): string[] {
  const lines: string[] = [];
  let t = text;
  while (t.length > maxLen) {
    let idx = t.lastIndexOf(' ', maxLen);
    if (idx === -1) idx = maxLen;
    lines.push(t.slice(0, idx));
    t = t.slice(idx).trim();
  }
  if (t.length) lines.push(t);
  return lines;
}

function playAudio(url: string): Promise<void> {
  // When BASE_URL is absolute (direct connection), prefix with its origin.
  // When BASE_URL is relative (Vite proxy), audio_url is already relative to current origin.
  const audioSrc = BASE_URL.startsWith('http')
    ? `${new URL(BASE_URL).origin}${url}`
    : url;
  const audio = new Audio(audioSrc);
  return new Promise<void>((res) => {
    audio.addEventListener('ended', () => res(), { once: true });
    audio.addEventListener('error', (e) => {
      console.error('Audio playback failed:', e);
      res();
    }, { once: true });
    audio.play().catch((e: unknown) => {
      console.error('Audio play() rejected:', e);
      res();
    });
  });
}

interface UseDebateReturn {
  finishedLines: ChatMessage[];
  currentLine: ChatMessage | null;
  currentPhilosopher: string | null;
  thinkingName: string | null;
  submittedQuestion: string;
  isDebating: boolean;
  error: string | null;
  startDebate: (question: string) => Promise<void>;
  abortDebate: () => void;
}

export function useDebate(): UseDebateReturn {
  const [finishedLines, setFinishedLines] = useState<ChatMessage[]>([]);
  const [currentLine, setCurrentLine] = useState<ChatMessage | null>(null);
  const [currentPhilosopher, setCurrentPhilosopher] = useState<string | null>(null);
  const [thinkingName, setThinkingName] = useState<string | null>(null);
  const [submittedQuestion, setSubmittedQuestion] = useState('');
  const [isDebating, setIsDebating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function processPhilosopherTurn(
    data: ApiResponse,
    lastPhilosopher: string | null,
    signal: AbortSignal,
  ): Promise<void> {
    // Show thinking delay when the speaking philosopher changes
    if (lastPhilosopher && data.philosopher !== lastPhilosopher) {
      setCurrentPhilosopher(null);
      setThinkingName(data.philosopher);
      await new Promise<void>((res) => {
        const t = setTimeout(res, THINKING_DELAY_MS);
        signal.addEventListener('abort', () => { clearTimeout(t); res(); }, { once: true });
      });
      if (signal.aborted) return;
      setThinkingName(null);
    }

    setThinkingName(data.philosopher);
    setCurrentPhilosopher(data.philosopher);

    const audioPromise = data.audio_url ? playAudio(data.audio_url) : Promise.resolve();

    for (const line of formatLines(data.text)) {
      if (signal.aborted) break;
      await new Promise<void>((resolve) => {
        setCurrentLine({
          id: Date.now() + Math.random(),
          philosopher: data.philosopher,
          text: line,
          isNew: true,
          onComplete: () => {
            setFinishedLines((prev) => {
              const updated = [
                ...prev,
                { id: Date.now() + Math.random(), philosopher: data.philosopher, text: line, isNew: false },
              ];
              return updated.slice(-FINISHED_LINES_KEPT);
            });
            setCurrentLine(null);
            resolve();
          },
        });
      });
    }

    await audioPromise;
  }

  async function runDebateLoop(question: string, signal: AbortSignal): Promise<void> {
    const submitted = await submitQuestion(question);
    if (!submitted) {
      setError('Failed to submit question — is the backend running?');
      return;
    }

    let lastPhilosopher: string | null = null;

    while (!signal.aborted) {
      const data = await getNextResponse();
      if (!data) break;

      await processPhilosopherTurn(data, lastPhilosopher, signal);
      if (!signal.aborted) setThinkingName(null);
      lastPhilosopher = data.philosopher;

      if (data.is_last) break;
    }
  }

  async function startDebate(question: string): Promise<void> {
    setError(null);
    setIsDebating(true);
    setFinishedLines([]);
    setCurrentLine(null);
    setCurrentPhilosopher(null);
    setThinkingName(null);
    setSubmittedQuestion(question);

    abortRef.current = new AbortController();
    const { signal } = abortRef.current;

    try {
      await runDebateLoop(question, signal);
    } catch (e) {
      console.error('Debate error:', e);
      setError('Something went wrong. Please try again.');
    } finally {
      if (signal.aborted) {
        setFinishedLines([]);
        setCurrentLine(null);
        setSubmittedQuestion('');
      }
      setThinkingName(null);
      setCurrentPhilosopher(null);
      setIsDebating(false);
    }
  }

  function abortDebate(): void {
    if (abortRef.current && !abortRef.current.signal.aborted) {
      abortRef.current.abort();
    }
  }

  return {
    finishedLines,
    currentLine,
    currentPhilosopher,
    thinkingName,
    submittedQuestion,
    isDebating,
    error,
    startDebate,
    abortDebate,
  };
}

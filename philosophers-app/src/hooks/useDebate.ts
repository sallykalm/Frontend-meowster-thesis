import { useState, useRef } from 'react';
import { submitQuestion, getNextResponse, clearQuestion, submitAudienceQuestion, fetchIntroductions, postLiveInstruction, postCorrectTranscript } from '../api';
import type { ApiResponse } from '../api';
import { BASE_URL, MAX_LINE_LENGTH, SUBTITLE_CLEAR_DELAY_MS, THINKING_DELAY_MS, FINISHED_LINES_KEPT } from '../constants';
import type { ChatMessage, SubtitleChunk } from '../types';
import { chunkSubtitleText } from '../utils/subtitleChunker';
import { mapChunksToTimings } from '../utils/mapChunksToTimings';

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

function resolveAudioSrc(url: string): string {
  return BASE_URL.startsWith('http') ? `${new URL(BASE_URL).origin}${url}` : url;
}

/** Creates an Audio element and a promise that resolves when playback ends. */
function createAudio(url: string): { audio: HTMLAudioElement; promise: Promise<void> } {
  const audio = new Audio(resolveAudioSrc(url));
  const promise = new Promise<void>((res) => {
    audio.addEventListener('ended', () => res(), { once: true });
    audio.addEventListener('error', (e) => {
      console.error('Audio playback failed:', e);
      res();
    }, { once: true });
  });
  return { audio, promise };
}

/** Resolves when audio.currentTime reaches targetTime, or the signal aborts. */
function waitForAudioTime(
  audio: HTMLAudioElement,
  targetTime: number,
  signal: AbortSignal,
): Promise<void> {
  return new Promise<void>((resolve) => {
    if (audio.currentTime >= targetTime) { resolve(); return; }

    let rafId: number;
    const check = () => {
      if (signal.aborted || audio.currentTime >= targetTime) {
        resolve();
        return;
      }
      rafId = requestAnimationFrame(check);
    };
    rafId = requestAnimationFrame(check);
    signal.addEventListener('abort', () => {
      cancelAnimationFrame(rafId);
      resolve();
    }, { once: true });
  });
}


function sleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

interface UseDebateReturn {
  finishedLines: ChatMessage[];
  currentLine: ChatMessage | null;
  currentPhilosopher: string | null;
  thinkingName: string | null;
  interruptingName: string | null;
  submittedQuestion: string;
  isAudienceQuestion: boolean;
  questionRevision: number;
  isDebating: boolean;
  error: string | null;
  awaitingAudienceInput: boolean;
  isAudioPlaying: boolean;
  subtitleChunk: SubtitleChunk | null;
  stopCurrentAudio: () => void;
  interruptCurrentLine: () => void;
  sendLiveInstruction: (instruction: string) => Promise<string | null>;
  startDebate: (question: string, isVoiceEnabled?: boolean) => Promise<void>;
  abortDebate: () => void;
  resolveQuestionTypewriter: () => void;
  handleAudienceQuestion: (question: string, addressedTo: string[], isFollowup: boolean) => Promise<void>;
  runIntroduction: (isVoiceEnabled: boolean) => Promise<void>;
}

export function useDebate(): UseDebateReturn {
  const [finishedLines, setFinishedLines] = useState<ChatMessage[]>([]);
  const [currentLine, setCurrentLine] = useState<ChatMessage | null>(null);
  const [currentPhilosopher, setCurrentPhilosopher] = useState<string | null>(null);
  const [thinkingName, setThinkingName] = useState<string | null>(null);
  const [interruptingName, setInterruptingName] = useState<string | null>(null);
  const [submittedQuestion, setSubmittedQuestion] = useState('');
  const [isAudienceQuestion, setIsAudienceQuestion] = useState(false);
  const [questionRevision, setQuestionRevision] = useState(0);
  const [isDebating, setIsDebating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [awaitingAudienceInput, setAwaitingAudienceInput] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const questionTypewriterResolveRef = useRef<(() => void) | null>(null);
  const awaitingAudienceInputRef = useRef(false);
  // Set by interruptCurrentLine(); checked before each line in processPhilosopherTurn
  // so the whole turn stops, not just the single line being typed.
  const turnInterruptedRef = useRef(false);

  // Prefetch: holds the promise for the next response, started during the last
  // line of a philosopher's turn so the typewriter can be interrupted early.
  const prefetchPromiseRef = useRef<Promise<ApiResponse | null> | null>(null);

  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const audioResolveRef = useRef<(() => void) | null>(null);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [subtitleChunk, setSubtitleChunk] = useState<SubtitleChunk | null>(null);
  const subtitleClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tracks the last philosopher who completed a turn — used as STT correction context.
  const lastPhilosopherRef = useRef<string | null>(null);

  function setAudienceAwaiting(value: boolean): void {
    awaitingAudienceInputRef.current = value;
    setAwaitingAudienceInput(value);
  }

  function resolveQuestionTypewriter(): void {
    questionTypewriterResolveRef.current?.();
    questionTypewriterResolveRef.current = null;
  }

  async function waitForAudienceQuestion(signal: AbortSignal): Promise<void> {
    while (!signal.aborted && awaitingAudienceInputRef.current) {
      await sleep(100);
    }
  }

  function playAudioTracked(url: string): Promise<void> {
    const audioSrc = BASE_URL.startsWith('http')
      ? `${new URL(BASE_URL).origin}${url}`
      : url;
    const audio = new Audio(audioSrc);
    currentAudioRef.current = audio;
    setIsAudioPlaying(true);
    return new Promise<void>((res) => {
      audioResolveRef.current = res;
      audio.addEventListener('ended', () => {
        currentAudioRef.current = null;
        audioResolveRef.current = null;
        setIsAudioPlaying(false);
        res();
      }, { once: true });
      audio.addEventListener('error', (e) => {
        console.error('Audio playback failed:', e);
        currentAudioRef.current = null;
        audioResolveRef.current = null;
        setIsAudioPlaying(false);
        res();
      }, { once: true });
      audio.play().catch((e: unknown) => {
        console.error('Audio play() rejected:', e);
        currentAudioRef.current = null;
        audioResolveRef.current = null;
        setIsAudioPlaying(false);
        res();
      });
    });
  }

  function stopCurrentAudio(): void {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }
    // Resolve the hanging audioPromise — pause() does not fire 'ended',
    // so without this the debate loop stalls forever at `await audioPromise`.
    const resolve = audioResolveRef.current;
    audioResolveRef.current = null;
    resolve?.();
    setIsAudioPlaying(false);
  }

  function interruptCurrentLine(): void {
    turnInterruptedRef.current = true;
    setCurrentLine((prev) => (prev ? { ...prev, interrupted: true } : prev));
  }

  async function sendLiveInstruction(instruction: string): Promise<string | null> {
    interruptCurrentLine();
    stopCurrentAudio();
    // Discard any pre-fetched response — the next poll must get a fresh one
    // generated with the instruction already in context.
    prefetchPromiseRef.current = null;
    const corrected = await postCorrectTranscript(
      instruction,
      submittedQuestion,
      lastPhilosopherRef.current,
    ).catch(() => instruction);
    return postLiveInstruction(corrected);
  }

  async function processPhilosopherTurn(
    data: ApiResponse,
    lastPhilosopher: string | null,
    signal: AbortSignal,
  ): Promise<void> {
    // System sentinel: the session is paused waiting for an audience question.
    if (data.turn_type === 'awaiting_audience_input') {
      setAudienceAwaiting(true);
      return;
    }

    // Clear the audience flag for all non-sentinel turns so the UI hides again.
    setAudienceAwaiting(false);

    // Moderator next_question: update the question banner and wait for typewriter to finish
    if (data.turn_type === 'next_question') {
      setSubmittedQuestion(data.text);
      setQuestionRevision((r) => r + 1);
      await new Promise<void>((resolve) => {
        questionTypewriterResolveRef.current = resolve;
        signal.addEventListener('abort', () => resolve(), { once: true });
      });
      return;
    }

    // Thinking/interrupting delay when the speaking philosopher changes
    if (
      lastPhilosopher &&
      data.philosopher !== lastPhilosopher &&
      data.philosopher !== 'SYSTEM'
    ) {
      setCurrentPhilosopher(null);

      if (data.turn_type === 'interruption') {
        // Interruptions feel immediate, very short delay, different label
        setInterruptingName(data.philosopher);
        await new Promise<void>((res) => {
          const t = setTimeout(res, 400);
          signal.addEventListener('abort', () => {
            clearTimeout(t);
            res();
          }, { once: true });
        });
        if (signal.aborted) return;
        setInterruptingName(null);
      } else {
        setThinkingName(data.philosopher);
        await new Promise<void>((res) => {
          const t = setTimeout(res, THINKING_DELAY_MS);
          signal.addEventListener('abort', () => {
            clearTimeout(t);
            res();
          }, { once: true });
        });
        if (signal.aborted) return;
        setThinkingName(null);
      }
    }

    if (data.philosopher !== 'SYSTEM') {
      setThinkingName(data.philosopher);
    }

    // Trigger GIF only when text is about to render, not during thinking delay
    setCurrentPhilosopher(data.philosopher === 'SYSTEM' ? null : data.philosopher);

    turnInterruptedRef.current = false;

    if (data.subtitles?.length && data.audio_url) {
      await processSubtitleTurn(data, signal);
    } else {
      await processTypewriterTurn(data, signal);
    }
  }

  /**
   * Subtitle-driven turn: shows chunks of up to 2 lines at a time, advancing
   * at word-timing boundaries. Audio is tracked in currentAudioRef so
   * barge-in (stopCurrentAudio) can interrupt it cleanly.
   */
  async function processSubtitleTurn(data: ApiResponse, signal: AbortSignal): Promise<void> {
    // Cancel any pending clear from the previous turn
    if (subtitleClearTimerRef.current !== null) {
      clearTimeout(subtitleClearTimerRef.current);
      subtitleClearTimerRef.current = null;
    }

    const { audio, promise: audioEnded } = createAudio(data.audio_url!);
    currentAudioRef.current = audio;
    setIsAudioPlaying(true);
    const audioPromise = new Promise<void>((res) => {
      audioResolveRef.current = res;
      void audioEnded.then(() => {
        currentAudioRef.current = null;
        audioResolveRef.current = null;
        setIsAudioPlaying(false);
        res();
      });
    });

    audio.play().catch((e: unknown) => { console.error('Audio play() rejected:', e); });

    const chunks = chunkSubtitleText(data.text, MAX_LINE_LENGTH);
    const timings = mapChunksToTimings(chunks, data.subtitles!);

    // Show first chunk immediately
    if (timings.length > 0) {
      setSubtitleChunk({ text: timings[0].chunk, philosopher: data.philosopher, turnType: data.turn_type });
    }

    // Advance on each subsequent chunk's showAt time
    for (let i = 1; i < timings.length; i++) {
      await waitForAudioTime(audio, timings[i].showAt, signal);
      if (signal.aborted) break;
      setSubtitleChunk({ text: timings[i].chunk, philosopher: data.philosopher, turnType: data.turn_type });
    }

    await audioPromise;

    const wasInterrupted = turnInterruptedRef.current;
    if (wasInterrupted || signal.aborted) {
      // Interrupted: clear immediately so the next speaker can take over
      setSubtitleChunk(null);
    } else {
      // Normal end: 0.5 s grace period, then clear
      subtitleClearTimerRef.current = setTimeout(() => {
        subtitleClearTimerRef.current = null;
        setSubtitleChunk(null);
      }, SUBTITLE_CLEAR_DELAY_MS);
    }
  }

  /**
   * Typewriter mode: reveals each display line character-by-character using a
   * fixed-interval timer. Audio plays in parallel via playAudioTracked so
   * barge-in can stop it. Prefetches the next response on the last line to
   * enable mid-stream interruption detection.
   */
  async function processTypewriterTurn(data: ApiResponse, signal: AbortSignal): Promise<void> {
    const audioPromise = data.audio_url ? playAudioTracked(data.audio_url) : Promise.resolve();


    const lines = formatLines(data.text);
    for (let i = 0; i < lines.length; i += 1) {
      if (signal.aborted || turnInterruptedRef.current) break;

      const line = lines[i];
      const isLastLine = i === lines.length - 1;

      // Shared mutable state between onComplete and the prefetch callback.
      // When interrupted, the prefetch sets storedText to the truncated version
      // BEFORE onComplete fires, so finishedLines gets the right text.
      const lineState = { storedText: line };

      await new Promise<void>((resolve) => {
        setCurrentLine({
          id: Date.now() + Math.random(),
          philosopher: data.philosopher,
          text: line,
          isNew: true,
          turnType: data.turn_type,
          onComplete: (finalText?: string) => {
            setFinishedLines((prev) => {
              const updated = [
                ...prev,
                {
                  id: Date.now() + Math.random(),
                  philosopher: data.philosopher,
                  text: finalText ?? lineState.storedText,
                  isNew: false,
                  turnType: data.turn_type,
                },
              ];
              return updated.slice(-FINISHED_LINES_KEPT);
            });
            setCurrentLine(null);
            resolve();
          },
        });

        // On the last line: prefetch the next response so we can interrupt
        // the typewriter mid-stream if an interruption is coming.
        if (isLastLine && prefetchPromiseRef.current === null) {
          prefetchPromiseRef.current = getNextResponse(signal).then((nextData) => {
            if (
              nextData?.turn_type === 'interruption' &&
              nextData.interrupted_speaker === data.philosopher
            ) {
              setCurrentLine((prev) => (prev ? { ...prev, interrupted: true } : prev));
            }
            return nextData;
          });
        }
      });
    }

    // Typing is done — stop the GIF now rather than waiting for audio to finish.
    // This prevents the last speaker's portrait from staying "active" after the
    // conversation ends while TTS audio is still playing.
    setCurrentPhilosopher(null);

    await audioPromise;
  }

  async function runDebateLoop(
    question: string,
    signal: AbortSignal,
    isVoiceEnabled: boolean = true,
  ): Promise<void> {
    // Clear any previous session state before starting a new debate
    await clearQuestion();

    const submitted = await submitQuestion(question, isVoiceEnabled);
    if (!submitted) {
      setError('Failed to submit question. Is the backend running?');
      return;
    }

    let lastPhilosopher: string | null = null;

    while (!signal.aborted) {
      // Pause locally while waiting for a live audience question.
      // This keeps the loop alive instead of letting it die on null / timeout.
      if (awaitingAudienceInputRef.current) {
        await waitForAudienceQuestion(signal);
        continue;
      }

      // Use the prefetched response if the last turn already fetched it.
      let data: ApiResponse | null;
      if (prefetchPromiseRef.current !== null) {
        data = await prefetchPromiseRef.current;
        prefetchPromiseRef.current = null;
      } else {
        data = await getNextResponse(signal);
      }

      // If we are currently paused for audience input, do not break the loop.
      // Just wait until the audience question has been submitted.
      if (!data) {
        if (awaitingAudienceInputRef.current) {
          await waitForAudienceQuestion(signal);
          continue;
        }
        break;
      }

      await processPhilosopherTurn(data, lastPhilosopher, signal);

      if (!signal.aborted) {
        setThinkingName(null);
        setInterruptingName(null);
      }

      if (data.philosopher !== 'SYSTEM') {
        lastPhilosopher = data.philosopher;
        lastPhilosopherRef.current = data.philosopher;
      }

      if (data.is_last) break;
    }

    setCurrentPhilosopher(null);
    setThinkingName(null);
    setInterruptingName(null);
  }

  async function handleAudienceQuestion(
    question: string,
    addressedTo: string[],
    isFollowup: boolean,
  ): Promise<void> {
    const accepted = await submitAudienceQuestion(question, addressedTo, isFollowup);

    if (accepted) {
      setError(null);
      setIsAudienceQuestion(true);
      setSubmittedQuestion(question);
      setAudienceAwaiting(false);
    } else {
      setError('Failed to submit audience question. Session may no longer be waiting.');
    }
  }

  async function startDebate(question: string, isVoiceEnabled: boolean = true): Promise<void> {
    setError(null);
    setIsDebating(true);
    setFinishedLines([]);
    setCurrentLine(null);
    setCurrentPhilosopher(null);
    setThinkingName(null);
    setInterruptingName(null);
    setSubmittedQuestion(question);
    setIsAudienceQuestion(false);
    setAudienceAwaiting(false);
    prefetchPromiseRef.current = null;

    if (subtitleClearTimerRef.current !== null) {
      clearTimeout(subtitleClearTimerRef.current);
      subtitleClearTimerRef.current = null;
    }
    setSubtitleChunk(null);

    turnInterruptedRef.current = false;
    abortRef.current = new AbortController();
    const { signal } = abortRef.current;

    try {
      await runDebateLoop(question, signal, isVoiceEnabled);
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
      setInterruptingName(null);
      setCurrentPhilosopher(null);
      setAudienceAwaiting(false);
      setIsDebating(false);
    }
  }

  function abortDebate(): void {
    if (abortRef.current && !abortRef.current.signal.aborted) {
      abortRef.current.abort();
    }
  }

  async function runIntroduction(isVoiceEnabled: boolean): Promise<void> {
    if (isDebating) return;

    const introductions = await fetchIntroductions();
    if (!introductions.length) return;

    setIsDebating(true);
    setFinishedLines([]);
    setCurrentLine(null);
    setCurrentPhilosopher(null);
    setThinkingName(null);

    for (const intro of introductions) {
      // Brief thinking delay before each philosopher
      setThinkingName(intro.philosopher);
      await sleep(THINKING_DELAY_MS);
      setThinkingName(null);
      setCurrentPhilosopher(intro.philosopher);

      // Start audio in parallel with typewriter
      const audioPromise =
        isVoiceEnabled && intro.audio_url ? playAudioTracked(intro.audio_url) : Promise.resolve();

      await new Promise<void>((resolve) => {
        setCurrentLine({
          id: Date.now() + Math.random(),
          philosopher: intro.philosopher,
          text: intro.text,
          isNew: true,
          turnType: 'introduction',
          onComplete: () => {
            setFinishedLines((prev) =>
              [
                ...prev,
                {
                  id: Date.now() + Math.random(),
                  philosopher: intro.philosopher,
                  text: intro.text,
                  isNew: false,
                  turnType: 'introduction',
                },
              ].slice(-FINISHED_LINES_KEPT),
            );
            setCurrentLine(null);
            resolve();
          },
        });
      });

      await audioPromise;
    }

    setCurrentPhilosopher(null);
    setThinkingName(null);
    setIsDebating(false);
  }

  return {
    finishedLines,
    currentLine,
    currentPhilosopher,
    thinkingName,
    interruptingName,
    submittedQuestion,
    isAudienceQuestion,
    questionRevision,
    isDebating,
    error,
    awaitingAudienceInput,
    isAudioPlaying,
    subtitleChunk,
    stopCurrentAudio,
    interruptCurrentLine,
    sendLiveInstruction,
    startDebate,
    abortDebate,
    resolveQuestionTypewriter,
    handleAudienceQuestion,
    runIntroduction,
  };
}
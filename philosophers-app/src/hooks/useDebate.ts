import { useState, useRef } from 'react';
import { submitQuestion, getNextResponse, clearQuestion, postLiveInstruction, postCorrectTranscript } from '../api';
import type { ApiResponse } from '../api';
import { BASE_URL, MAX_LINE_LENGTH, SUBTITLE_CLEAR_DELAY_MS, FINISHED_LINES_KEPT } from '../constants';
import type { ChatMessage, SubtitleChunk } from '../types';
import { chunkSubtitleText } from '../utils/subtitleChunker';
import { mapChunksToTimings } from '../utils/mapChunksToTimings';
import { computeThinkingTime, computeAnswerDelay } from '../utils/distanceUtils';

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
      // Safety: if audio ended or errored without reaching targetTime, unblock.
      if (audio.ended || audio.error) {
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
    // Also unblock if playback ends before targetTime (e.g. shorter-than-expected audio)
    audio.addEventListener('ended', () => { cancelAnimationFrame(rafId); resolve(); }, { once: true });
    audio.addEventListener('error', () => { cancelAnimationFrame(rafId); resolve(); }, { once: true });
  });
}


/** Like sleep(), but resolves early if the signal is aborted. */
function sleepAbortable(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve) => {
    if (signal.aborted) { resolve(); return; }
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true });
  });
}

interface UseDebateReturn {
  finishedLines: ChatMessage[];
  currentLine: ChatMessage | null;
  currentPhilosopher: string | null;
  thinkingName: string | null;
  interruptingName: string | null;
  submittedQuestion: string;
  questionRevision: number;
  isDebating: boolean;
  error: string | null;
  isAudioPlaying: boolean;
  subtitleChunk: SubtitleChunk | null;
  stopCurrentAudio: () => void;
  interruptCurrentLine: () => void;
  setTtsMuted: (muted: boolean) => void;
  sendLiveInstruction: (instruction: string) => Promise<string | null>;
  startDebate: (question: string, isVoiceEnabled?: boolean) => Promise<void>;
  startPassiveLoop: () => void;
  abortDebate: () => void;
  resolveQuestionTypewriter: () => void;
  setPausePending: (val: boolean) => void;
  triggerHardReset: () => void;
  deactivateTalking: () => void;
  resetForNewQuestion: () => void;
  resetForBargein: () => void;
  clearPrefetch: () => void;
  clearHistory: () => void;
  ragRelevanceMap: Record<string, number | null>;
}

export function useDebate(): UseDebateReturn {
  const [finishedLines, setFinishedLines] = useState<ChatMessage[]>([]);
  const [currentLine, setCurrentLine] = useState<ChatMessage | null>(null);
  const [currentPhilosopher, setCurrentPhilosopher] = useState<string | null>(null);
  const [thinkingName, setThinkingName] = useState<string | null>(null);
  const [interruptingName, setInterruptingName] = useState<string | null>(null);
  const [submittedQuestion, setSubmittedQuestion] = useState('');
  const [questionRevision, setQuestionRevision] = useState(0);
  const [isDebating, setIsDebating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ragRelevanceMap, setRagRelevanceMap] = useState<Record<string, number | null>>({});

  const abortRef = useRef<AbortController | null>(null);
  const questionTypewriterResolveRef = useRef<(() => void) | null>(null);
  const pausePendingRef = useRef(false);
  // Set by interruptCurrentLine(); checked before each line in processPhilosopherTurn
  // so the whole turn stops, not just the single line being typed.
  const turnInterruptedRef = useRef(false);

  // Prefetch: holds the promise for the next response, started during the last
  // line of a philosopher's turn so the typewriter can be interrupted early.
  const prefetchPromiseRef = useRef<Promise<ApiResponse | null> | null>(null);
  // Owns the AbortController for the in-flight prefetch fetch so clearPrefetch()
  // can cancel the HTTP request and prevent it from consuming a queue slot.
  const prefetchAbortRef = useRef<AbortController | null>(null);

  // Feature 3+4: when the next philosopher's thinking was pre-started during
  // the current audio, these refs carry the state into processPhilosopherTurn
  // so it skips re-starting thinking and only waits the dead-air portion.
  const pendingAnswerDelayRef = useRef<number | null>(null);
  const thinkingPreStartedRef = useRef<boolean>(false);

  const ttsMutedRef = useRef(false);

  function setTtsMuted(muted: boolean): void {
    if (muted && !ttsMutedRef.current) {
      stopCurrentAudio();
    }
    ttsMutedRef.current = muted;
  }

  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const audioResolveRef = useRef<(() => void) | null>(null);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [subtitleChunk, setSubtitleChunk] = useState<SubtitleChunk | null>(null);
  const subtitleClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tracks the last philosopher who completed a turn — used as STT correction context.
  const lastPhilosopherRef = useRef<string | null>(null);

  function resolveQuestionTypewriter(): void {
    questionTypewriterResolveRef.current?.();
    questionTypewriterResolveRef.current = null;
  }

  function playAudioTracked(url: string): Promise<void> {
    if (ttsMutedRef.current) return Promise.resolve();
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
    // Discard any pre-fetched response and pre-started thinking state
    prefetchPromiseRef.current = null;
    pendingAnswerDelayRef.current = null;
    thinkingPreStartedRef.current = false;
    pendingAnswerDelayRef.current = null;
    thinkingPreStartedRef.current = false;
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
        // Start fetching B's response during A's thinking delay. Backend needs
        // 4–8 s to generate LLM text + TTS; starting here instead of at
        // audio-start gives the prefetch time to resolve before or early into
        // A's audio, so Feature 4 waitForAudioTime can fire mid-speech.
        if (data.subtitles?.length && data.audio_url && prefetchPromiseRef.current === null) {
          console.log('[overlap] early prefetch START during thinking delay for', data.philosopher);
          const prefetchController = new AbortController();
          prefetchAbortRef.current = prefetchController;
          prefetchPromiseRef.current = getNextResponse(AbortSignal.any([signal, prefetchController.signal]));
          prefetchPromiseRef.current.then(() => {
            console.log('[overlap] early prefetch RESOLVED (in thinking delay or later)');
          });
        }

        const answerDelayMs = pendingAnswerDelayRef.current ?? computeAnswerDelay(data.rag_relevance ?? 1.5);
        pendingAnswerDelayRef.current = null;

        const thinkingWasPreStarted = thinkingPreStartedRef.current;
        thinkingPreStartedRef.current = false;

        if (!thinkingWasPreStarted) {
          const thinkingMs = computeThinkingTime(data.rag_relevance ?? 1.5);
          setThinkingName(data.philosopher);
          await new Promise<void>((res) => {
            const t = setTimeout(res, thinkingMs);
            signal.addEventListener('abort', () => { clearTimeout(t); res(); }, { once: true });
          });
        } else {
          // Thinking GIF was pre-started during previous audio — only sleep the dead-air portion.
          setThinkingName(data.philosopher);
          await new Promise<void>((res) => {
            const t = setTimeout(res, answerDelayMs);
            signal.addEventListener('abort', () => { clearTimeout(t); res(); }, { once: true });
          });
        }

        if (signal.aborted) return;
        setThinkingName(null);
      }
    }

    if (data.philosopher !== 'SYSTEM') {
      setThinkingName(data.philosopher);
    }

    // Trigger GIF only when text is about to render, not during thinking delay
    setCurrentPhilosopher(data.philosopher === 'SYSTEM' ? null : data.philosopher);

    if (data.philosopher !== 'SYSTEM') {
      setRagRelevanceMap((prev) => ({
        ...prev,
        [data.philosopher]: data.rag_relevance ?? null,
      }));
      console.log('[rag]', data.philosopher, 'distance:', data.rag_relevance ?? 'null (no RAG)');
    }

    turnInterruptedRef.current = false;

    try {
      if (data.subtitles?.length && data.audio_url) {
        await processSubtitleTurn(data, signal);
      } else {
        await processTypewriterTurn(data, signal);
      }
    } finally {
      setCurrentPhilosopher(null);
    }
  }

  /**
   * Subtitle-driven turn: shows chunks of up to 2 lines at a time, advancing
   * at word-timing boundaries. Audio is tracked in currentAudioRef so
   * barge-in (stopCurrentAudio) can interrupt it cleanly.
   *
   * Prefetches the next response immediately so we can detect an incoming
   * interruption and cut audio at the exact timestamp the backend computed.
   */
  async function processSubtitleTurn(data: ApiResponse, signal: AbortSignal): Promise<void> {
    // Cancel any pending clear from the previous turn
    if (subtitleClearTimerRef.current !== null) {
      clearTimeout(subtitleClearTimerRef.current);
      subtitleClearTimerRef.current = null;
    }

    // Turn-level controller: aborted when audio.play() fails so waitForAudioTime
    // unblocks instead of spinning in rAF on a frozen currentTime.
    const turnController = new AbortController();
    const timingSignal = AbortSignal.any([signal, turnController.signal]);

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

    audio.play().catch(async (e: unknown) => {
      console.error('Audio play() rejected:', e);
      // Abort the turn controller so every waitForAudioTime call unblocks immediately.
      // Without this, the rAF loop spins forever when play() fails because
      // audio.currentTime never advances, audio.ended stays false, and audio.error is null.
      turnController.abort();
      const resolve = audioResolveRef.current;
      audioResolveRef.current = null;
      currentAudioRef.current = null;
      setIsAudioPlaying(false);
      // Fallback: keep text visible for the expected audio duration so responses
      // don't flash and disappear when autoplay is blocked by the browser.
      const durationMs = (data.subtitles?.at(-1)?.end ?? 4) * 1000;
      await sleepAbortable(Math.min(durationMs, 10_000), signal);
      resolve?.();
    });

    // Ensure a prefetch promise exists. For TTS turns where the philosopher
    // changes, an early prefetch was already started in processPhilosopherTurn
    // during A's thinking delay. For all other cases (first turn, same-philosopher
    // repeat, typewriter-then-subtitle fallback) we start one here.
    if (prefetchPromiseRef.current === null) {
      const prefetchController = new AbortController();
      prefetchAbortRef.current = prefetchController;
      prefetchPromiseRef.current = getNextResponse(AbortSignal.any([signal, prefetchController.signal]));
    }

    // Chain interruption detection and Feature 4 overlap onto whichever promise
    // is current. If the early prefetch already resolved (during A's thinking
    // delay), the .then() fires immediately as a microtask — audio is live so
    // waitForAudioTime works correctly regardless.
    console.log('[overlap] chaining .then() handler; prefetch already resolved?', prefetchPromiseRef.current !== null);
    const capturedController = prefetchAbortRef.current;
    prefetchPromiseRef.current = prefetchPromiseRef.current.then((nextData) => {
      // Clear the abort ref once resolved (normally or via abort).
      if (capturedController && prefetchAbortRef.current === capturedController) {
        prefetchAbortRef.current = null;
      }
      console.log('[overlap] prefetch .then() fired; audio.currentTime=', currentAudioRef.current?.currentTime, 'nextPhilosopher=', nextData?.philosopher);

      if (
        nextData?.turn_type === 'interruption' &&
        nextData.interrupted_speaker === data.philosopher
      ) {
        const cutTime = nextData.interrupted_audio_cut_time;

        const doCut = () => {
          // Unblock all waitForAudioTime rAF loops in the line loop below.
          turnController.abort();
          // Pause audio and resolve audioPromise so processSubtitleTurn exits.
          stopCurrentAudio();
          // Mark whatever line is currently on screen as interrupted.
          setCurrentLine((prev) => (prev ? { ...prev, interrupted: true } : prev));
        };

        if (cutTime != null && audio.currentTime < cutTime) {
          // Wait until audio reaches the computed cut point, then cut.
          void waitForAudioTime(audio, cutTime, signal).then(doCut);
        } else {
          // Already past cut time or no timestamp — cut immediately.
          doCut();
        }
      }

      // Feature 4: pre-start thinking for the next philosopher during current audio
      if (
        nextData &&
        nextData.turn_type !== 'interruption' &&
        nextData.philosopher !== data.philosopher &&
        nextData.philosopher !== 'SYSTEM'
      ) {
        const dist = nextData.rag_relevance ?? 1.5;
        const thinkingMs = computeThinkingTime(dist);
        const delayMs = computeAnswerDelay(dist);
        const overlapMs = thinkingMs - delayMs;

        if (overlapMs > 0) {
          // Use the exact audio duration from the JSON subtitles array instead of
          // waiting for audio.duration metadata to load. The last subtitle word
          // contains the precise audio end time.
          const subtitlesList = data.subtitles || [];
          const audioDurationSeconds = subtitlesList.length > 0
            ? subtitlesList[subtitlesList.length - 1].end
            : 0;

          const overlapStartTime = Math.max(0, audioDurationSeconds - (overlapMs / 1000));

          const doPreStartThinking = () => {
            if (signal.aborted) return;
            thinkingPreStartedRef.current = true;
            pendingAnswerDelayRef.current = delayMs;
            setThinkingName(nextData.philosopher);
          };

          console.log('[overlap] Feature4: audioDuration=', audioDurationSeconds, 'overlapStart=', overlapStartTime, 'overlapMs=', overlapMs, 'audio.currentTime=', audio.currentTime, 'audio.ended=', audio.ended);
          if (audioDurationSeconds > 0 && !audio.ended) {
            void waitForAudioTime(audio, overlapStartTime, signal).then(() => {
              console.log('[overlap] waitForAudioTime reached; audio.currentTime=', audio.currentTime, 'calling doPreStartThinking');
              doPreStartThinking();
            });
          } else {
            // Audio already ended or no subtitle duration — fire immediately.
            console.log('[overlap] audio already ended or no duration, firing doPreStartThinking immediately');
            doPreStartThinking();
          }
        }
      }

      return nextData;
    });

    const chunks = chunkSubtitleText(data.text, MAX_LINE_LENGTH);
    const timings = mapChunksToTimings(chunks, data.subtitles!);

    // Show first chunk immediately
    if (timings.length > 0) {
      setSubtitleChunk({ text: timings[0].chunk, philosopher: data.philosopher, turnType: data.turn_type });
    }

    // Advance on each subsequent chunk's showAt time
    for (let i = 1; i < timings.length; i++) {
      if (signal.aborted || turnController.signal.aborted) break;
      await waitForAudioTime(audio, timings[i].showAt, timingSignal);
      if (signal.aborted || turnController.signal.aborted) break;
      setSubtitleChunk({ text: timings[i].chunk, philosopher: data.philosopher, turnType: data.turn_type });
    }

    await audioPromise;

    const wasInterrupted = turnInterruptedRef.current;
    if (wasInterrupted || signal.aborted) {
      setSubtitleChunk(null);
    } else {
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
          const prefetchController = new AbortController();
          prefetchAbortRef.current = prefetchController;
          prefetchPromiseRef.current = getNextResponse(AbortSignal.any([signal, prefetchController.signal])).then((nextData) => {
            // Clear the abort ref once resolved (normally or via abort).
            if (prefetchAbortRef.current === prefetchController) prefetchAbortRef.current = null;
            if (
              nextData?.turn_type === 'interruption' &&
              nextData.interrupted_speaker === data.philosopher
            ) {
              setCurrentLine((prev) => (prev ? { ...prev, interrupted: true } : prev));
              // Also cut the audio — typewriter mode plays audio in parallel
              // and it would otherwise finish naturally after the text stops.
              stopCurrentAudio();
            }

            // Feature 4 (typewriter): pre-start thinking immediately since we're on the last line
            if (
              nextData &&
              nextData.turn_type !== 'interruption' &&
              nextData.philosopher !== data.philosopher &&
              nextData.philosopher !== 'SYSTEM'
            ) {
              const dist = nextData.rag_relevance ?? 1.5;
              const thinkingMs = computeThinkingTime(dist);
              const delayMs = computeAnswerDelay(dist);
              const overlapMs = thinkingMs - delayMs;

              if (overlapMs > 0 && !signal.aborted) {
                thinkingPreStartedRef.current = true;
                pendingAnswerDelayRef.current = delayMs;
                setThinkingName(nextData.philosopher);
              }
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
      // Use the prefetched response if the last turn already fetched it.
      let data: ApiResponse | null;
      if (prefetchPromiseRef.current !== null) {
        data = await prefetchPromiseRef.current;
        prefetchPromiseRef.current = null;
      } else {
        data = await getNextResponse(signal);
      }

      if (!data) break;

      await processPhilosopherTurn(data, lastPhilosopher, signal);

      if (!signal.aborted) {
        if (!thinkingPreStartedRef.current) {
          setThinkingName(null);
        }
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

  async function startDebate(question: string, isVoiceEnabled: boolean = true): Promise<void> {
    setError(null);
    setIsDebating(true);
    setFinishedLines([]);
    setCurrentLine(null);
    setCurrentPhilosopher(null);
    setThinkingName(null);
    setInterruptingName(null);
    setSubmittedQuestion(question);
    prefetchPromiseRef.current = null;
    pendingAnswerDelayRef.current = null;
    thinkingPreStartedRef.current = false;
    pendingAnswerDelayRef.current = null;
    thinkingPreStartedRef.current = false;

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
      setIsDebating(false);
    }
  }

  /** Called by App.tsx when is_pause_pending changes in useStatus. */
  function setPausePending(val: boolean): void {
    pausePendingRef.current = val;
  }

  /**
   * Immediately stops audio + typewriter and exits the passive loop.
   * Does NOT clear finishedLines — text stays on screen.
   * Called when hard_reset_seq increments in useStatus.
   */
  function triggerHardReset(): void {
    stopCurrentAudio();
    turnInterruptedRef.current = true;
    setCurrentLine((prev) => (prev ? { ...prev, interrupted: true } : prev));
    if (abortRef.current) abortRef.current.abort();
    clearPrefetch();
    setCurrentPhilosopher(null);
    setThinkingName(null);
    setInterruptingName(null);
    setIsDebating(false);
    setFinishedLines([]);
    setCurrentLine(null);
    setSubmittedQuestion('');
  }

  function clearHistory(): void {
    setFinishedLines([]);
    setCurrentLine(null);
  }

  /** Discard any pre-fetched next-response so barge-in doesn't serve a stale turn. */
  function clearPrefetch(): void {
    // Abort the in-flight fetch so it doesn't consume a slot from the backend
    // queue after the barge-in gate opens (which would cause the main loop to
    // receive response #2 instead of #1).
    prefetchAbortRef.current?.abort();
    prefetchAbortRef.current = null;
    prefetchPromiseRef.current = null;
    // Clear pre-started thinking state so the next turn starts fresh.
    thinkingPreStartedRef.current = false;
    pendingAnswerDelayRef.current = null;
  }

  /** Force all philosopher GIFs back to idle. Called when deactivate_talking_seq increments. */
  function deactivateTalking(): void {
    setCurrentPhilosopher(null);
    setThinkingName(null);
    setInterruptingName(null);
  }

  /**
   * Stop current audio, clear all display state, and restart the passive loop.
   * Called when the display detects a new question_id from useStatus — meaning
   * the controls app submitted a new question while audio from the previous
   * debate was still playing.
   */
  function resetForNewQuestion(): void {
    stopCurrentAudio();
    clearPrefetch();
    turnInterruptedRef.current = false;
    setCurrentLine(null);
    setCurrentPhilosopher(null);
    setThinkingName(null);
    setInterruptingName(null);
    setIsDebating(false);
    setFinishedLines([]);
    setSubmittedQuestion('');
    startPassiveLoop();
  }

  /**
   * Called on the rising edge of barge_in_active. Immediately stops audio,
   * discards any pre-fetched (possibly already-resolved) response, aborts
   * the current passive loop, and restarts it clean. This prevents the
   * pre-fetched response for the OLD question from playing before the
   * barge-in question is answered — the re-started loop blocks on the
   * barge-in gate until the new question is submitted.
   */
  function resetForBargein(): void {
    stopCurrentAudio();
    clearPrefetch();
    turnInterruptedRef.current = true;
    setCurrentLine((prev) => (prev ? { ...prev, interrupted: true } : prev));
    setCurrentPhilosopher(null);
    setThinkingName(null);
    setInterruptingName(null);
    // Abort the current loop so it cannot consume the stale pre-fetched data.
    // startPassiveLoop() creates a new AbortController and a fresh loop that
    // starts with no prefetch and no stale state.
    startPassiveLoop();
  }

  /**
   * Passive display loop — polls `GET /api/next-response` continuously without
   * submitting a question. Idles on 404, resets after `is_last`.
   * Intended for the display-only frontend; the controls frontend calls
   * `startDebate` instead.
   */
  function startPassiveLoop(): void {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    const { signal } = abortRef.current;

    let lastPhilosopher: string | null = null;

    const loop = async (): Promise<void> => {
      while (!signal.aborted) {
        let data: ApiResponse | null;
        if (prefetchPromiseRef.current !== null) {
          data = await prefetchPromiseRef.current;
          prefetchPromiseRef.current = null;
        } else {
          data = await getNextResponse(signal);
        }

        if (!data) {
          // Idle: no active debate. Back off for 5 s before retrying so the
          // server log stays quiet when no question has been submitted.
          if (!signal.aborted) await sleepAbortable(5000, signal);
          continue;
        }

        setIsDebating(true);
        await processPhilosopherTurn(data, lastPhilosopher, signal);

        if (!signal.aborted) {
          if (!thinkingPreStartedRef.current) {
            setThinkingName(null);
          }
          setInterruptingName(null);
        }

        if (data.philosopher !== 'SYSTEM') {
          lastPhilosopher = data.philosopher;
          lastPhilosopherRef.current = data.philosopher;
        }

        // Soft-pause: stop after the current turn finishes, keep text on screen
        if (pausePendingRef.current && !signal.aborted) {
          setCurrentPhilosopher(null);
          setThinkingName(null);
          setInterruptingName(null);
          setIsDebating(false);
          // Tell backend to clear the pause flag
          void fetch(`${BASE_URL}soft-pause`, { method: 'POST' });
          break;
        }

        if (data.is_last) {
          setCurrentPhilosopher(null);
          setThinkingName(null);
          setInterruptingName(null);
          setIsDebating(false);
          lastPhilosopher = null;
          continue; // loop stays alive; polls idle (404 → 5 s sleep) until next debate
        }
      }
    };

    void loop();
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
    interruptingName,
    submittedQuestion,
    questionRevision,
    isDebating,
    error,
    isAudioPlaying,
    subtitleChunk,
    stopCurrentAudio,
    interruptCurrentLine,
    setTtsMuted,
    sendLiveInstruction,
    startDebate,
    startPassiveLoop,
    abortDebate,
    resolveQuestionTypewriter,
    setPausePending,
    triggerHardReset,
    deactivateTalking,
    resetForNewQuestion,
    resetForBargein,
    clearPrefetch,
    clearHistory,
    ragRelevanceMap,
  };
}
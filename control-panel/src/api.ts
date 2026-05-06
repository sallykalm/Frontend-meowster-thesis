import { BASE_URL } from './constants';

export interface Subtitle {
  word: string;
  start: number; // seconds into the audio
  end: number;
}

export interface ApiResponse {
  philosopher: string;
  text: string;
  audio_url?: string | null;
  is_last: boolean;
  turn_type?: string | null;
  // Set when turn_type === 'interruption': the speaker who was cut off and
  // their truncated text, so the frontend can update their last displayed line.
  interrupted_speaker?: string | null;
  interrupted_text?: string | null;
  subtitles?: Subtitle[] | null;
}

const REQUEST_TIMEOUT_MS = 10_000;
// Long-poll timeout must exceed the backend's own 90 s timeout so we always
// receive a 504 (retriable) rather than a client-side AbortError.
const LONG_POLL_TIMEOUT_MS = 100_000;
const MAX_504_RETRIES = 6;
const BACKOFF_INITIAL_MS = 500;
const BACKOFF_MAX_MS = 5_000;
const RETRY_DELAY_MS = 300;

/**
 * Fire-and-retry POST helper for idempotent endpoints.
 * Creates a fresh AbortSignal.timeout per attempt so a timed-out first attempt
 * doesn't poison the retry. Returns the Response on the first success, or null
 * after all retries are exhausted.
 */
async function postWithRetry(
  url: string,
  init: Omit<RequestInit, 'signal'> = {},
  retries: number = 1,
): Promise<Response | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    } catch {
      if (attempt < retries) {
        await new Promise<void>((res) => setTimeout(res, RETRY_DELAY_MS));
      }
    }
  }
  return null;
}

export interface HealthResponse {
  status: string;
  llm: boolean;
  tts: boolean;
  barge_in_enabled: boolean;
}

/** Fetches server health including TTS and barge-in status. Returns null on error. */
export async function fetchHealth(): Promise<HealthResponse | null> {
  try {
    const response = await fetch(`${BASE_URL}health`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    return await response.json() as HealthResponse;
  } catch {
    return null;
  }
}

/**
 * Signals the backend that the audience has started speaking (barge-in).
 * The backend flushes the TTS queue and sets a pending flag for Phase 4 wiring.
 * Returns true if accepted, false if barge-in is disabled or no debate is active.
 */
export async function postInterrupt(): Promise<boolean> {
  const response = await postWithRetry(`${BASE_URL}interrupt`, { method: 'POST' }, 3);
  return response?.ok ?? false;
}

/** Fetches the list of available philosopher names. Returns null on network error or non-200. */
export async function fetchPhilosophers(): Promise<string[] | null> {
  try {
    const response = await fetch(`${BASE_URL}philosophers`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    return await response.json() as string[];
  } catch (error) {
    console.error('Error fetching philosophers:', error);
    return null;
  }
}

/** Submits a question to start a new debate. Returns true if accepted by backend. */
export async function submitQuestion(
  text: string,
  generateAudio: boolean = true,
  bargeIn: boolean = false,
  addressedTo?: string,
  endAfterResponse?: boolean,
  bargeInInstruction?: string,
  bargeInDisplayText?: string,
): Promise<boolean> {
  try {
    const response = await fetch(`${BASE_URL}question`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        generate_audio: generateAudio,
        barge_in: bargeIn,
        addressed_to: addressedTo,
        end_after_response: endAfterResponse ?? false,
        barge_in_instruction: bargeInInstruction ?? '',
        barge_in_display_text: bargeInDisplayText ?? '',
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    return response.ok;
  } catch (error) {
    console.error('Error submitting question:', error);
    return false;
  }
}

/**
 * Polls for the next philosopher response.
 * Retries with exponential backoff on 504.
 * Returns null when the debate ends or after repeated failures.
 * Pass `debateSignal` so the fetch is aborted immediately when the debate is cancelled.
 */
export async function getNextResponse(debateSignal?: AbortSignal): Promise<ApiResponse | null> {
  let delay = BACKOFF_INITIAL_MS;

  for (let attempt = 0; attempt <= MAX_504_RETRIES; attempt += 1) {
    // Abort early if the debate was cancelled before we even try.
    if (debateSignal?.aborted) return null;

    try {
      const timeoutSignal = AbortSignal.timeout(LONG_POLL_TIMEOUT_MS);
      const signal = debateSignal
        ? AbortSignal.any([debateSignal, timeoutSignal])
        : timeoutSignal;

      const response = await fetch(`${BASE_URL}next-response`, { signal });

      if (response.status === 504) {
        if (attempt < MAX_504_RETRIES) {
          await new Promise<void>((res) => setTimeout(res, delay));
          delay = Math.min(delay * 2, BACKOFF_MAX_MS);
          continue;
        }
        return null;
      }

      // Session ended cleanly or no active question.
      if (response.status === 404) {
        return null;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json() as ApiResponse;

      // Allow sentinels (audience input pause, debate-end is_last) through even with empty text.
      const isSentinel = data.turn_type === 'awaiting_audience_input' || data.is_last;
      if (!data.philosopher || (!data.text && !isSentinel)) {
        throw new Error('Invalid response: missing required fields');
      }

      return data;
    } catch (error) {
      // A deliberate abort is not an error — return null cleanly.
      if (debateSignal?.aborted) return null;
      console.error('Error getting next response:', error);
      return null;
    }
  }

  return null;
}

/** Fetches the curated list of debate-mode seed questions. Returns [] on error. */
export async function fetchDebateQuestions(): Promise<string[]> {
  try {
    const response = await fetch(`${BASE_URL}debate-questions`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) return [];
    const data: unknown = await response.json();
    return Array.isArray(data) ? (data as string[]) : [];
  } catch {
    return [];
  }
}

/**
 * Submits a live audience question to the running session.
 * Only valid while the session is in the awaiting_audience_input state.
 * Returns true if accepted, false on error or conflict.
 */
export async function submitAudienceQuestion(
  question: string,
  addressedTo: string[] = [],
  isFollowup: boolean = false,
): Promise<boolean> {
  try {
    const response = await fetch(`${BASE_URL}audience-question`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question,
        addressed_to: addressedTo,
        is_followup: isFollowup,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    return response.ok;
  } catch (error) {
    console.error('Error submitting audience question:', error);
    return false;
  }
}

/**
 * Posts a live moderator instruction to the running debate.
 * displayText, if provided, is shown in the pink question box on the display.
 * Returns the corrected instruction text, or null on failure.
 */
export async function postLiveInstruction(
  instruction: string,
  displayText: string = '',
  addressedTo?: string,
  endAfterResponse?: boolean,
): Promise<string | null> {
  try {
    const response = await fetch(`${BASE_URL}live-instruction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instruction,
        display_text: displayText,
        addressed_to: addressedTo,
        end_after_response: endAfterResponse ?? false,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const data = await response.json() as { accepted: boolean; corrected: string };
    return data.accepted ? data.corrected : null;
  } catch {
    return null;
  }
}

export async function postMicState(state: string): Promise<void> {
  const active = state === 'warming' || state === 'ready' || state === 'speaking';
  await postWithRetry(
    `${BASE_URL}mic-state`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active, state }) },
    1,
  );
}

export interface BargeInClassification {
  type: 'question' | 'instruction' | 'both';
  corrected_text: string;
  question_part: string | null;
  instruction_part: string | null;
  addressed_to: string | null;
}

export async function postClassifyBargein(
  text: string,
  contextQuestion: string = '',
): Promise<BargeInClassification | null> {
  try {
    const response = await fetch(`${BASE_URL}classify-bargein`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, context_question: contextQuestion }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    return await response.json() as BargeInClassification;
  } catch {
    return null;
  }
}

/**
 * Corrects speech recognition errors in a transcript using LLM context.
 * Returns the corrected text, or the original text if the call fails.
 */
export async function postCorrectTranscript(
  text: string,
  contextQuestion: string = '',
  recentSpeaker: string | null = null,
): Promise<string> {
  try {
    const response = await fetch(`${BASE_URL}correct-transcript`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        context_question: contextQuestion,
        recent_speaker: recentSpeaker,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) return text;
    const data = await response.json() as { corrected: string };
    return data.corrected || text;
  } catch {
    return text;
  }
}

export async function postFastForward(active: boolean): Promise<void> {
  try {
    await fetch(`${BASE_URL}fast-forward`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch { /* non-fatal */ }
}

export async function postSoftPause(): Promise<void> {
  try {
    await fetch(`${BASE_URL}soft-pause`, {
      method: 'POST',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch { /* non-fatal */ }
}

export async function postHardReset(): Promise<void> {
  try {
    await fetch(`${BASE_URL}hard-reset`, {
      method: 'POST',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch { /* non-fatal */ }
}

export async function postTotalReset(): Promise<void> {
  try {
    await fetch(`${BASE_URL}total-reset`, {
      method: 'POST',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch { /* non-fatal */ }
}

export async function postCreditsToggle(): Promise<void> {
  try {
    await fetch(`${BASE_URL}credits`, {
      method: 'POST',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch { /* non-fatal */ }
}

export async function postDeactivateTalking(): Promise<void> {
  try {
    await fetch(`${BASE_URL}deactivate-talking`, {
      method: 'POST',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch { /* non-fatal */ }
}

export async function postRoundUp(): Promise<void> {
  try {
    await fetch(`${BASE_URL}round-up`, {
      method: 'POST',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch { /* non-fatal */ }
}

export async function postClearHistory(): Promise<void> {
  try {
    await fetch(`${BASE_URL}clear-history`, {
      method: 'POST',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch { /* non-fatal */ }
}

export async function postClearQuestion(): Promise<void> {
  try {
    await fetch(`${BASE_URL}clear-question`, {
      method: 'POST',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch { /* non-fatal */ }
}

export async function postToggleTtsMute(): Promise<boolean | null> {
  try {
    const response = await fetch(`${BASE_URL}toggle-tts-mute`, {
      method: 'POST',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const data = await response.json() as { tts_muted: boolean };
    return data.tts_muted;
  } catch {
    return null;
  }
}

/** Clears the current question from the backend session. */
export async function postImageSet(set: 1 | 2 | 3 | 4): Promise<void> {
  try {
    await fetch(`${BASE_URL}image-set`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_set: set }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    console.error('Error setting image set:', error);
  }
}

export async function clearQuestion(): Promise<void> {
  try {
    await fetch(`${BASE_URL}question`, {
      method: 'DELETE',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    console.error('Error clearing question:', error);
  }
}

export async function postBoot(): Promise<void> {
  try {
    await fetch(`${BASE_URL}boot`, {
      method: 'POST',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch { /* non-fatal */ }
}

/** Releases the barge-in gate when a barge-in is discarded without action. */
export async function postClearBargein(): Promise<void> {
  await postWithRetry(`${BASE_URL}clear-bargein`, { method: 'POST' }, 1);
}

// Converts any browser-decodable audio blob to a 16 kHz mono WAV.
// WAV (RIFF PCM) is universally accepted by Whisper APIs and has no container
// issues — sidesteps every MediaRecorder WebM finalization problem.
async function toWav(blob: Blob): Promise<Blob> {
  const ctx = new AudioContext({ sampleRate: 16_000 });
  try {
    const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
    const mono = new Float32Array(buf.length);
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const ch = buf.getChannelData(c);
      for (let i = 0; i < buf.length; i++) mono[i] += ch[i];
    }
    if (buf.numberOfChannels > 1) {
      for (let i = 0; i < mono.length; i++) mono[i] /= buf.numberOfChannels;
    }
    const pcm = new Int16Array(mono.length);
    for (let i = 0; i < mono.length; i++) {
      pcm[i] = Math.round(Math.max(-1, Math.min(1, mono[i])) * 0x7fff);
    }
    const header = new DataView(new ArrayBuffer(44));
    const wr = (off: number, s: string) => { for (let i = 0; i < s.length; i++) header.setUint8(off + i, s.charCodeAt(i)); };
    wr(0, 'RIFF'); header.setUint32(4, 36 + pcm.byteLength, true);
    wr(8, 'WAVE'); wr(12, 'fmt '); header.setUint32(16, 16, true);
    header.setUint16(20, 1, true);          // PCM
    header.setUint16(22, 1, true);          // mono
    header.setUint32(24, 16_000, true);     // sample rate
    header.setUint32(28, 32_000, true);     // byte rate (16000 * 1 * 2)
    header.setUint16(32, 2, true);          // block align
    header.setUint16(34, 16, true);         // bits per sample
    wr(36, 'data'); header.setUint32(40, pcm.byteLength, true);
    return new Blob([header.buffer, pcm.buffer], { type: 'audio/wav' });
  } finally {
    await ctx.close();
  }
}

/**
 * Sends a raw audio blob to the backend for Whisper transcription.
 * The backend calls OpenAI or Groq Whisper with philosopher-name vocabulary priming.
 * Returns the transcript string, or null if unavailable (no API key, network error, etc.).
 * Callers should fall back to the Web Speech API text when null is returned.
 */
export async function postTranscribe(blob: Blob): Promise<string | null> {
  try {
    let audio = blob;
    let filename = 'audio.webm';
    try {
      audio = await toWav(blob);
      filename = 'audio.wav';
    } catch {
      // Conversion failed (e.g. blob is corrupt) — send original and let the
      // backend/Groq decide. The backend now passes unknown formats to Groq anyway.
    }
    const form = new FormData();
    form.append('audio', audio, filename);
    const response = await fetch(`${BASE_URL}transcribe`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return null;
    const data = await response.json() as { transcript: string };
    return data.transcript?.trim() || null;
  } catch {
    return null;
  }
}
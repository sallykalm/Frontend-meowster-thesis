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
  // Seconds into the interrupted speaker's audio at which playback should stop.
  // Use this to cut their audio exactly where the interruption happened.
  interrupted_audio_cut_time?: number | null;
  subtitles?: Subtitle[] | null;
  // ChromaDB min distance (lower = more relevant). null if RAG was not used.
  rag_relevance?: number | null;
}

const REQUEST_TIMEOUT_MS = 10_000;
// Long-poll timeout must exceed the backend's own 90 s timeout so we always
// receive a 504 (retriable) rather than a client-side AbortError.
const LONG_POLL_TIMEOUT_MS = 100_000;
const MAX_504_RETRIES = 6;
const BACKOFF_INITIAL_MS = 500;
const BACKOFF_MAX_MS = 5_000;

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
  try {
    const response = await fetch(`${BASE_URL}interrupt`, {
      method: 'POST',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    return response.ok;
  } catch {
    return false;
  }
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
export async function submitQuestion(text: string, generateAudio: boolean = true): Promise<boolean> {
  try {
    const response = await fetch(`${BASE_URL}question`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, generate_audio: generateAudio }),
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

      // Allow the awaiting_audience_input sentinel through.
      const isSentinel = data.turn_type === 'awaiting_audience_input';
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
 * Returns the corrected instruction text, or null on failure.
 */
export async function postLiveInstruction(instruction: string): Promise<string | null> {
  try {
    const response = await fetch(`${BASE_URL}live-instruction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instruction }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const data = await response.json() as { accepted: boolean; corrected: string };
    return data.accepted ? data.corrected : null;
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

/** Clears the current question from the backend session. */
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
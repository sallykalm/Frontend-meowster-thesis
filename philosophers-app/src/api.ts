import { BASE_URL } from './constants';

export interface ApiResponse {
  philosopher: string;
  text: string;
  audio_url?: string | null;
  is_last: boolean;
}

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_504_RETRIES = 6;
const BACKOFF_INITIAL_MS = 500;
const BACKOFF_MAX_MS = 5_000;

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
 * Retries with exponential backoff on 504 (backend waiting for model).
 * Returns null when the debate ends or after repeated failures — caller should stop polling.
 */
export async function getNextResponse(): Promise<ApiResponse | null> {
  let delay = BACKOFF_INITIAL_MS;

  for (let attempt = 0; attempt <= MAX_504_RETRIES; attempt++) {
    try {
      const response = await fetch(`${BASE_URL}next-response`, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (response.status === 504) {
        if (attempt < MAX_504_RETRIES) {
          await new Promise<void>((res) => setTimeout(res, delay));
          delay = Math.min(delay * 2, BACKOFF_MAX_MS);
          continue;
        }
        return null;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json() as ApiResponse;
      if (!data.philosopher || !data.text) {
        throw new Error('Invalid response: missing required fields');
      }
      return data;
    } catch (error) {
      console.error('Error getting next response:', error);
      return null;
    }
  }

  return null;
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

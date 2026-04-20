import { useState, useEffect } from 'react';
import { BASE_URL } from '../constants';

export interface SessionStatus {
  active: boolean;
  awaiting_audience_input: boolean;
  question_id: string | null;
  barge_in_active: boolean;
  image_set: number;
  current_question: string;
  is_fast_forwarding: boolean;
  is_pause_pending: boolean;
  credits_open: boolean;
  hard_reset_seq: number;
  deactivate_talking_seq: number;
}

const DEFAULT_STATUS: SessionStatus = {
  active: false,
  awaiting_audience_input: false,
  question_id: null,
  barge_in_active: false,
  image_set: 1,
  current_question: '',
  is_fast_forwarding: false,
  is_pause_pending: false,
  credits_open: false,
  hard_reset_seq: 0,
  deactivate_talking_seq: 0,
};

/**
 * Polls GET /api/status every `intervalMs` milliseconds.
 * The display frontend uses this to show barge-in state on MicIndicator
 * without needing microphone access.
 */
export function useStatus(intervalMs: number = 2000): SessionStatus {
  const [status, setStatus] = useState<SessionStatus>(DEFAULT_STATUS);

  useEffect(() => {
    let cancelled = false;

    async function poll(): Promise<void> {
      try {
        const res = await fetch(`${BASE_URL}status`, {
          signal: AbortSignal.timeout(5000),
        });
        if (!cancelled && res.ok) {
          setStatus(await res.json() as SessionStatus);
        }
      } catch {
        // Network error — keep stale status, retry on next interval
      }
    }

    void poll();
    const id = setInterval(() => void poll(), intervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [intervalMs]);

  return status;
}

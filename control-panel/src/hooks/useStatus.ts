import { useState, useEffect } from 'react';
import { BASE_URL } from '../constants';

export interface SessionStatus {
  active: boolean;
  question_id: string | null;
  barge_in_active: boolean;
  image_set: number;
  current_question: string;
  is_fast_forwarding: boolean;
  is_pause_pending: boolean;
  credits_open: boolean;
  hard_reset_seq: number;
  deactivate_talking_seq: number;
  is_round_up_pending: boolean;
  clear_history_seq: number;
  clear_question_seq: number;
  tts_muted: boolean;
  bargein_display_text: string;
}

const DEFAULT_STATUS: SessionStatus = {
  active: false,
  question_id: null,
  barge_in_active: false,
  image_set: 1,
  current_question: '',
  is_fast_forwarding: false,
  is_pause_pending: false,
  credits_open: false,
  hard_reset_seq: 0,
  deactivate_talking_seq: 0,
  is_round_up_pending: false,
  clear_history_seq: 0,
  clear_question_seq: 0,
  tts_muted: false,
  bargein_display_text: '',
};

/**
 * Polls GET /api/status every `intervalMs` milliseconds.
 * The controls frontend uses this instead of polling /api/next-response
 * (which is single-consumer and owned by the display frontend).
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

import { useEffect, useRef } from 'react';
import { BASE_URL } from '../constants';

interface SseStopAudioEvent { type: 'stop_audio'; seq: number }
interface SseResetEvent     { type: 'reset';      seq: number }
type SseEvent = SseStopAudioEvent | SseResetEvent;

export interface UseEventsOptions {
  /** Fired immediately when POST /api/interrupt is received by the backend. */
  onStopAudio?: (seq: number) => void;
  /** Fired immediately when POST /api/hard-reset is received by the backend. */
  onReset?: (seq: number) => void;
}

/**
 * Connects to GET /api/events (SSE stream) and dispatches latency-critical
 * events sub-millisecond after they are emitted by the backend.
 *
 * The existing useStatus 50 ms poll remains as a fallback — deduplication
 * is handled by the caller via lastHandled* refs so neither path double-fires.
 *
 * Reconnects automatically every 2 s if the connection drops.
 */
export function useEvents({ onStopAudio, onReset }: UseEventsOptions): void {
  const onStopAudioRef = useRef(onStopAudio);
  const onResetRef     = useRef(onReset);
  useEffect(() => { onStopAudioRef.current = onStopAudio; }, [onStopAudio]);
  useEffect(() => { onResetRef.current = onReset; }, [onReset]);

  useEffect(() => {
    // Derive the SSE URL from BASE_URL so it respects VITE_API_HOST/PORT.
    const origin = BASE_URL.startsWith('http')
      ? new URL(BASE_URL).origin
      : window.location.origin;
    const url = `${origin}/api/events`;

    let es: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    function connect() {
      if (closed) return;
      es = new EventSource(url);

      es.onmessage = (ev: MessageEvent<string>) => {
        try {
          const data = JSON.parse(ev.data) as SseEvent;
          if (data.type === 'stop_audio') onStopAudioRef.current?.(data.seq);
          else if (data.type === 'reset')  onResetRef.current?.(data.seq);
        } catch { /* ignore malformed events */ }
      };

      es.onerror = () => {
        es?.close();
        es = null;
        if (!closed) reconnectTimer = setTimeout(connect, 2000);
      };
    }

    connect();

    return () => {
      closed = true;
      if (reconnectTimer !== null) clearTimeout(reconnectTimer);
      es?.close();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}

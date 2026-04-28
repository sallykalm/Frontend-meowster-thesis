import { useState, useEffect, useRef } from 'react';
import { SPEECH_LANGUAGE } from '../constants';

export type MicState = 'unsupported' | 'error' | 'paused' | 'idle' | 'warming' | 'speaking';

// Web Speech API types (not in lib.dom.d.ts by default)
interface SpeechRecognitionAlternative {
  readonly transcript: string;
  readonly confidence: number;
}

interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  readonly [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  readonly [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionEvent {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent {
  readonly error: string;
}

interface SpeechRecognition {
  continuous: boolean;
  interimResults: boolean;
  language: string;
  onstart: (() => void) | null;
  onspeechstart: (() => void) | null;
  onspeechend: (() => void) | null;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognition;

interface WindowWithSpeech extends Window {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
}

export interface UseVoiceInputOptions {
  /** Gate: recognition is paused while philosopher audio is playing. */
  isAudioPlaying: boolean;
  /** Master on/off switch — set false when push-to-talk is active. */
  enabled?: boolean;
  /** Fires immediately when speech energy is detected, before any transcript. */
  onSpeechStart?: () => void;
  /** Fires when a final transcript segment is ready. */
  onTranscriptReady?: (text: string) => void;
}

export interface UseVoiceInputReturn {
  micState: MicState;
  interimTranscript: string;
}

export function useVoiceInput({
  isAudioPlaying,
  enabled = true,
  onSpeechStart,
  onTranscriptReady,
}: UseVoiceInputOptions): UseVoiceInputReturn {
  const [micState, setMicState] = useState<MicState>('idle');
  const [interimTranscript, setInterimTranscript] = useState('');

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  // True when we actively want recognition running (not paused, not disabled).
  const shouldRunRef = useRef(false);
  const isMountedRef = useRef(true);
  // Accumulates final segments within a single speech-start → speech-end window.
  const finalBufferRef = useRef('');

  // Keep callback refs stable so event handlers never close over stale props.
  const onSpeechStartRef = useRef(onSpeechStart);
  const onTranscriptReadyRef = useRef(onTranscriptReady);
  useEffect(() => { onSpeechStartRef.current = onSpeechStart; }, [onSpeechStart]);
  useEffect(() => { onTranscriptReadyRef.current = onTranscriptReady; }, [onTranscriptReady]);

  function startRecognition(): void {
    if (!recognitionRef.current) return;
    try {
      recognitionRef.current.start();
    } catch {
      // Throws DOMException if already started — safe to ignore.
    }
  }

  function stopRecognition(): void {
    if (!recognitionRef.current) return;
    try {
      recognitionRef.current.stop();
    } catch {
      // ignore
    }
  }

  // Initialise recognition once on mount. Starting/stopping is handled by the
  // gating effect below, which also runs on mount after this effect.
  useEffect(() => {
    isMountedRef.current = true;

    const win = window as WindowWithSpeech;
    const SpeechRecognitionImpl =
      win.SpeechRecognition ?? win.webkitSpeechRecognition;

    if (!SpeechRecognitionImpl) {
      setMicState('unsupported');
      return;
    }

    const recognition = new SpeechRecognitionImpl();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.language = SPEECH_LANGUAGE;

    recognition.onspeechstart = () => {
      if (!isMountedRef.current) return;
      finalBufferRef.current = '';
      setInterimTranscript('');
      setMicState('speaking');
      onSpeechStartRef.current?.();
    };

    recognition.onspeechend = () => {
      if (!isMountedRef.current) return;
      setMicState('idle');
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      if (!isMountedRef.current) return;
      let interim = '';
      let hasFinal = false;
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const segment = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalBufferRef.current += segment;
          hasFinal = true;
          onTranscriptReadyRef.current?.(finalBufferRef.current.trim());
        } else {
          interim += segment;
        }
      }
      if (hasFinal) {
        // A final result means the speech segment ended — return to idle so the
        // indicator doesn't get stuck in 'speaking' if onspeechend never fires
        // (e.g. when the mic is muted externally mid-stream).
        setMicState('idle');
        setInterimTranscript('');
        // finalBufferRef is intentionally kept — it accumulates across segments
        // within one speech window and is cleared by onspeechstart on the next utterance.
      } else {
        setInterimTranscript(finalBufferRef.current + interim);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (!isMountedRef.current) return;
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        // Permission denied — don't try to restart.
        setMicState('error');
        shouldRunRef.current = false;
      }
      // 'no-speech' and 'aborted' are normal operational events, not failures.
    };

    recognition.onend = () => {
      if (!isMountedRef.current) return;
      setInterimTranscript('');
      finalBufferRef.current = '';
      if (shouldRunRef.current) {
        // Web Speech API stops itself periodically — restart after a short gap.
        setTimeout(startRecognition, 150);
      }
    };

    recognitionRef.current = recognition;

    return () => {
      isMountedRef.current = false;
      shouldRunRef.current = false;
      // Null the onend handler before stopping so auto-restart doesn't fire
      // after the component unmounts.
      recognition.onend = null;
      stopRecognition();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // runs once on mount; gating is handled in the effect below

  // Track whether enabled was true in the previous render so we can detect the
  // false→true transition and show a warmup indicator.
  const prevEnabledRef = useRef(enabled);

  // Gate recognition on audio playback and the enabled flag.
  // Also runs on mount (after the init effect), which performs the initial start.
  useEffect(() => {
    if (!recognitionRef.current) return;
    const wasEnabled = prevEnabledRef.current;
    prevEnabledRef.current = enabled;

    const shouldRun = !isAudioPlaying && enabled;
    shouldRunRef.current = shouldRun;
    if (shouldRun) {
      // Start the hardware immediately so the VAD pipeline warms up.
      startRecognition();
      if (!wasEnabled) {
        // Mic was just unmuted: show warmup indicator (~1500 ms) so the user
        // knows to wait before speaking. Web Speech API needs ~1-2 s to
        // initialise its voice-activity detector — speaking too early causes the
        // first word to be missed.
        setMicState('warming');
        setTimeout(() => {
          if (shouldRunRef.current) setMicState('idle');
        }, 1500);
      } else {
        setMicState('idle');
      }
    } else {
      setMicState(isAudioPlaying ? 'paused' : 'idle');
      setInterimTranscript('');
      finalBufferRef.current = '';
      stopRecognition();
    }
  }, [isAudioPlaying, enabled]);

  return { micState, interimTranscript };
}

import { useState, useEffect, useRef } from 'react';
import { SPEECH_LANGUAGE } from '../constants';

export type MicState = 'unsupported' | 'error' | 'paused' | 'idle' | 'warming' | 'ready' | 'speaking';

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

interface SpeechGrammarList {
  addFromString(string: string, weight?: number): void;
}

interface SpeechRecognition {
  continuous: boolean;
  interimResults: boolean;
  language: string;
  grammars?: SpeechGrammarList;
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
  SpeechGrammarList?: new () => SpeechGrammarList;
  webkitSpeechGrammarList?: new () => SpeechGrammarList;
}

export interface UseVoiceInputOptions {
  /** Gate: recognition is paused while philosopher audio is playing. */
  isAudioPlaying: boolean;
  /** Master on/off switch — set false when push-to-talk is active. */
  enabled?: boolean;
  /** Fires immediately when speech energy is detected, before any transcript. */
  onSpeechStart?: () => void;
  /**
   * Fires when a final transcript segment is ready.
   * Only called when onAudioReady is not provided or audio capture failed.
   */
  onTranscriptReady?: (text: string) => void;
  /**
   * When provided, fires instead of onTranscriptReady with a raw audio blob
   * (suitable for Whisper) plus the Web Speech fallback text.
   * A new MediaRecorder is created on each onspeechstart and stopped on commit,
   * so every blob is a complete, self-contained WebM file with its own EBML header.
   */
  onAudioReady?: (blob: Blob, fallbackText: string) => void;
}

export interface UseVoiceInputReturn {
  micState: MicState;
  interimTranscript: string;
}

// Silence required after the last isFinal result before the transcript is
// committed for classification. Prevents mid-thought pauses (where the browser
// fires isFinal on a fragment) from triggering early processing.
const TRANSCRIPT_COMMIT_DELAY_MS = 2500;

export function useVoiceInput({
  isAudioPlaying,
  enabled = true,
  onSpeechStart,
  onTranscriptReady,
  onAudioReady,
}: UseVoiceInputOptions): UseVoiceInputReturn {
  const [micState, setMicState] = useState<MicState>('idle');
  const [interimTranscript, setInterimTranscript] = useState('');

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  // True when we actively want recognition running (not paused, not disabled).
  const shouldRunRef = useRef(false);
  // True during the ~3000 ms VAD warmup after the mic is first enabled.
  // Prevents postInterrupt() firing before the pipeline is stable.
  const warmingRef = useRef(false);
  const isMountedRef = useRef(true);
  // Accumulates final segments until the commit timer fires (across mid-thought pauses).
  const finalBufferRef = useRef('');
  // Fires onTranscriptReady after TRANSCRIPT_COMMIT_DELAY_MS of silence.
  // Replaced immediately on each new final result so mid-thought pauses don't commit early.
  const transcriptCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Fires when onspeechend fires but Web Speech produced no final result — sends the
  // audio blob directly to Whisper so the question isn't silently dropped.
  const speechEndCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Per-utterance audio capture for Whisper transcription.
  // A new MediaRecorder is started on each onspeechstart. collectAndSendAudio
  // stops it and waits for the complete blob in onstop, so every blob sent to
  // Whisper is a fully-formed WebM file starting with a proper EBML header.
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const utteranceRecorderRef = useRef<MediaRecorder | null>(null);
  const utteranceChunksRef = useRef<Blob[]>([]);

  // Start recording the current utterance. No-op if already recording (mid-thought
  // pauses fire onspeechstart again — the same recorder covers the whole utterance).
  function startUtteranceRecording(): void {
    if (utteranceRecorderRef.current?.state === 'recording') return;
    const stream = mediaStreamRef.current;
    if (!stream || typeof MediaRecorder === 'undefined') return;
    const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg'].find(
      (m) => MediaRecorder.isTypeSupported(m),
    );
    utteranceChunksRef.current = [];
    const rec = new MediaRecorder(stream, mimeType ? { mimeType } : {});
    rec.ondataavailable = (e: BlobEvent) => {
      if (e.data.size > 0) utteranceChunksRef.current.push(e.data);
    };
    rec.start(200); // 200 ms chunks so stop() picks up the final partial frame quickly
    utteranceRecorderRef.current = rec;
  }

  // Stop the utterance recorder and deliver the complete blob to the caller.
  // Waits for onstop so every chunk (including the final partial frame flushed by
  // stop()) is included. Falls back to text if no recorder was active.
  function collectAndSendAudio(
    fallbackText: string,
    onAudio: (blob: Blob, text: string) => void,
    onTextOnly: (text: string) => void,
  ): void {
    const rec = utteranceRecorderRef.current;

    if (!rec || rec.state === 'inactive') {
      console.warn(
        '[useVoiceInput] collectAndSendAudio: no active utterance recorder — falling back to text (rec=%s)',
        rec ? 'inactive' : 'null',
      );
      onTextOnly(fallbackText);
      return;
    }

    // Claim this recorder; the next onspeechstart will create a fresh one.
    utteranceRecorderRef.current = null;
    const chunks = utteranceChunksRef.current;
    utteranceChunksRef.current = [];

    const mimeType = rec.mimeType || 'audio/webm';

    let settled = false;
    function finish(): void {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      rec!.removeEventListener('dataavailable', handleFinalData);
      rec!.removeEventListener('stop', handleStop);
      if (!chunks.length) {
        console.warn('[useVoiceInput] collectAndSendAudio: recorder stopped but no chunks — falling back to text');
        onTextOnly(fallbackText);
        return;
      }
      console.debug('[useVoiceInput] collectAndSendAudio: sending %d chunks (%s)', chunks.length, mimeType);
      onAudio(new Blob(chunks, { type: mimeType }), fallbackText);
    }

    const handleFinalData = (e: BlobEvent): void => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    const handleStop = (): void => { finish(); };

    rec.addEventListener('dataavailable', handleFinalData);
    rec.addEventListener('stop', handleStop);
    // Safety net: if onstop doesn't arrive within 500 ms, proceed with what we have.
    const timeoutId = setTimeout(finish, 500);

    try {
      rec.stop();
    } catch {
      finish();
    }
  }

  // Keep callback refs stable so event handlers never close over stale props.
  const onSpeechStartRef = useRef(onSpeechStart);
  const onTranscriptReadyRef = useRef(onTranscriptReady);
  const onAudioReadyRef = useRef(onAudioReady);
  useEffect(() => { onSpeechStartRef.current = onSpeechStart; }, [onSpeechStart]);
  useEffect(() => { onTranscriptReadyRef.current = onTranscriptReady; }, [onTranscriptReady]);
  useEffect(() => { onAudioReadyRef.current = onAudioReady; }, [onAudioReady]);

  // FSM for the Web Speech API lifecycle. The browser's recognition engine is
  // async: start() and stop() don't take effect immediately. Tracking actual
  // engine state prevents double-start/double-stop races and the "listens while
  // muted" bug where stop() fires before start() has completed and is silently
  // ignored by the browser.
  const recognitionStateRef = useRef<'idle' | 'starting' | 'active' | 'stopping'>('idle');
  // Set when stop is requested while the engine is still in 'starting' —
  // the deferred stop fires in onstart once the engine is ready.
  const pendingStopRef = useRef(false);

  function startRecognition(): void {
    if (!recognitionRef.current) return;
    if (recognitionStateRef.current !== 'idle') return;
    try {
      recognitionStateRef.current = 'starting';
      recognitionRef.current.start();
    } catch {
      // DOMException if somehow double-started — reset state and let the next
      // gating effect call decide what to do.
      recognitionStateRef.current = 'idle';
    }
  }

  function stopRecognition(): void {
    if (!recognitionRef.current) return;
    const state = recognitionStateRef.current;
    if (state === 'idle' || state === 'stopping') return;
    if (state === 'starting') {
      // Engine not ready yet — defer the stop to onstart.
      pendingStopRef.current = true;
      return;
    }
    try {
      recognitionStateRef.current = 'stopping';
      recognitionRef.current.stop();
    } catch {
      recognitionStateRef.current = 'idle';
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
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMicState('unsupported');
      return;
    }

    const recognition = new SpeechRecognitionImpl();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.language = SPEECH_LANGUAGE;

    // Bias the browser's STT engine toward philosopher names so "Flusser",
    // "Virilio", "Weizenbaum", and "Weibel" are recognised correctly when
    // a visitor addresses a philosopher directly. SpeechGrammarList is
    // optional and vendor-prefixed — ignore failures silently.
    const SpeechGrammarListImpl = win.SpeechGrammarList ?? win.webkitSpeechGrammarList;
    if (SpeechGrammarListImpl && recognition.grammars !== undefined) {
      try {
        const grammarList = new SpeechGrammarListImpl();
        grammarList.addFromString(
          '#JSGF V1.0; grammar philosophers; public <name> = Flusser | Virilio | Weizenbaum | Weibel;',
          1,
        );
        recognition.grammars = grammarList;
      } catch {
        // optional API — ignore
      }
    }

    recognition.onstart = () => {
      recognitionStateRef.current = 'active';
      if (pendingStopRef.current) {
        // A stop was requested while we were still starting — execute it now.
        pendingStopRef.current = false;
        stopRecognition();
      }
    };

    recognition.onspeechstart = () => {
      if (!isMountedRef.current) return;
      // Cancel any pending speech-end Whisper commit from a previous segment.
      if (speechEndCommitTimerRef.current !== null) {
        clearTimeout(speechEndCommitTimerRef.current);
        speechEndCommitTimerRef.current = null;
      }
      // Do NOT clear finalBufferRef here. Mid-thought pauses trigger onspeechend
      // then onspeechstart again — clearing here would lose everything said before
      // the pause. The buffer is only cleared after the commit timer fires.
      setInterimTranscript('');
      setMicState('speaking');
      // Do not fire the interrupt callback during the VAD warmup window —
      // speech detected too early produces a truncated transcript and would
      // cut the philosopher's audio for no useful input.
      if (!warmingRef.current) {
        onSpeechStartRef.current?.();
        // Start per-utterance recording. No-op if already recording (mid-thought pause).
        startUtteranceRecording();
        // 7 s fallback: in noisy environments the browser's VAD fires onspeechstart
        // but onspeechend never fires (background noise keeps VAD active indefinitely)
        // and Web Speech produces no final result. After 7 s we send the captured
        // audio straight to Whisper so the visitor's question isn't silently dropped.
        speechEndCommitTimerRef.current = setTimeout(() => {
          speechEndCommitTimerRef.current = null;
          if (finalBufferRef.current || transcriptCommitTimerRef.current !== null) return;
          collectAndSendAudio(
            '',
            (blob, t) => { onAudioReadyRef.current?.(blob, t); },
            () => { onTranscriptReadyRef.current?.(''); },
          );
        }, 7000);
      }
    };

    recognition.onspeechend = () => {
      if (!isMountedRef.current) return;
      setMicState(shouldRunRef.current ? 'ready' : 'idle');
      // If speech ended but Web Speech produced no final result and there is no
      // pending commit timer, send the raw audio to Whisper after a short delay.
      // This handles browsers that detect voice activity (VAD) but can't transcribe
      // the speech (accent, language, noise) — Whisper is more robust than the
      // browser's STT and will pick up what was said.
      if (!finalBufferRef.current && transcriptCommitTimerRef.current === null) {
        if (speechEndCommitTimerRef.current !== null) {
          clearTimeout(speechEndCommitTimerRef.current);
        }
        speechEndCommitTimerRef.current = setTimeout(() => {
          speechEndCommitTimerRef.current = null;
          // Double-check: Web Speech may have caught up with a final result by now.
          if (finalBufferRef.current || transcriptCommitTimerRef.current !== null) return;
          collectAndSendAudio(
            '',
            (blob, t) => { onAudioReadyRef.current?.(blob, t); },
            () => { onTranscriptReadyRef.current?.(''); },
          );
        }, 800);
      }
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
        } else {
          interim += segment;
        }
      }
      if (hasFinal) {
        // Web Speech produced a real result — cancel the speech-end Whisper fallback
        // (normal commit-timer path will handle this utterance instead).
        if (speechEndCommitTimerRef.current !== null) {
          clearTimeout(speechEndCommitTimerRef.current);
          speechEndCommitTimerRef.current = null;
        }
        // A final result means the speech segment ended — return to ready/idle so
        // the indicator doesn't get stuck in 'speaking' if onspeechend never fires
        // (e.g. when the mic is muted externally mid-stream).
        setMicState(shouldRunRef.current ? 'ready' : 'idle');
        setInterimTranscript('');
        // Debounced commit: reset the timer on every final result so mid-thought
        // pauses (2-3 s between words) don't trigger early processing. The transcript
        // is committed only after TRANSCRIPT_COMMIT_DELAY_MS of uninterrupted silence.
        if (transcriptCommitTimerRef.current !== null) {
          clearTimeout(transcriptCommitTimerRef.current);
        }
        transcriptCommitTimerRef.current = setTimeout(() => {
          transcriptCommitTimerRef.current = null;
          const text = finalBufferRef.current.trim();
          finalBufferRef.current = '';
          if (!text) return;
          collectAndSendAudio(
            text,
            (blob, t) => { onAudioReadyRef.current?.(blob, t); },
            (t) => { onTranscriptReadyRef.current?.(t); },
          );
        }, TRANSCRIPT_COMMIT_DELAY_MS);
      } else {
        // Show the full accumulated buffer + current interim for live feedback.
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
      recognitionStateRef.current = 'idle';
      pendingStopRef.current = false;
      setInterimTranscript('');
      // Don't clear finalBufferRef here: a periodic engine restart (continuous mode)
      // fires onend then immediately restarts — clearing would lose the buffer before
      // the commit timer has a chance to fire. The commit timer handles the clear.
      if (shouldRunRef.current) {
        // Web Speech API stops itself periodically — restart after a short gap.
        setTimeout(startRecognition, 150);
      }
    };

    recognitionRef.current = recognition;

    // Acquire the mic stream for per-utterance recording.
    // getUserMedia is separate from Web Speech API — Chrome auto-grants if mic
    // permission was already given, so no second dialog appears.
    navigator.mediaDevices?.getUserMedia({ audio: true, video: false })
      .then((stream) => {
        if (!isMountedRef.current) { stream.getTracks().forEach((t) => t.stop()); return; }
        mediaStreamRef.current = stream;
        // Recording starts on demand in startUtteranceRecording() — no continuous
        // recorder here, so there is no EBML init-segment tracking needed.
      })
      .catch(() => {
        // Permission denied or API unavailable — audio capture disabled.
        // The commit path falls back to Web Speech text automatically.
      });

    return () => {
      isMountedRef.current = false;
      shouldRunRef.current = false;
      if (transcriptCommitTimerRef.current !== null) {
        clearTimeout(transcriptCommitTimerRef.current);
        transcriptCommitTimerRef.current = null;
      }
      if (speechEndCommitTimerRef.current !== null) {
        clearTimeout(speechEndCommitTimerRef.current);
        speechEndCommitTimerRef.current = null;
      }
      // Stop any in-progress utterance recorder.
      if (utteranceRecorderRef.current && utteranceRecorderRef.current.state !== 'inactive') {
        try { utteranceRecorderRef.current.stop(); } catch { /* ignore */ }
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      // Null handlers before stopping so auto-restart and deferred pendingStop
      // don't fire after the component unmounts.
      recognition.onend = null;
      recognition.onstart = null;
      stopRecognition();
    };
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
        // Mic was just unmuted: show warmup indicator (~3000 ms) so the user
        // knows to wait before speaking. Web Speech API needs ~1-2 s to
        // initialise its voice-activity detector — speaking too early causes the
        // first word to be missed. The longer window also prevents the room mic
        // from picking up trailing philosopher TTS audio at the moment of unmute.
        warmingRef.current = true;
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setMicState('warming');
        setTimeout(() => {
          warmingRef.current = false;
          if (shouldRunRef.current) setMicState('ready');
        }, 3000);
      } else {
        setMicState('ready');
      }
    } else {
      warmingRef.current = false;
      setMicState(isAudioPlaying ? 'paused' : 'idle');
      setInterimTranscript('');
      finalBufferRef.current = '';
      // Cancel any pending Whisper commit timers.
      if (speechEndCommitTimerRef.current !== null) {
        clearTimeout(speechEndCommitTimerRef.current);
        speechEndCommitTimerRef.current = null;
      }
      // Discard any in-progress utterance recording — the user is muted/paused
      // and the partial audio should not be sent.
      if (utteranceRecorderRef.current) {
        try {
          utteranceRecorderRef.current.ondataavailable = null;
          utteranceRecorderRef.current.stop();
        } catch { /* ignore */ }
        utteranceRecorderRef.current = null;
        utteranceChunksRef.current = [];
      }
      stopRecognition();
    }
  }, [isAudioPlaying, enabled]);

  return { micState, interimTranscript };
}

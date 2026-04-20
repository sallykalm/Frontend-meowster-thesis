import { useState, useRef, useCallback } from 'react';
import { SPEECH_LANGUAGE } from '../constants';

// Minimal typed interface for the Web Speech API (not in lib.dom.d.ts by default)
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
  mozSpeechRecognition?: SpeechRecognitionConstructor;
  msSpeechRecognition?: SpeechRecognitionConstructor;
}

interface UseWebSpeechReturn {
  isListening: boolean;
  transcript: string;
  start: () => void;
  stop: () => void;
  reset: () => void;
}

export const useWebSpeech = (): UseWebSpeechReturn => {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const finalTranscriptRef = useRef('');
  const interimTranscriptRef = useRef('');

  const initializeRecognition = useCallback(() => {
    if (recognitionRef.current) return;

    const win = window as WindowWithSpeech;
    const SpeechRecognitionImpl: SpeechRecognitionConstructor | undefined =
      win.SpeechRecognition ||
      win.webkitSpeechRecognition ||
      win.mozSpeechRecognition ||
      win.msSpeechRecognition;

    if (!SpeechRecognitionImpl) {
      console.warn('Speech Recognition API not supported in this browser');
      return;
    }

    const recognition = new SpeechRecognitionImpl();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.language = SPEECH_LANGUAGE;

    recognition.onstart = () => {
      setIsListening(true);
      finalTranscriptRef.current = '';
      interimTranscriptRef.current = '';
      setTranscript('');
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interimTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const segment = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscriptRef.current += segment;
        } else {
          interimTranscript += segment;
        }
      }
      interimTranscriptRef.current = interimTranscript;
      setTranscript(finalTranscriptRef.current + interimTranscript);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error('Speech recognition error:', event.error);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
      finalTranscriptRef.current = '';
      interimTranscriptRef.current = '';
    };

    recognitionRef.current = recognition;
  }, []);

  const start = useCallback(() => {
    initializeRecognition();
    if (recognitionRef.current && !isListening) {
      finalTranscriptRef.current = '';
      interimTranscriptRef.current = '';
      setTranscript('');
      recognitionRef.current.start();
    }
  }, [isListening, initializeRecognition]);

  const stop = useCallback(() => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop();
    }
  }, [isListening]);

  const reset = useCallback(() => {
    setTranscript('');
    finalTranscriptRef.current = '';
    interimTranscriptRef.current = '';
  }, []);

  return { isListening, transcript, start, stop, reset };
};

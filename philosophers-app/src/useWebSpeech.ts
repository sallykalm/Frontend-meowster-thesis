import { useState, useRef, useCallback } from 'react';

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
  const recognitionRef = useRef<any>(null);
  const finalTranscriptRef = useRef('');
  const interimTranscriptRef = useRef('');

  // Initialize SpeechRecognition (handle browser prefixes)
  const initializeRecognition = useCallback(() => {
    if (recognitionRef.current) return;

    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition ||
      (window as any).mozSpeechRecognition ||
      (window as any).msSpeechRecognition;

    if (!SpeechRecognition) {
      console.warn('Speech Recognition API not supported in this browser');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.language = 'en-US';

    recognition.onstart = () => {
      setIsListening(true);
      finalTranscriptRef.current = '';
      interimTranscriptRef.current = '';
      setTranscript('');
    };

    recognition.onresult = (event: any) => {
      let interimTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const transcriptSegment = event.results[i][0].transcript;

        if (event.results[i].isFinal) {
          // Finalize this segment and add to final transcript
          finalTranscriptRef.current += transcriptSegment;
        } else {
          // Accumulate interim results for display
          interimTranscript += transcriptSegment;
        }
      }

      // Update refs
      interimTranscriptRef.current = interimTranscript;
      
      // Update display with final + interim combined for real-time feedback
      setTranscript(finalTranscriptRef.current + interimTranscript);
    };

    recognition.onerror = (event: any) => {
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

  return {
    isListening,
    transcript,
    start,
    stop,
    reset,
  };
};

import { useState, useEffect, useRef } from 'react';
import { TYPEWRITER_SPEED_MS } from '../constants';

interface TypewriterProps {
  text: string;
  speed?: number;
  isFastForwarding?: boolean;
  isPaused?: boolean;
  onComplete?: (finalText?: string) => void;
  interrupted?: boolean; // when true: stop at current char and append ...
}

const Typewriter = ({
  text,
  speed = TYPEWRITER_SPEED_MS,
  onComplete,
  isFastForwarding = false,
  isPaused = false,
  interrupted = false,
}: TypewriterProps) => {
  const [displayedText, setDisplayedText] = useState('');
  const displayedTextRef = useRef('');
  const indexRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isCompleteRef = useRef(false);
  const shouldResetRef = useRef(false);

  // Refs so interval callbacks always see latest values without being deps
  const isPausedRef = useRef(isPaused);
  const onCompleteRef = useRef(onComplete);
  const textRef = useRef(text);
  const interruptedRef = useRef(interrupted);
  const effectiveSpeed = isFastForwarding ? speed * 0.1 : speed;
  const speedRef = useRef(effectiveSpeed);

  useEffect(() => { isPausedRef.current = isPaused; }, [isPaused]);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);
  useEffect(() => { speedRef.current = effectiveSpeed; }, [effectiveSpeed]);
  useEffect(() => { interruptedRef.current = interrupted; }, [interrupted]);
  useEffect(() => { displayedTextRef.current = displayedText; }, [displayedText]);

  function stopInterval() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  function startInterval() {
    if (timerRef.current) return;
    timerRef.current = setInterval(() => {
      // Interrupted mid-stream: freeze at current char and append ...
      if (interruptedRef.current && !isCompleteRef.current) {
        stopInterval();
        const finalText = displayedTextRef.current.replace(/[.!?,;\s]+$/, '') + '...';
        setDisplayedText(finalText);
        isCompleteRef.current = true;
        onCompleteRef.current?.(finalText);
        return;
      }
      const t = textRef.current;
      if (indexRef.current < t.length) {
        const ch = t.charAt(indexRef.current);
        if (shouldResetRef.current) {
          setDisplayedText(ch);
          shouldResetRef.current = false;
        } else {
          setDisplayedText((prev) => prev + ch);
        }
        indexRef.current += 1;
      } else {
        stopInterval();
        if (!isCompleteRef.current) {
          isCompleteRef.current = true;
          onCompleteRef.current?.();
        }
      }
    }, speedRef.current);
  }

  // New text → reset index and start from scratch
  useEffect(() => {
    textRef.current = text;
    stopInterval();
    indexRef.current = 0;
    isCompleteRef.current = false;
    shouldResetRef.current = true;
    if (!isPausedRef.current) startInterval();
    return () => stopInterval();
  }, [text]); // eslint-disable-line react-hooks/exhaustive-deps

  // Speed change → restart at new speed, keeping current index
  useEffect(() => {
    if (!isCompleteRef.current && indexRef.current < textRef.current.length) {
      stopInterval();
      if (!isPausedRef.current) startInterval();
    }
  }, [effectiveSpeed]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pause/resume → stop or restart without touching indexRef
  useEffect(() => {
    if (isPaused) {
      stopInterval();
    } else if (!isCompleteRef.current && indexRef.current < textRef.current.length) {
      startInterval();
    }
  }, [isPaused]); // eslint-disable-line react-hooks/exhaustive-deps

  return <span>{displayedText}</span>;
};

export default Typewriter;

import { useState, useEffect, useRef } from 'react';
import { TYPEWRITER_SPEED_MS } from '../constants';

interface TypewriterProps {
  text: string;
  speed?: number;
  isFastForwarding?: boolean;
  isPaused?: boolean;
  onComplete?: () => void;
}

const Typewriter = ({
  text,
  speed = TYPEWRITER_SPEED_MS,
  onComplete,
  isFastForwarding = false,
  isPaused = false,
}: TypewriterProps) => {
  const [displayedText, setDisplayedText] = useState('');
  const indexRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isCompleteRef = useRef(false);

  // Refs so interval callbacks always see latest values without being deps
  const isPausedRef = useRef(isPaused);
  const onCompleteRef = useRef(onComplete);
  const textRef = useRef(text);
  const effectiveSpeed = isFastForwarding ? speed * 0.1 : speed;
  const speedRef = useRef(effectiveSpeed);

  useEffect(() => { isPausedRef.current = isPaused; }, [isPaused]);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);
  useEffect(() => { speedRef.current = effectiveSpeed; }, [effectiveSpeed]);

  function stopInterval() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  /**
   * Start the typing interval from indexRef.current.
   * Pass resetDisplay=true (only on text change) to clear the display on the
   * first tick instead of in the effect body, satisfying the linter rule that
   * prohibits synchronous setState calls inside useEffect.
   */
  function startInterval(resetDisplay = false) {
    if (timerRef.current) return;
    let firstTick = resetDisplay;
    timerRef.current = setInterval(() => {
      if (firstTick) {
        setDisplayedText('');
        firstTick = false;
        return; // let the clear render before typing begins
      }
      const t = textRef.current;
      if (indexRef.current < t.length) {
        setDisplayedText((prev) => prev + t.charAt(indexRef.current));
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
    if (!isPausedRef.current) startInterval(true);
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

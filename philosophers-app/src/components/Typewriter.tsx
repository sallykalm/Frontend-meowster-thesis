import { useState, useEffect, useRef } from 'react';
import { TYPEWRITER_SPEED_MS } from '../constants';

interface TypewriterProps {
  text: string;
  speed?: number;
  isFastForwarding?: boolean;
  isPaused?: boolean;
  onComplete?: () => void;
}

const Typewriter = ({ text, speed = TYPEWRITER_SPEED_MS, onComplete, isFastForwarding = false, isPaused = false }: TypewriterProps) => {
  const [displayedText, setDisplayedText] = useState('');
  const indexRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const speedRef = useRef(speed);
  const isCompleteRef = useRef(false);

  // Calculate effective speed
  const effectiveSpeed = isFastForwarding ? speed * 0.1 : speed;

  // Update speed ref whenever speed or fast-forward changes
  useEffect(() => {
    speedRef.current = effectiveSpeed;
  }, [effectiveSpeed]);

  // Main typewriter effect - runs when text changes
  useEffect(() => {
    indexRef.current = 0;
    isCompleteRef.current = false;
    let isFirstTick = true;

    const startTypewriter = () => {
      timerRef.current = setInterval(() => {
        // Reset on first tick (asynchronously, not in effect body)
        if (isFirstTick) {
          setDisplayedText('');
          isFirstTick = false;
        }

        // Skip if paused
        if (isPaused) {
          return;
        }

        if (indexRef.current < text.length) {
          const nextChar = text.charAt(indexRef.current);
          setDisplayedText((prev) => prev + nextChar);
          indexRef.current += 1;
        } else {
          if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }
          if (!isCompleteRef.current) {
            isCompleteRef.current = true;
            if (onComplete) onComplete();
          }
        }
      }, speedRef.current);
    };

    startTypewriter();

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [text, onComplete, isPaused]);

  // Handle speed changes dynamically without resetting text
  useEffect(() => {
    // If we have an active interval, restart it with the new speed
    if (timerRef.current && indexRef.current < text.length) {
      clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        // Skip if paused
        if (isPaused) {
          return;
        }

        if (indexRef.current < text.length) {
          const nextChar = text.charAt(indexRef.current);
          setDisplayedText((prev) => prev + nextChar);
          indexRef.current += 1;
        } else {
          if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }
          if (!isCompleteRef.current) {
            isCompleteRef.current = true;
            if (onComplete) onComplete();
          }
        }
      }, speedRef.current);
    }
  }, [effectiveSpeed, isPaused, text, onComplete]);

  return <span>{displayedText}</span>;
};

export default Typewriter;

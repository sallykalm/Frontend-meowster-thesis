import { useState, useEffect, useRef } from 'react';

interface TypewriterProps {
  text: string;
  speed?: number;
  onComplete?: () => void;
  isFastForwarding?: boolean;
  isPaused?: boolean;
}

const Typewriter = ({ text, speed = 125, onComplete, isFastForwarding = false, isPaused = false }: TypewriterProps) => {
  const [displayedText, setDisplayedText] = useState("");
  const indexRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const speedRef = useRef(speed);
  const isCompleteRef = useRef(false);

  // Calculate effective speed
  const effectiveSpeed = isFastForwarding ? speed * 0.10 : speed;

  // Update speed ref whenever speed or fast-forward changes
  useEffect(() => {
    speedRef.current = effectiveSpeed;
  }, [effectiveSpeed]);

  // Main typewriter effect - only runs when text changes
  useEffect(() => {
    setDisplayedText("");
    indexRef.current = 0;
    isCompleteRef.current = false;

    const startTypewriter = () => {
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
    };

    startTypewriter();

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [text, onComplete, isPaused]);

  // Secondary effect to handle speed changes dynamically
  // This updates the interval speed without resetting the text or index
  useEffect(() => {
    // If we have an active interval, we need to restart it with the new speed
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

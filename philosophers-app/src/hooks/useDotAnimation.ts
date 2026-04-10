import { useState, useEffect } from 'react';

export function useDotAnimation(active: boolean): number {
  const [dotCount, setDotCount] = useState(1);

  useEffect(() => {
    if (!active) return;
    const interval = setInterval(() => {
      setDotCount((prev) => (prev === 3 ? 1 : prev + 1));
    }, 400);
    return () => clearInterval(interval);
  }, [active]);

  return dotCount;
}

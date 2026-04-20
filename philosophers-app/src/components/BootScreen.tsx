import { useEffect, useState, useCallback } from 'react';
import styles from './BootScreen.module.css';

interface BootScreenProps {
  onDone: () => void;
}

const LINES: { text: string; delay: number; cls?: string }[] = [
  { text: 'PHILOSOPHERS.AI  v1.0',          delay: 100,  cls: 'accent' },
  { text: '──────────────────────────────',  delay: 400,  cls: 'dim'    },
  { text: 'LOADING DEBATE ENGINE...',         delay: 700               },
  { text: 'LOADING PHILOSOPHERS...',          delay: 1100              },
  { text: 'FLUSSER-AI          [OK]',         delay: 1400, cls: 'dim'  },
  { text: 'WEIZENBAUM-AI       [OK]',         delay: 1600, cls: 'dim'  },
  { text: 'VIRILIO-AI          [OK]',         delay: 1800, cls: 'dim'  },
  { text: 'WEIBEL-AI           [OK]',         delay: 2000, cls: 'dim'  },
  { text: '──────────────────────────────',  delay: 2300, cls: 'dim'   },
  { text: 'SYSTEM READY.',                    delay: 2600, cls: 'bright'},
];

// Animation completes at the last line's delay + a short buffer
const READY_DELAY = 2800;
const FADE_DURATION = 800;

const BootScreen = ({ onDone }: BootScreenProps) => {
  const [visibleCount, setVisibleCount] = useState(0);
  const [ready, setReady] = useState(false);
  const [fading, setFading] = useState(false);

  const dismiss = useCallback(() => {
    if (!ready || fading) return;
    setFading(true);
    setTimeout(() => onDone(), FADE_DURATION);
  }, [ready, fading, onDone]);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];

    LINES.forEach((line, i) => {
      timers.push(setTimeout(() => setVisibleCount(i + 1), line.delay));
    });

    timers.push(setTimeout(() => setReady(true), READY_DELAY));

    return () => timers.forEach(clearTimeout);
  }, []);

  // Listen for any key or click once ready
  useEffect(() => {
    if (!ready) return;
    const handleKey = () => dismiss();
    const handleClick = () => dismiss();
    window.addEventListener('keydown', handleKey, { once: true });
    window.addEventListener('click', handleClick, { once: true });
    return () => {
      window.removeEventListener('keydown', handleKey);
      window.removeEventListener('click', handleClick);
    };
  }, [ready, dismiss]);

  return (
    <div
      className={`${styles.overlay} ${fading ? styles.fadeOut : ''} ${ready ? styles.interactive : ''}`}
      onClick={dismiss}
    >
      <div className={styles.lines}>
        {LINES.slice(0, visibleCount).map((line, i) => (
          <div
            key={i}
            className={`${styles.line} ${line.cls ? styles[line.cls as keyof typeof styles] : ''}`}
          >
            {line.text}
          </div>
        ))}
        {ready && (
          <div className={`${styles.line} ${styles.prompt}`}>
            [ PRESS ANY KEY ]
          </div>
        )}
      </div>
    </div>
  );
};

export default BootScreen;

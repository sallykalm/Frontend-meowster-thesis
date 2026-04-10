import { useEffect, useState } from 'react';
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

const FADE_DELAY = 3200;
const UNMOUNT_DELAY = FADE_DELAY + 900;

const BootScreen = ({ onDone }: BootScreenProps) => {
  const [visibleCount, setVisibleCount] = useState(0);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];

    LINES.forEach((line, i) => {
      timers.push(setTimeout(() => setVisibleCount(i + 1), line.delay));
    });

    timers.push(setTimeout(() => setFading(true), FADE_DELAY));
    timers.push(setTimeout(() => onDone(), UNMOUNT_DELAY));

    return () => timers.forEach(clearTimeout);
  }, [onDone]);

  return (
    <div className={`${styles.overlay} ${fading ? styles.fadeOut : ''}`}>
      <div className={styles.lines}>
        {LINES.slice(0, visibleCount).map((line, i) => (
          <div
            key={i}
            className={`${styles.line} ${line.cls ? styles[line.cls as keyof typeof styles] : ''}`}
          >
            {line.text}
          </div>
        ))}
      </div>
    </div>
  );
};

export default BootScreen;

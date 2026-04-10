import { useEffect } from 'react';
import { PHILOSOPHER_CONFIG, COLORS } from '../constants';
import { useDotAnimation } from '../hooks/useDotAnimation';
import styles from './ImageGrid.module.css';

/**
 * Image sets and GIF availability:
 *   Set 1 — portrait photos      (has GIF for active philosopher)
 *   Set 2 — abstract art          (has GIF for active philosopher)
 *   Set 3 — illustrations         (PNG only, no GIF available)
 *   Set 4 — pixel art             (has GIF for active philosopher)
 *
 * Press keys 1–4 to switch sets.
 */

interface ImageGridProps {
  imageSet: number;
  onImageSetChange: (set: number) => void;
  typingPhilosopher: string | null;
  thinkingName: string | null;
  currentPhilosopher: string | null;
  isPaused?: boolean;
}

/** Image sets that have animated GIF files available. */
const GIF_SETS = new Set([1, 2, 4]);

const ImageGrid = ({
  imageSet,
  onImageSetChange,
  typingPhilosopher,
  thinkingName,
  currentPhilosopher,
  isPaused = false,
}: ImageGridProps) => {
  const dotCount = useDotAnimation(!!thinkingName);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['1', '2', '3', '4'].includes(e.key) && document.activeElement?.tagName !== 'INPUT') {
        onImageSetChange(parseInt(e.key, 10));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onImageSetChange]);

  const isSomeoneTyping = !!typingPhilosopher;

  const philosophers = Object.keys(PHILOSOPHER_CONFIG).filter((k) => k !== 'Moderator');

  return (
    <div className={styles.imageGrid} role="img" aria-label="Philosopher portraits">
      {philosophers.map((baseName) => {
        const config = PHILOSOPHER_CONFIG[baseName]!;
        const isGif = isSomeoneTyping && typingPhilosopher === baseName && GIF_SETS.has(imageSet) && !isPaused;
        const extension = isGif ? 'gif' : 'png';
        const imgSrc = `/images/${config.filePrefix}${imageSet}.${extension}`;
        const isThinking = thinkingName === baseName && currentPhilosopher !== baseName;

        return (
          <div className={styles.philosopherColumn} key={baseName}>
            <div
              className={styles.philosopherFrame}
              style={{ borderColor: COLORS[config.displayName] }}
              aria-busy={isThinking}
            >
              <img src={imgSrc} alt={config.displayName} />
            </div>
            <div className={styles.philosopherLabel} style={{ color: COLORS[config.displayName] }}>
              {config.displayName.toUpperCase()}
            </div>
            {isThinking ? (
              <div
                className={styles.philosopherThinking}
                style={{ color: COLORS[config.displayName] }}
                aria-live="polite"
              >
                IS THINKING{'.'.repeat(dotCount)}
              </div>
            ) : (
              <div className={styles.philosopherThinking} aria-hidden="true" style={{ visibility: 'hidden' }} />
            )}
          </div>
        );
      })}
    </div>
  );
};

export default ImageGrid;

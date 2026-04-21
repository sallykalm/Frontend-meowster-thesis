import { useEffect } from 'react';
import { PHILOSOPHER_CONFIG, COLORS } from '../constants';
import styles from './ImageGrid.module.css';

/**
 * Image sets and GIF availability:
 *   Set 1 — portrait photos      (has GIF for speaking + thinking GIF for thinking state)
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
  interruptingName: string | null;
  currentPhilosopher: string | null;
  isPaused?: boolean;
  ragRelevanceMap?: Record<string, number | null>;
}

function ragFilter(distance: number | null | undefined): string | undefined {
  if (distance == null) return undefined;
  const intensity = Math.max(0, 1 - distance / 2.0);
  const brightness = (0.85 + intensity * 0.5).toFixed(2);
  const saturate = (0.7 + intensity * 0.9).toFixed(2);
  return `brightness(${brightness}) saturate(${saturate})`;
}

/** Image sets that have animated GIF files available. */
const GIF_SETS = new Set([1, 2, 4]);

const ImageGrid = ({
  imageSet,
  onImageSetChange,
  typingPhilosopher,
  thinkingName,
  interruptingName,
  currentPhilosopher,
  isPaused = false,
  ragRelevanceMap = {},
}: ImageGridProps) => {
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
        const isThinking = thinkingName === baseName && currentPhilosopher !== baseName;
        const isInterrupting = interruptingName === baseName && currentPhilosopher !== baseName;
        const isSpeaking = currentPhilosopher === baseName;

        let imgSrc: string;
        let isUsingGif: boolean;

        if (imageSet === 1) {
          // Image Set 1: Use thinking GIF when thinking/interrupting, speaking GIF when speaking
          if ((isThinking || isInterrupting) && !isPaused) {
            imgSrc = `/images/${config.filePrefix}1_thinking.gif`;
            isUsingGif = true;
          } else if (isSpeaking && GIF_SETS.has(imageSet) && !isPaused) {
            imgSrc = `/images/${config.filePrefix}${imageSet}.gif`;
            isUsingGif = true;
          } else {
            imgSrc = `/images/${config.filePrefix}${imageSet}.png`;
            isUsingGif = false;
          }
        } else {
          // Other sets (2, 3, 4): Use GIF only when speaking
          isUsingGif = isSomeoneTyping && typingPhilosopher === baseName && GIF_SETS.has(imageSet) && !isPaused;
          imgSrc = `/images/${config.filePrefix}${imageSet}.${isUsingGif ? 'gif' : 'png'}`;
        }

        return (
          <div className={styles.philosopherColumn} key={baseName}>
            <div
              className={styles.philosopherFrame}
              style={{ borderColor: COLORS[config.displayName] }}
            >
              <img
                src={imgSrc}
                alt={config.displayName}
                style={isUsingGif ? { filter: ragFilter(ragRelevanceMap[baseName]) } : undefined}
              />
            </div>
            <div className={styles.philosopherLabel} style={{ color: COLORS[config.displayName] }}>
              {config.displayName.toUpperCase()}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default ImageGrid;

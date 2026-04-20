import { COLORS, PHILOSOPHER_CONFIG } from '../constants';
import type { SubtitleChunk } from '../types';
import styles from './SubtitleView.module.css';

interface SubtitleViewProps {
  chunk: SubtitleChunk | null;
}

const SubtitleView = ({ chunk }: SubtitleViewProps) => {
  if (!chunk) return <div className={styles.subtitleView} aria-hidden="true" />;

  const displayName = PHILOSOPHER_CONFIG[chunk.philosopher]?.displayName ?? chunk.philosopher;
  const nameColor = COLORS[displayName] ?? '#fff';
  const lines = chunk.text.split('\n');

  return (
    <section className={styles.subtitleView} role="log" aria-live="polite" aria-label="Philosopher subtitles">
      <div className={styles.subtitleBlock}>
        <div className={styles.nameLabel} style={{ color: nameColor }}>
          {chunk.turnType === 'interruption' && <span className={styles.interruptTag}>—</span>}
          {displayName}
          {chunk.turnType === 'interrupted_return' && <span className={styles.resumeTag}> ↩</span>}
        </div>
        <div className={styles.textBlock}>
          {lines.map((line, i) => (
            <div key={i} className={styles.subtitleLine}>{line}</div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default SubtitleView;

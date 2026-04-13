import Typewriter from './Typewriter';
import { COLORS, PHILOSOPHER_CONFIG, MAX_VISIBLE_LINES, LINE_OPACITIES, TYPEWRITER_SPEED_BY_PHILOSOPHER, TYPEWRITER_SPEED_MS } from '../constants';
import type { ChatMessage } from '../types';
import styles from './DiscussionLog.module.css';

interface DiscussionLogProps {
  finishedLines: ChatMessage[];
  currentLine: ChatMessage | null;
  isFastForwarding?: boolean;
  isPaused?: boolean;
}

interface PhilosopherBlock {
  philosopher: string;
  displayName: string;
  nameColor: string;
  lineIndices: number[];
  turnType?: string | null;
}

const DiscussionLog = ({
  finishedLines,
  currentLine,
  isFastForwarding = false,
  isPaused = false,
}: DiscussionLogProps) => {
  const lines = [...finishedLines, ...(currentLine ? [currentLine] : [])];
  const visibleLines = lines.slice(-MAX_VISIBLE_LINES);

  const philosopherBlocks: PhilosopherBlock[] = [];
  visibleLines.forEach((line, idx) => {
    const displayName = PHILOSOPHER_CONFIG[line.philosopher]?.displayName ?? line.philosopher;
    const nameColor = COLORS[displayName] ?? '#fff';
    const lastBlock = philosopherBlocks[philosopherBlocks.length - 1];

    if (lastBlock && lastBlock.philosopher === line.philosopher) {
      lastBlock.lineIndices.push(idx);
    } else {
      philosopherBlocks.push({
        philosopher: line.philosopher,
        displayName,
        nameColor,
        lineIndices: [idx],
        turnType: line.turnType as string | null | undefined,
      });
    }
  });

  return (
    <section
      className={styles.discussionLog}
      role="log"
      aria-live="polite"
      aria-label="Philosopher debate"
    >
      <div className={styles.discussionContent}>
        {philosopherBlocks.map((block, blockIdx) => (
          <div
            key={`block-${block.philosopher}-${block.lineIndices[0]}`}
            className={styles.philosopherBlock}
            style={{ marginTop: blockIdx !== 0 ? '0.5em' : '0' }}
          >
            <div className={styles.nameLabel} style={{ color: block.nameColor }}>
              {block.turnType === 'interruption' && (
                <span className={styles.interruptTag}>—</span>
              )}
              {block.displayName}
              {block.turnType === 'interrupted_return' && (
                <span className={styles.resumeTag}> ↩</span>
              )}
            </div>

            <div className={styles.textLinesBlock}>
              {block.lineIndices.map((lineIdx) => {
                const line = visibleLines[lineIdx];
                const isCurrent = lineIdx === visibleLines.length - 1;
                const opacity = LINE_OPACITIES[visibleLines.length - 1 - lineIdx] ?? 0;

                return (
                  <div key={line.id} className={styles.chatBubble} style={{ opacity }}>
                    {line.isNew && isCurrent ? (
                      <Typewriter
                        text={line.text}
                        speed={TYPEWRITER_SPEED_BY_PHILOSOPHER[line.philosopher] ?? TYPEWRITER_SPEED_MS}
                        onComplete={line.onComplete}
                        isFastForwarding={isFastForwarding}
                        isPaused={isPaused}
                        interrupted={line.interrupted === true}
                      />
                    ) : (
                      line.text
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

export default DiscussionLog;
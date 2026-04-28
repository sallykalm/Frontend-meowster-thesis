import type { MicState } from '../hooks/useVoiceInput';
import styles from './MicIndicator.module.css';

interface MicIndicatorProps {
  micState: MicState;
  interimTranscript: string;
  /** Final transcript captured — shown while waiting for the session to accept it. */
  pendingTranscript?: string;
}

const LABELS: Record<MicState, string> = {
  idle:        '[ ◎ mic ]',
  warming:     '[ ◎ mic · wait ]',
  speaking:    '[ ● mic · listening ]',
  paused:      '[ — mic ]',
  error:       '[ ! mic · no permission ]',
  unsupported: '[ mic · unavailable ]',
};

const MicIndicator = ({ micState, interimTranscript, pendingTranscript }: MicIndicatorProps) => {
  if (micState === 'unsupported') return null;

  const showPending = !!pendingTranscript && micState !== 'speaking';

  return (
    <div
      className={`${styles.container} ${styles[micState]} ${showPending ? styles.pending : ''}`}
      role="status"
      aria-live="polite"
      aria-label={`Microphone: ${micState}`}
    >
      <span className={styles.label}>{LABELS[micState]}</span>
      {micState === 'speaking' && interimTranscript && (
        <span className={styles.transcript}>{interimTranscript}</span>
      )}
      {showPending && (
        <span className={styles.pendingTranscript}>↷ {pendingTranscript}</span>
      )}
    </div>
  );
};

export default MicIndicator;

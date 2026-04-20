import styles from './VoiceIndicator.module.css';

interface VoiceIndicatorProps {
  isListening: boolean;
  liveTranscript: string;
}

const VoiceIndicator = ({ isListening, liveTranscript }: VoiceIndicatorProps) => {
  // Only shown while listening and before any transcript arrives
  if (!isListening || liveTranscript.trim()) return null;

  return (
    <div className={styles.voiceInterface} role="status" aria-live="polite">
      <div className={styles.recordingIndicator}>● RECORDING_QUESTION</div>
      <div className={styles.liveTranscript}>{'...'}</div>
    </div>
  );
};

export default VoiceIndicator;

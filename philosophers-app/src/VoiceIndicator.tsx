interface VoiceIndicatorProps {
  isListening: boolean;
  liveTranscript: string;
}

const VoiceIndicator = ({ isListening, liveTranscript }: VoiceIndicatorProps) => {
  // Only show before transcript starts
  if (!isListening || liveTranscript.trim()) return null;

  return (
    <div className="voice-interface">
      <div className="recording-indicator">● RECORDING_QUESTION</div>
      <div className="live-transcript">{"..."}</div>
    </div>
  );
};

export default VoiceIndicator;

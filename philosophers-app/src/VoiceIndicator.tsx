interface VoiceIndicatorProps {
  isListening: boolean;
  liveTranscript: string;
}

const VoiceIndicator = ({ isListening, liveTranscript }: VoiceIndicatorProps) => {
  if (!isListening) return null;

  return (
    <div className="voice-interface">
      <div className="recording-indicator">● RECORDING_QUESTION</div>
      <div className="live-transcript">{liveTranscript || "..."}</div>
    </div>
  );
};

export default VoiceIndicator;

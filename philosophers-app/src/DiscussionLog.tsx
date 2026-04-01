import Typewriter from "./Typewriter";
import { COLORS, PHILOSOPHER_CONFIG } from './constants';

export interface ChatMessage {
  id: number;
  philosopher: string;
  text: string;
  isNew: boolean;
  onComplete?: () => void;
}

interface DiscussionLogProps {
  finishedLines: ChatMessage[];
  currentLine: ChatMessage | null;
  thinkingName: string | null;
  isListening: boolean;
}

const OPACITIES = [1, 1, 0.6, 0.3]; // Bottom up: newest to oldest

const DiscussionLog = ({
  finishedLines,
  currentLine,
  thinkingName,
  isListening,
}: DiscussionLogProps) => {
  // Compose the visible lines (max 4)
  const lines = [...finishedLines, ...(currentLine ? [currentLine] : [])];
  const visibleLines = lines.slice(-4);

  return (
    <div className="discussion-log">
      {/* Thinking indicator only between philosophers */}
      {thinkingName && !isListening && !currentLine && (
        <div className="thinking-indicator">
          {thinkingName.toUpperCase()} IS THINKING...
        </div>
      )}
      <div className="subtitle-lines">
        {visibleLines.map((line, idx) => {
          const opacity = OPACITIES[visibleLines.length - 1 - idx] || 0;
          const isCurrent = idx === visibleLines.length - 1;
          const prevLine = visibleLines[idx - 1];
          const isNewPhilosopher = !prevLine || prevLine.philosopher !== line.philosopher;
          const displayName = PHILOSOPHER_CONFIG[line.philosopher]?.displayName || line.philosopher;
          const nameColor = COLORS[displayName] || "#fff";

          return (
            <div
              className="subtitle-row"
              key={line.id}
              style={{
                display: "flex",
                alignItems: "flex-start",
                width: "80vw",
                maxWidth: "900px",
                margin: "0 auto 0.2em auto",
                marginTop: isNewPhilosopher && idx !== 0 ? "2em" : "0", // <-- Add space above new philosopher, except for very first line
              }}
            >
              {/* Philosopher name column */}
              <span
                className="philosopher-name"
                style={{
                  minWidth: 120,
                  textAlign: "right",
                  marginRight: "1rem",
                  color: isCurrent ? nameColor : "transparent",
                  fontWeight: isCurrent ? "bold" : "normal",
                  visibility: isCurrent ? "visible" : "hidden",
                }}
              >
                {isCurrent ? line.philosopher : ""}
              </span>
              {/* Text column */}
              <span
                className="chat-bubble"
                style={{
                  opacity,
                  color: "#fff",
                  flex: 1,
                  whiteSpace: "pre-line",
                  wordBreak: "break-word",
                }}
              >
                {line.isNew && isCurrent ? (
                  <Typewriter text={line.text} onComplete={line.onComplete} />
                ) : (
                  line.text
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default DiscussionLog;
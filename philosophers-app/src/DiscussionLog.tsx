import Typewriter from "./Typewriter";
import VoiceIndicator from "./VoiceIndicator";
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
  isListening: boolean;
  liveTranscript: string;
}

const OPACITIES = [1, 1, 0.6, 0.3]; // Bottom up: newest to oldest

const DiscussionLog = ({
  finishedLines,
  currentLine,
  isListening,
  liveTranscript,
}: DiscussionLogProps) => {
  // Compose the visible lines (max 4)
  const lines = [...finishedLines, ...(currentLine ? [currentLine] : [])];
  const visibleLines = lines.slice(-4);

  // Group consecutive lines by philosopher for better layout
  interface PhilosopherBlock {
    philosopher: string;
    displayName: string;
    nameColor: string;
    lineIndices: number[];
  }

  const philosopherBlocks: PhilosopherBlock[] = [];
  visibleLines.forEach((line, idx) => {
    const displayName = PHILOSOPHER_CONFIG[line.philosopher]?.displayName || line.philosopher;
    const nameColor = COLORS[displayName] || "#fff";
    
    const lastBlock = philosopherBlocks[philosopherBlocks.length - 1];
    if (lastBlock && lastBlock.philosopher === line.philosopher) {
      lastBlock.lineIndices.push(idx);
    } else {
      philosopherBlocks.push({
        philosopher: line.philosopher,
        displayName,
        nameColor,
        lineIndices: [idx],
      });
    }
  });

  return (
    <div className="discussion-log">
      {/* Voice indicator - only when listening and no transcript */}
      <VoiceIndicator isListening={isListening} liveTranscript={liveTranscript} />

      <div className="discussion-content">
        {philosopherBlocks.map((block, blockIdx) => {
          const isNewPhilosopher = blockIdx === 0 || philosopherBlocks[blockIdx - 1].philosopher !== block.philosopher;
          
          // Check if this philosopher's block contains any new lines (currently speaking)
          const hasNewLines = block.lineIndices.some((lineIdx) => visibleLines[lineIdx].isNew);
          
          return (
            <div
              key={`block-${block.philosopher}-${block.lineIndices[0]}`}
              className="philosopher-block"
              style={{
                marginTop: isNewPhilosopher && blockIdx !== 0 ? "0.5em" : "0",
              }}
            >
              {/* Name label on the left - fixed while speaking, otherwise normal */}
              <div
                className="name-label"
                style={{ color: block.nameColor }}
              >
                {block.displayName}
              </div>

              {/* Text lines block */}
              <div className="text-lines-block">
                {block.lineIndices.map((lineIdx) => {
                  const line = visibleLines[lineIdx];
                  const isCurrent = lineIdx === visibleLines.length - 1;
                  const opacity = OPACITIES[visibleLines.length - 1 - lineIdx] || 0;

                  return (
                    <div
                      key={line.id}
                      className="chat-bubble"
                      style={{ opacity }}
                    >
                      {line.isNew && isCurrent ? (
                        <Typewriter text={line.text} onComplete={line.onComplete} />
                      ) : (
                        line.text
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default DiscussionLog;
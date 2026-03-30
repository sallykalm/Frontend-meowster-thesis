import Typewriter from './Typewriter';
import { COLORS } from './constants';

export interface ChatMessage {
  id: number;
  philosopher: string;
  text: string;
  isNew: boolean;
  onComplete?: () => void;
}

interface DiscussionLogProps {
  messages: ChatMessage[];
  thinkingName: string | null;
  isListening: boolean;
}

const DiscussionLog = ({ messages, thinkingName, isListening }: DiscussionLogProps) => {
  return (
    <div className="discussion-log">
      {thinkingName && !isListening && (
        <div className="thinking-indicator" style={{ color: COLORS[thinkingName] }}>
          {thinkingName.toUpperCase()} IS THINKING...
        </div>
      )}
      
      {messages.map((msg, index) => {
        const opacityLevel = Math.max(0.2, 1 - (index * 0.25));

        return (
          <div className="chat-bubble" key={msg.id} style={{ opacity: opacityLevel }}>
            <span className="philosopher-name" style={{ color: COLORS[msg.philosopher] }}>
              {msg.philosopher}:
            </span>
            <span className="philosopher-text">
              {msg.isNew ? (
                <Typewriter 
                  text={msg.text} 
                  onComplete={msg.onComplete} 
                />
              ) : (
                msg.text
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
};

export default DiscussionLog;

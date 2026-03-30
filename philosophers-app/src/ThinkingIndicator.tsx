import { COLORS } from './constants';

interface ThinkingIndicatorProps {
  thinkingName: string | null;
}

const ThinkingIndicator = ({ thinkingName }: ThinkingIndicatorProps) => {
  if (!thinkingName) return null;

  return (
    <div className="thinking-indicator" style={{ color: COLORS[thinkingName] }}>
      {thinkingName.toUpperCase()} IS THINKING...
    </div>
  );
};

export default ThinkingIndicator;

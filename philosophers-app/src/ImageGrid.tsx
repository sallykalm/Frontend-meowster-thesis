import { useEffect, useState } from 'react';
import { PHILOSOPHER_CONFIG, COLORS } from './constants';

interface ImageGridProps {
  imageSet: number;
  onImageSetChange: (set: number) => void;
  typingPhilosopher: string | null;
  thinkingName: string | null;
  currentPhilosopher: string | null;
}

const ImageGrid = ({ imageSet, onImageSetChange, typingPhilosopher, thinkingName, currentPhilosopher }: ImageGridProps) => {
  const [dotCount, setDotCount] = useState(1);

  // Handle keyboard shortcuts for image sets (1-4)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['1', '2', '3', '4'].includes(e.key) && document.activeElement?.tagName !== 'INPUT') {
        onImageSetChange(parseInt(e.key, 10));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onImageSetChange]);

  // Animate the thinking dots
  useEffect(() => {
    if (!thinkingName) return;

    const interval = setInterval(() => {
      setDotCount((prev) => (prev === 3 ? 1 : prev + 1));
    }, 400);

    return () => clearInterval(interval);
  }, [thinkingName]);

  const isSomeoneTyping = !!typingPhilosopher;

  return (
    <div className="image-grid">
      {['Weizenbaum', 'Flusser', 'Weibel', 'Virilio'].map((baseName) => {
        const config = PHILOSOPHER_CONFIG[baseName];
        // Only show GIF if this philosopher is typing and someone is typing
        const isGif = isSomeoneTyping && typingPhilosopher === baseName && (imageSet === 1 || imageSet === 2 || imageSet === 4);
        const extension = isGif ? 'gif' : 'png';
        const imgSrc = `/images/${config.filePrefix}${imageSet}.${extension}`;
        
        // Check if this philosopher is thinking (but not currently speaking)
        const isThinking = thinkingName === baseName && currentPhilosopher !== baseName;
        const thinkingDots = '.'.repeat(dotCount);

        return (
          <div className="philosopher-column" key={baseName}>
            <div className="philosopher-frame" style={{ borderColor: COLORS[config.displayName] }}>
              <img src={imgSrc} alt={config.displayName} />
            </div>
            <div className="philosopher-label" style={{ color: COLORS[config.displayName] }}>
              {config.displayName.toUpperCase()}
            </div>
            {isThinking ? (
              <div 
                className="philosopher-thinking"
                style={{ color: COLORS[config.displayName] }}
              >
                IS THINKING{thinkingDots}
              </div>
            ) : (
              <div className="philosopher-thinking" style={{ visibility: 'hidden' }}>
                {/* Placeholder to reserve space */}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default ImageGrid;

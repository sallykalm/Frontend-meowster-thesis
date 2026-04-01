import { useEffect } from 'react';
import { PHILOSOPHER_CONFIG, COLORS } from './constants';

interface ImageGridProps {
  imageSet: number;
  onImageSetChange: (set: number) => void;
  typingPhilosopher: string | null;
}

const ImageGrid = ({ imageSet, onImageSetChange, typingPhilosopher }: ImageGridProps) => {
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

  const isSomeoneTyping = !!typingPhilosopher;

  return (
    <div className="image-grid">
      {['Weizenbaum', 'Flusser', 'Weibel', 'Virilio'].map((baseName) => {
        const config = PHILOSOPHER_CONFIG[baseName];
        // Only show GIF if this philosopher is typing and someone is typing
        const isGif = isSomeoneTyping && typingPhilosopher === baseName && imageSet === 1;
        const extension = isGif ? 'gif' : 'png';
        const imgSrc = `/images/${config.filePrefix}${imageSet}.${extension}`;

        return (
          <div className="philosopher-column" key={baseName}>
            <div className="philosopher-frame" style={{ borderColor: COLORS[config.displayName] }}>
              <img src={imgSrc} alt={config.displayName} />
            </div>
            <div className="philosopher-label" style={{ color: COLORS[config.displayName] }}>
              {config.displayName.toUpperCase()}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default ImageGrid;

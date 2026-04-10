import { useRef } from 'react';
import './Menu.css';

interface MenuProps {
  isMenuOpen: boolean;
  isPaused: boolean;
  isFastForwarding: boolean;
  isVoiceEnabled: boolean;
  imageSet: number;
  onPausePlay: () => void;
  onStop: () => void;
  onFastForward: (isActive: boolean) => void;
  onImageSetChange: (set: 1 | 2 | 3 | 4) => void;
  onVoiceToggle: (enabled: boolean) => void;
  onIntroduction: () => void;
}

const Menu = ({
  isMenuOpen,
  isPaused,
  isFastForwarding,
  isVoiceEnabled,
  imageSet,
  onPausePlay,
  onStop,
  onFastForward,
  onImageSetChange,
  onVoiceToggle,
  onIntroduction,
}: MenuProps) => {
  const fastForwardButtonRef = useRef<HTMLButtonElement>(null);

  // Handle fast-forward button mouse events
  const handleFastForwardMouseDown = () => {
    onFastForward(true);
  };

  const handleFastForwardMouseUp = () => {
    onFastForward(false);
  };

  // Handle pause button click
  const handlePausePlayClick = () => {
    onPausePlay();
  };

  // Handle stop button click
  const handleStopClick = () => {
    onStop();
  };

  // Handle voice toggle click
  const handleVoiceToggleClick = () => {
    onVoiceToggle(!isVoiceEnabled);
  };

  // Handle image set button clicks
  const handleImageSetClick = (set: 1 | 2 | 3 | 4) => {
    onImageSetChange(set);
  };

  // Handle introduction button click
  const handleIntroductionClick = () => {
    onIntroduction();
  };

  if (!isMenuOpen) {
    return null;
  }

  const pausePlayLabel = isPaused ? 'PLAY' : 'PAUSE';
  const pausePlaySymbol = isPaused ? 'P' : 'P';

  return (
    <div className="menu-overlay">
      <div className="menu-content">
        {/* Control buttons group */}
        <div className="menu-group">
          {/* Pause/Play button */}
          <button
            className="menu-button"
            onClick={handlePausePlayClick}
            title={`${pausePlayLabel} (shortcut: P)`}
          >
            <div className="menu-button-symbol">{pausePlaySymbol}</div>
            <div className="menu-button-label">{pausePlayLabel}</div>
          </button>

          {/* Stop button */}
          <button
            className="menu-button"
            onClick={handleStopClick}
            title="Stop generation (shortcut: Q)"
          >
            <div className="menu-button-symbol">Q</div>
            <div className="menu-button-label">STOP</div>
          </button>

          {/* Fast-Forward button */}
          <button
            ref={fastForwardButtonRef}
            className={`menu-button ${isFastForwarding ? 'active' : ''}`}
            onMouseDown={handleFastForwardMouseDown}
            onMouseUp={handleFastForwardMouseUp}
            onMouseLeave={handleFastForwardMouseUp}
            title="Fast-forward (hold - shortcut: F)"
          >
            <div className="menu-button-symbol">F</div>
            <div className="menu-button-label">FAST-FWD</div>
          </button>
        </div>

        {/* Divider */}
        <div className="menu-divider">│</div>

        {/* Image set buttons */}
        <div className="menu-group">
          {[1, 2, 3, 4].map((set) => (
            <button
              key={set}
              className={`menu-button image-set-button ${imageSet === set ? 'active' : ''}`}
              onClick={() => handleImageSetClick(set as 1 | 2 | 3 | 4)}
              title={`Image set ${set} (shortcut: ${set})`}
            >
              <div className="menu-button-symbol">{set}</div>
              <div className="menu-button-label">SET {set}</div>
            </button>
          ))}
        </div>

        {/* Divider */}
        <div className="menu-divider">│</div>

        {/* Future features and voice */}
        <div className="menu-group">
          {/* Introduction button */}
          <button
            className="menu-button"
            onClick={handleIntroductionClick}
            title="Introduction (shortcut: I)"
          >
            <div className="menu-button-symbol">I</div>
            <div className="menu-button-label">INTRO</div>
          </button>

          {/* Voice toggle button */}
          <button
            className={`menu-button voice-toggle ${isVoiceEnabled ? 'active' : ''}`}
            onClick={handleVoiceToggleClick}
            title={`Voice ${isVoiceEnabled ? 'ON' : 'OFF'} (shortcut: V)`}
          >
            <div className="menu-button-symbol">V</div>
            <div className="menu-button-label">
              {isVoiceEnabled ? 'VOICE' : 'MUTE'}
            </div>
            <div className="menu-button-status">
              {isVoiceEnabled ? 'ON' : 'OFF'}
            </div>
          </button>
        </div>
      </div>

      {/* Menu footer info */}
      <div className="menu-footer">
        <div className="menu-info-row">M to close menu</div>
        <div className="menu-info-row">
          Hold F to speed up (no voice)
        </div>
        <div className="menu-info-row">
          VOICE: {isVoiceEnabled ? 'ON' : 'OFF'}
        </div>
        <div className="menu-info-row">
          Hold SPACE to record a question
        </div>
      </div>
    </div>
  );
};

export default Menu;
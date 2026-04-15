import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import Typewriter from '../components/Typewriter';
import VoiceIndicator from '../components/VoiceIndicator';
import DiscussionLog from '../components/DiscussionLog';

// Stub CSS modules so they don't throw in jsdom
vi.mock('../components/Typewriter.module.css', () => ({ default: {} }));
vi.mock('../components/VoiceIndicator.module.css', () => ({ default: {} }));
vi.mock('../components/DiscussionLog.module.css', () => ({ default: {} }));
vi.mock('../components/InputSection.module.css', () => ({ default: {} }));

describe('Typewriter', () => {
  it('renders without crashing', () => {
    render(<Typewriter text="Hello" onComplete={vi.fn()} />);
  });
});

describe('VoiceIndicator', () => {
  it('renders nothing when not listening', () => {
    const { container } = render(<VoiceIndicator isListening={false} liveTranscript="" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders recording indicator when listening with no transcript', () => {
    render(<VoiceIndicator isListening={true} liveTranscript="" />);
    expect(screen.getByText(/RECORDING/)).toBeTruthy();
  });

  it('renders nothing when transcript is non-empty', () => {
    const { container } = render(<VoiceIndicator isListening={true} liveTranscript="hello" />);
    expect(container.firstChild).toBeNull();
  });
});

describe('DiscussionLog', () => {
  it('renders without crashing with empty state', () => {
    render(
      <DiscussionLog
        finishedLines={[]}
        currentLine={null}
      />,
    );
  });

  it('renders philosopher name when lines are present', () => {
    const lines = [
      { id: 1, philosopher: 'Flusser', text: 'Hello world', isNew: false },
    ];
    render(
      <DiscussionLog
        finishedLines={lines}
        currentLine={null}
      />,
    );
    expect(screen.getByText('Flusser-AI')).toBeTruthy();
  });
});

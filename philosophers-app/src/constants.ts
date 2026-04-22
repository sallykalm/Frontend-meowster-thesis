// Philosopher names, colors, API config
export const COLORS: Record<string, string> = {
  "Flusser-AI": "#FA4616",
  "Weizenbaum-AI": "#97D700",
  "Virilio-AI": "#fff627",
  "Weibel-AI": "#8DC8E8",
  "System": "#FFFFFF",
};

export const PHILOSOPHER_CONFIG: Record<string, { displayName: string, filePrefix: string }> = {
  "Flusser": { displayName: "Flusser-AI", filePrefix: "flusser" },
  "Weizenbaum": { displayName: "Weizenbaum-AI", filePrefix: "weizenbaum" },  
  "Weibel": { displayName: "Weibel-AI", filePrefix: "weibel" },
  "Virilio": { displayName: "Virilio-AI", filePrefix: "virilio" },
  "Moderator": { displayName: "System", filePrefix: "moderator" }
};

const API_HOST = import.meta.env.VITE_API_HOST ?? 'localhost';
const API_PORT = import.meta.env.VITE_API_PORT ?? '15567';
export const PORT = parseInt(API_PORT, 10);
export const BASE_URL = `http://${API_HOST}:${API_PORT}/api/`;

// Debate timing and display
export const MAX_LINE_LENGTH = 80;
export const SUBTITLE_CLEAR_DELAY_MS = 500;
export const THINKING_DELAY_MS = 5000;
export const FINISHED_LINES_KEPT = 3;
export const MAX_VISIBLE_LINES = 4;
export const LINE_OPACITIES = [1, 1, 0.6, 0.3]; // newest → oldest

// Typewriter
export const TYPEWRITER_SPEED_MS = 90;

export const TYPEWRITER_SPEED_BY_PHILOSOPHER: Record<string, number> = {
  Flusser:     50,
  Virilio:     50,
  Weizenbaum:  50,
  Weibel:      50,
  Moderator:   50,
};

// Speech recognition
export const SPEECH_LANGUAGE = 'en-US';

// Barge-in: short pause (ms) before auto-submitting a captured transcript,
// so the user can see what was transcribed before the question is sent.
export const BARGE_IN_SUBMIT_DELAY_MS = 800;

// Philosopher names used for audience question targeting chips
export const PHILOSOPHER_NAMES = ['Flusser', 'Virilio', 'Weizenbaum', 'Weibel'] as const;
export type PhilosopherName = typeof PHILOSOPHER_NAMES[number];

/**
 * Scan free-form text for philosopher name mentions and return the matched names.
 * Used to auto-populate addressed_to from typed or transcribed questions.
 */
export function parseAddressedTo(text: string): string[] {
  const lower = text.toLowerCase();
  return PHILOSOPHER_NAMES.filter((name) => lower.includes(name.toLowerCase()));
}


export interface SubtitleChunk {
  text: string;
  philosopher: string;
  turnType?: string | null;
}

export interface ChatMessage {
  id: number;
  philosopher: string;
  text: string;
  isNew: boolean;
  turnType?: string | null;
  onComplete?: (finalText?: string) => void;
  interrupted?: boolean; // signals the active typewriter to stop mid-stream
}

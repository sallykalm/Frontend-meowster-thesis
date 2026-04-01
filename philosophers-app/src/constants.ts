// Philosopher names, colors, API config
export const COLORS: Record<string, string> = {
  "Flusser-AI": "#FA4616",
  "Weizenbaum-AI": "#97D700",
  "Virilio-AI": "#E0E721",
  "Weibel-AI": "#8DC8E8",
  "Moderator": "#FFFFFF" 
};

export const PHILOSOPHER_CONFIG: Record<string, { displayName: string, filePrefix: string }> = {
  "Flusser": { displayName: "Flusser-AI", filePrefix: "flusser" },
  "Weizenbaum": { displayName: "Weizenbaum-AI", filePrefix: "weizenbaum" },
  "Virilio": { displayName: "Virilio-AI", filePrefix: "virilio" },
  "Weibel": { displayName: "Weibel-AI", filePrefix: "weibel" },
  "Moderator": { displayName: "system", filePrefix: "moderator" }
};

export const PORT = 15567;
export const BASE_URL = `http://localhost:${PORT}/api/`;


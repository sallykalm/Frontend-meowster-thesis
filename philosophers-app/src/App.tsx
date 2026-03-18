import { useState, useEffect } from 'react';
import './App.css';

// --- 1. THE TYPEWRITER ---
const Typewriter = ({ text, speed = 25, onComplete }: { text: string, speed?: number, onComplete?: () => void }) => {
  const [displayedText, setDisplayedText] = useState("");

  useEffect(() => {
    let i = 0;
    const timer = setInterval(() => {
      setDisplayedText((prev) => prev + text.charAt(i));
      i++;
      if (i >= text.length) {
        clearInterval(timer);
        if (onComplete) onComplete();
      }
    }, speed);
    return () => clearInterval(timer);
  }, [text, speed, onComplete]);

  return <span>{displayedText}</span>;
};

// --- 2. DATA SHAPES ---
interface ChatMessage {
  id: number; // Unique ID to prevent the ghosting bug
  philosopher: string;
  text: string;
  isNew: boolean;
  onComplete?: () => void;
}

const COLORS: Record<string, string> = {
  "Flusser": "#FA4616",
  "Weizenbaum": "#97D700",
  "Virilio": "#E0E721",
  "Weibel": "#8DC8E8",
  "Moderator": "#FFFFFF" 
};

function App() {
  const [inputValue, setInputValue] = useState("");
  const [submittedQuestion, setSubmittedQuestion] = useState("");
  const [discussion, setDiscussion] = useState<ChatMessage[]>([]);
  const [thinkingName, setThinkingName] = useState<string | null>(null);

  useEffect(() => {
    fetch('http://localhost:8000/api/philosophers').catch(console.error);
  }, []);

  // --- 3. THE CONTROL LOOP ---
  const startDebate = async () => {
    if (!inputValue) return;
    
    setSubmittedQuestion(inputValue);
    setInputValue("");
    setDiscussion([]);

    try {
      await fetch('http://localhost:8000/api/question', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: inputValue })
      });
      
      let finished = false;
      while (!finished) {
        const response = await fetch('http://localhost:8000/api/next-response');
        if (!response.ok) break;
        const data = await response.json();

        // A. Show Thinking status
        setThinkingName(data.philosopher);
        await new Promise(resolve => setTimeout(resolve, 2000));
        setThinkingName(null);

        // B. Wait for Typewriter to finish
        await new Promise<void>((resolve) => {
          const newMessage: ChatMessage = {
            id: Date.now() + Math.random(), // Guaranteed unique ID
            philosopher: data.philosopher,
            text: data.text,
            isNew: true,
            onComplete: () => resolve() 
          };

          setDiscussion(prev => [
            newMessage,
            ...prev.map(m => ({ ...m, isNew: false }))
          ]);
        });

        if (data.is_last) finished = true;
      }
    } catch (err) {
      console.error("System Error:", err);
      setThinkingName(null);
    }
  };

  return (
    <div className="app-container">
      <div className="input-section">
        <input 
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="[ awaiting voice input ]"
          onKeyDown={(e) => { if(e.key === 'Enter') startDebate(); }}
        />
      </div>

      <div className="image-grid">
        <div className="philosopher-frame" style={{ borderColor: COLORS.Weizenbaum }}>
          <img src="/images/weizenbaum.png" alt="Weizenbaum" />
        </div>
        <div className="philosopher-frame" style={{ borderColor: COLORS.Flusser }}>
          <img src="/images/flusser.png" alt="Flusser" />
        </div>
        <div className="philosopher-frame" style={{ borderColor: COLORS.Weibel }}>
          <img src="/images/weibel.png" alt="Weibel" />
        </div>
        <div className="philosopher-frame" style={{ borderColor: COLORS.Virilio }}>
          <img src="/images/virilio.png" alt="Virilio" />
        </div>
      </div>

      {submittedQuestion && <div className="submitted-question">{submittedQuestion}</div>}

      <div className="discussion-log">
        {thinkingName && (
          <div className="thinking-indicator" style={{ color: COLORS[thinkingName] }}>
            {thinkingName.toUpperCase()} IS THINKING...
          </div>
        )}
        
        {discussion.map((msg, index) => {
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
    </div>
  );
}

export default App;
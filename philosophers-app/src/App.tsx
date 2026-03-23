import { useState, useEffect, useRef } from 'react';
import './App.css';

// --- TS Declarations for Web Speech API ---
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

// --- 1. THE TYPEWRITER ---
const Typewriter = ({ text, speed = 25, onComplete }: { text: string, speed?: number, onComplete?: () => void }) => {
  const [displayedText, setDisplayedText] = useState("");
  
  const indexRef = useRef(0);

  useEffect(() => {
    setDisplayedText("");
    indexRef.current = 0;

    const timer = setInterval(() => {
      if (indexRef.current < text.length) {
        const nextChar = text.charAt(indexRef.current);
        setDisplayedText((prev) => prev + nextChar);
        indexRef.current += 1;
      } else {
        clearInterval(timer);
        if (onComplete) onComplete();
      }
    }, speed);

    return () => {
      clearInterval(timer);
    };
  }, [text, speed]); 

  return <span>{displayedText}</span>;
};

// --- 2. DATA SHAPES ---
interface ChatMessage {
  id: number;
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

const PORT = 8000;
const BASE_URL = `http://localhost:${PORT}/api/`;

function App() {
  const [inputValue, setInputValue] = useState("");
  const [submittedQuestion, setSubmittedQuestion] = useState("");
  const [discussion, setDiscussion] = useState<ChatMessage[]>([]);
  const [thinkingName, setThinkingName] = useState<string | null>(null);

  // --- NEW: Audio State Variables ---
  const [isListening, setIsListening] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState("");
  
  // --- NEW: Image Toggle State ---
  const [useAltImages, setUseAltImages] = useState(false);
  
  const recognitionRef = useRef<any>(null);
  const liveTranscriptRef = useRef(""); 
  const debateActiveRef = useRef(false);

  useEffect(() => {
    fetch(`${BASE_URL}philosophers`).catch(console.error);

    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true; 
      recognition.interimResults = true; 
      recognition.lang = 'en-US'; 

      recognition.onresult = (event: any) => {
        let currentTranscript = '';
        for (let i = 0; i < event.results.length; i++) {
          currentTranscript += event.results[i][0].transcript;
        }
        setLiveTranscript(currentTranscript);
        liveTranscriptRef.current = currentTranscript; 
      };

      recognitionRef.current = recognition;
    } else {
      console.warn("Speech Recognition not supported in this browser. Use Chrome/Edge.");
    }
  }, []);

  // --- Keyboard Controls ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 1. Check for the 'R' key to toggle images (ignore if typing in the input box)
      if ((e.key === 'r' || e.key === 'R') && document.activeElement?.tagName !== 'INPUT') {
        setUseAltImages((prev) => !prev); // Flips between true/false
        return; 
      }

      // 2. Check for Spacebar (Voice Recording)
      if (e.code === 'Space' && !e.repeat && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault(); 
        
        debateActiveRef.current = false;
        setDiscussion([]);
        setThinkingName(null);
        setIsListening(true);
        setLiveTranscript("");
        liveTranscriptRef.current = "";
        setSubmittedQuestion("");

        fetch(`${BASE_URL}question`, {
          method: 'DELETE'
        }).catch(console.error);

        try {
          recognitionRef.current?.start(); 
        } catch (err) { /* Ignore if already started */ }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        
        setIsListening(false);
        recognitionRef.current?.stop(); 

        const finalSpokenText = liveTranscriptRef.current.trim();
        if (finalSpokenText) {
          startDebate(finalSpokenText);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // --- 3. THE CONTROL LOOP ---
  const startDebate = async (questionText: string) => {
    if (!questionText) return;
    
    setSubmittedQuestion(questionText);
    setInputValue("");
    setDiscussion([]);
    debateActiveRef.current = true; 

    try {
      await fetch(`${BASE_URL}question`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: questionText })
      });
      
      let finished = false;
      
      while (!finished && debateActiveRef.current) {
        const response = await fetch(`${BASE_URL}next-response`);
        if (!response.ok) break;
        const data = await response.json();

        if (!debateActiveRef.current) break; 

        setThinkingName(data.philosopher);
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        if (!debateActiveRef.current) break; 

        setThinkingName(null);

        await new Promise<void>((resolve) => {
          const newMessage: ChatMessage = {
            id: Date.now() + Math.random(),
            philosopher: data.philosopher,
            text: data.text,
            isNew: true,
            onComplete: () => resolve() 
          };

          if (debateActiveRef.current) {
            setDiscussion(prev => [
              newMessage,
              ...prev.map(m => ({ ...m, isNew: false }))
            ]);
          } else {
            resolve(); 
          }
        });

        if (data.is_last) finished = true;
      }
    } catch (err) {
      console.error("System Error:", err);
      setThinkingName(null);
    }
  };

  // --- 4. THE RENDER ---
  return (
    <div className="app-container">
      <div className="input-section">
        <input 
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="[ press SPACE to speak, or type here ]"
          onKeyDown={(e) => { 
            if(e.key === 'Enter') {
              startDebate(inputValue);
              (e.target as HTMLInputElement).blur(); 
            } 
          }}
        />
      </div>

      <div className="image-grid">
        <div className="philosopher-frame">
          {/* Swaps between weizenbaum.png and test1.png */}
          <img src={useAltImages ? "/images/test1.png" : "/images/weizenbaum.png"} alt="Weizenbaum" />
        </div>
        <div className="philosopher-frame">
          {/* Swaps between flusser.png and test2.gif */}
          <img src={useAltImages ? "/images/test2.gif" : "/images/flusser.png"} alt="Flusser" />
        </div>
        <div className="philosopher-frame">
          {/* Swaps between weibel.png and test3.gif */}
          <img src={useAltImages ? "/images/test3.gif" : "/images/weibel.png"} alt="Weibel" />
        </div>
        <div className="philosopher-frame">
          {/* Swaps between virilio.png and test4.png */}
          <img src={useAltImages ? "/images/test4.png" : "/images/virilio.png"} alt="Virilio" />
        </div>
      </div>

      {isListening ? (
        <div className="voice-interface">
          <div className="recording-indicator">● RECORDING_QUESTION</div>
          <div className="live-transcript">{liveTranscript || "..."}</div>
        </div>
      ) : (
        submittedQuestion && <div className="submitted-question">{submittedQuestion}</div>
      )}

      <div className="discussion-log">
        {thinkingName && !isListening && (
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
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
// speed is in ms per charather, default is 25ms
// onComplete is a callback that will be called when the typewriter effect finishes,
// ensuring the next philosopher's response starts after the current one is done generating
const Typewriter = ({ text, speed = 25, onComplete }: { text: string, speed?: number, onComplete?: () => void }) => {
  const [displayedText, setDisplayedText] = useState("");
  
  // We use a ref for the index to ensure it is perfectly in sync with the timer
  const indexRef = useRef(0);

  useEffect(() => {
    // RESET: Clear everything when the text changes
    setDisplayedText("");
    indexRef.current = 0;

    const timer = setInterval(() => {
      // Safety check: Don't go past the text length
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
  }, [text, speed]); // Re-run if text changes

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

function App() {
  const [inputValue, setInputValue] = useState("");
  const [submittedQuestion, setSubmittedQuestion] = useState("");
  const [discussion, setDiscussion] = useState<ChatMessage[]>([]);
  const [thinkingName, setThinkingName] = useState<string | null>(null);

  // --- NEW: Audio State Variables ---
  const [isListening, setIsListening] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState("");
  
  // Refs to keep track of state inside event listeners without causing infinite re-renders
  const recognitionRef = useRef<any>(null);
  const liveTranscriptRef = useRef(""); 
  const debateActiveRef = useRef(false); // stops  the philosophers' responses

  // Wake up backend and setup Speech Recognition
  useEffect(() => {
    fetch('http://localhost:8000/api/philosophers').catch(console.error);

    // Initialize the Microphone API
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true; 
      recognition.interimResults = true; // Shows text *while* you speak
      recognition.lang = 'en-US'; // Change this if you speak another language!

      recognition.onresult = (event: any) => {
        let currentTranscript = '';
        // Gather all the words spoken so far
        for (let i = 0; i < event.results.length; i++) {
          currentTranscript += event.results[i][0].transcript;
        }
        setLiveTranscript(currentTranscript);
        liveTranscriptRef.current = currentTranscript; // Save to Ref for the KeyUp event
      };

      recognitionRef.current = recognition;
    } else {
      console.warn("Speech Recognition not supported in this browser. Use Chrome/Edge.");
    }
  }, []);

  // --- NEW: Spacebar Controls ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // If Spacebar is pressed, not held continuously, and we aren't typing in the input box
      if (e.code === 'Space' && !e.repeat && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault(); // Stop the page from scrolling down
        
        debateActiveRef.current = false; // 1. Mute the philosophers instantly
        setDiscussion([]); // Clear the board
        setThinkingName(null);
        setIsListening(true);
        setLiveTranscript("");
        liveTranscriptRef.current = "";
        setSubmittedQuestion("");

        try {
          recognitionRef.current?.start(); // 2. Start recording
        } catch (err) { /* Ignore if already started */ }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        
        setIsListening(false);
        recognitionRef.current?.stop(); // 1. Stop recording

        // 2. Submit whatever was recorded
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

  // --- 3. THE CONTROL LOOP (Modified to accept text directly) ---
    // fetches the next response, shows "thinking" status, waits for typewriter to finish, then loops until debate is done.
  const startDebate = async (questionText: string) => {
    if (!questionText) return;
    
    setSubmittedQuestion(questionText);
    setInputValue("");
    setDiscussion([]);
    debateActiveRef.current = true; // Turn the debate engine back on

    try {
      await fetch('http://localhost:8000/api/question', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: questionText })
      });
      
      let finished = false;
      
      // NOTICE: We now check debateActiveRef.current. 
      // If you press spacebar, this becomes false and instantly breaks the loop!
      while (!finished && debateActiveRef.current) {
        const response = await fetch('http://localhost:8000/api/next-response');
        if (!response.ok) break;
        const data = await response.json();

        if (!debateActiveRef.current) break; // Double check in case spacebar was pressed during fetch

        setThinkingName(data.philosopher);
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        if (!debateActiveRef.current) break; // Triple check after the delay

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
            resolve(); // Escape the promise if interrupted
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
//returns the main structure, including imput box, images, question, and discussion log.
// input section (question submission) with placeholder text and keyboard "enter" support
// image grid with 4 philosophers, using the COLORS object for border colors   
// discussion log that maps over the discussion state, showing philosopher name and text, with opacity fading for older messages  
// thinking indicator that shows which philosopher is currently "thinking" with a single pulse animation
// Opacity levels for chat bubbles are calculated based on their index in the discussion array, with newer messages appearing more opaque and older messages fading out, creating a visual hierarchy that emphasizes recent contributions while still showing the flow of the conversation.

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
              // Ensure we blur the input so spacebar works for talking again
              (e.target as HTMLInputElement).blur(); 
            } 
          }}
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

      {/* NEW: Voice Interface Display */}
      {isListening ? (
        <div className="voice-interface">
          <div className="recording-indicator">● RECORDING_AUDIO_FEED</div>
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
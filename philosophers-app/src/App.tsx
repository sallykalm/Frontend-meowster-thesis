import { useState, useEffect, useRef } from 'react';
import type { ChatMessage } from './DiscussionLog';
import './App.css';

import InputSection from './InputSection';
import ImageGrid from './ImageGrid';
import DiscussionLog from './DiscussionLog';
import VoiceIndicator from './VoiceIndicator';

import { PHILOSOPHER_CONFIG } from './constants';
import { fetchPhilosophers, submitQuestion, clearQuestion, getNextResponse } from './api';

// --- TS Declarations for Web Speech API ---
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

function App() {
  const [inputValue, setInputValue] = useState("");
  const [submittedQuestion, setSubmittedQuestion] = useState("");
  const [discussion, setDiscussion] = useState<ChatMessage[]>([]);
  const [thinkingName, setThinkingName] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [imageSet, setImageSet] = useState<number>(1);
  const [typingPhilosopher, setTypingPhilosopher] = useState<string | null>(null);
  
  const recognitionRef = useRef<any>(null);
  const liveTranscriptRef = useRef(""); 
  const debateActiveRef = useRef(false);

  // Initialize Web Speech API and fetch philosophers
  useEffect(() => {
    fetchPhilosophers();

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

  // Keyboard controls: Space for voice, 1-4 for images
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Space key for voice recording
      if (e.code === 'Space' && !e.repeat && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault(); 
        
        debateActiveRef.current = false;
        setDiscussion([]);
        setThinkingName(null);
        setIsListening(true);
        setLiveTranscript("");
        liveTranscriptRef.current = "";
        setSubmittedQuestion("");

        clearQuestion();

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
  
  // Main debate loop
  const startDebate = async (questionText: string) => {
    if (!questionText) return;

    debateActiveRef.current = false;
    setDiscussion([]);
    setThinkingName(null);
    setTypingPhilosopher(null);

    await clearQuestion();
    await new Promise(resolve => setTimeout(resolve, 100));

    setSubmittedQuestion(questionText);
    setInputValue("");
    debateActiveRef.current = true;

    try {
      await submitQuestion(questionText);
      
      let finished = false;
      
      while (!finished && debateActiveRef.current) {
        const data = await getNextResponse();
        
        if (data === null) {
          // 504 response or error, retry
          await new Promise(resolve => setTimeout(resolve, 100));
          continue;
        }

        if (!debateActiveRef.current) break; 

        // Translate philosopher name
        const config = PHILOSOPHER_CONFIG[data.philosopher];
        const displayName = config ? config.displayName : data.philosopher;

        setThinkingName(displayName);
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        if (!debateActiveRef.current) break; 

        setThinkingName(null);
        setTypingPhilosopher(displayName);

        await new Promise<void>((resolve) => {
          const newMessage: ChatMessage = {
            id: Date.now() + Math.random(),
            philosopher: displayName,
            text: data.text,
            isNew: true,
            onComplete: () => {
              setTypingPhilosopher(null);
              resolve(); 
            }
          };

          if (debateActiveRef.current) {
            setDiscussion(prev => [
              newMessage,
              ...prev.map(m => ({ ...m, isNew: false }))
            ]);
          } else {
            setTypingPhilosopher(null);
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

  return (
    <div className="app-container">
      <InputSection 
        value={inputValue}
        onChange={setInputValue}
        onSubmit={startDebate}
      />

      <ImageGrid 
        imageSet={imageSet}
        onImageSetChange={setImageSet}
        typingPhilosopher={typingPhilosopher}
      />

      {submittedQuestion && !isListening && (
        <div className="submitted-question">{submittedQuestion}</div>
      )}

      <VoiceIndicator 
        isListening={isListening}
        liveTranscript={liveTranscript}
      />

      <DiscussionLog 
        messages={discussion}
        thinkingName={thinkingName}
        isListening={isListening}
      />
    </div>
  );
}

export default App;
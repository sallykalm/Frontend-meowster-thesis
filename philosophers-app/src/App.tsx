import { submitQuestion, getNextResponse, clearQuestion } from "./api";
import { PORT } from "./constants";
import { useState, useEffect, useRef } from "react";
import DiscussionLog from "./DiscussionLog";
import type { ChatMessage } from "./DiscussionLog";
import ImageGrid from "./ImageGrid";
import Menu from "./Menu";
import "./App.css";
import { useWebSpeech } from "./useWebSpeech";

function App() {
    const [finishedLines, setFinishedLines] = useState<ChatMessage[]>([]);
    const [currentLine, setCurrentLine] = useState<ChatMessage | null>(null);
    const [currentPhilosopher, setCurrentPhilosopher] = useState<string | null>(null);
    const [thinkingName, setThinkingName] = useState<string | null>(null);
    const [imageSet, setImageSet] = useState(1);
    const [userQuestion, setUserQuestion] = useState<string>("");
    const [submittedQuestion, setSubmittedQuestion] = useState<string>("");
    
    // Menu system states
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [isFastForwarding, setIsFastForwarding] = useState(false);
    const [isVoiceEnabled, setIsVoiceEnabled] = useState(true);
    
    // Web Speech API hook
    const { isListening, transcript, start: startVoice, stop: stopVoice, reset: resetVoice } = useWebSpeech();
    
    // Input field ref for checking focus
    const inputRef = useRef<HTMLInputElement>(null);
    
    // Audio ref for pause/play control
    const currentAudioRef = useRef<HTMLAudioElement | null>(null);
    
    // AbortController to interrupt debate loop when spacebar is pressed
    const debateAbortRef = useRef<AbortController | null>(null);

    const [dotCount, setDotCount] = useState(1);

    // Animate the dots in the live transcript
  useEffect(() => {
    // Vi animerar bara om vi lyssnar och transkriptionen är tom
    if (!isListening || transcript.trim() !== '') return;

    const interval = setInterval(() => {
      setDotCount((prev) => (prev === 3 ? 1 : prev + 1));
    }, 400);

    return () => clearInterval(interval);
  }, [isListening, transcript]);

    async function startDebate(questionText: string) {
        // Create a new AbortController for this debate
        debateAbortRef.current = new AbortController();
        
        setFinishedLines([]);
        setCurrentLine(null);
        setSubmittedQuestion(questionText);

        await submitQuestion(questionText, isVoiceEnabled);

        let finished = false;
        let lastPhilosopher: string | null = null;

        while (!finished) {
            // Exit early if debate was aborted (e.g., spacebar pressed)
            if (debateAbortRef.current?.signal.aborted) {
                setThinkingName(null);
                setCurrentPhilosopher(null);
                setCurrentLine(null);
                setFinishedLines([]);
                break;
            }

            // Wait if paused - continuously check with small delay
            while (isPaused) {
                await new Promise((resolve) => setTimeout(resolve, 100));
                if (debateAbortRef.current?.signal.aborted) {
                    break;
                }
            }

            // Check abort again after pause wait
            if (debateAbortRef.current?.signal.aborted) {
                setThinkingName(null);
                setCurrentPhilosopher(null);
                setCurrentLine(null);
                setFinishedLines([]);
                break;
            }

            const data = await getNextResponse();
            if (!data) break;

            // If this is not the first philosopher, show "thinking" for 5 seconds before they speak
            if (lastPhilosopher && data.philosopher !== lastPhilosopher) {
                setCurrentPhilosopher(null); // No one is speaking during thinking
                setThinkingName(data.philosopher);
                await new Promise((res) => setTimeout(res, 5000));
                setThinkingName(null);
            }

            setThinkingName(data.philosopher);
            setCurrentPhilosopher(data.philosopher);

            let audioEndPromise: Promise<void> = Promise.resolve();
            if (data.audio_url && isVoiceEnabled) {
                const audio = new Audio(`http://localhost:${PORT}${data.audio_url}`);
                currentAudioRef.current = audio;
                audioEndPromise = new Promise<void>((res) => {
                    audio.addEventListener('ended', () => res(), { once: true });
                    audio.addEventListener('error', () => res(), { once: true });
                    audio.play().catch(() => res());
                });
            }

            // Split response into lines (if needed)
            const lines = splitIntoLines(data.text);

            for (const line of lines) {
                await new Promise<void>((resolve) => {
                    setCurrentLine({
                        id: Date.now() + Math.random(),
                        philosopher: data.philosopher,
                        text: line,
                        isNew: true,
                        onComplete: () => {
                            setFinishedLines((prev) => {
                                const updated = [
                                    ...prev,
                                    {
                                        id: Date.now() + Math.random(),
                                        philosopher: data.philosopher,
                                        text: line,
                                        isNew: false,
                                    },
                                ];
                                return updated.slice(-3);
                            });
                            setCurrentLine(null);
                            resolve();
                        },
                    });
                });
            }

            await audioEndPromise;

            lastPhilosopher = data.philosopher;

            if (data.is_last) finished = true;
            setThinkingName(null);
        }

        // Explicitly set philosopher to null when debate finishes
        setCurrentPhilosopher(null);
    }

    function splitIntoLines(text: string, maxLen = 80) {
        const lines: string[] = [];
        let t = text;
        while (t.length > maxLen) {
            let idx = t.lastIndexOf(" ", maxLen);
            if (idx === -1) idx = maxLen;
            lines.push(t.slice(0, idx));
            t = t.slice(idx).trim();
        }
        if (t.length) lines.push(t);
        return lines;
    }

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Check if input is focused
            const isInputFocused = document.activeElement === inputRef.current;
            
            // If spacebar pressed, abort any ongoing debate
            if (e.code === "Space") {
                if (debateAbortRef.current && !debateAbortRef.current.signal.aborted) {
                    debateAbortRef.current.abort();
                    setSubmittedQuestion(""); // Clear question to allow new voice input
                }
            }
            // Only start voice if spacebar pressed, input NOT focused, and not already listening
            if (e.code === "Space" && !isListening && !isInputFocused) {
                e.preventDefault();
                startVoice();
            }
            
            // Menu shortcuts (ignore input focus)
            if (e.key.toUpperCase() === "M") {
                setIsMenuOpen(!isMenuOpen);
            }
            
            // Only process menu shortcuts if input is not focused
            if (!isInputFocused) {
                if (e.key.toUpperCase() === "P") {
                    setIsPaused(!isPaused);
                }
                if (e.key.toUpperCase() === "Q") {
                    handleStop();
                }
                if (e.key.toUpperCase() === "F") {
                    setIsFastForwarding(true);
                }
                if (e.key.toUpperCase() === "V") {
                    setIsVoiceEnabled(!isVoiceEnabled);
                }
                if (e.key.toUpperCase() === "I") {
                    handleIntroduction();
                }
            }
        };
        const handleKeyUp = (e: KeyboardEvent) => {
            const isInputFocused = document.activeElement === inputRef.current;
            
            // Only stop voice if spacebar released and currently listening
            if (e.code === "Space" && isListening) {
                e.preventDefault();
                stopVoice();
                // Handle transcript submission after a small delay for final processing
                setTimeout(() => {
                    if (transcript.trim()) {
                        setUserQuestion("");
                        startDebate(transcript.trim());
                        resetVoice();
                    }
                }, 100);
            }
            
            // Only process menu shortcuts if input is not focused
            if (!isInputFocused) {
                if (e.key.toUpperCase() === "F") {
                    setIsFastForwarding(false);
                }
            }
        };
        
        window.addEventListener("keydown", handleKeyDown);
        window.addEventListener("keyup", handleKeyUp);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
            window.removeEventListener("keyup", handleKeyUp);
        };
    }, [isListening, transcript, startVoice, stopVoice, resetVoice, isMenuOpen, isPaused]);

    // Handle pause/play effect
    useEffect(() => {
        if (!isPaused) {
            // Resume: unpause audio if it's paused
            if (currentAudioRef.current) {
                if (currentAudioRef.current.paused) {
                    currentAudioRef.current.play().catch(() => {});
                }
            }
        } else {
            // Pause: pause the audio
            if (currentAudioRef.current) {
                if (!currentAudioRef.current.paused) {
                    currentAudioRef.current.pause();
                }
            }
        }
    }, [isPaused]);

    function handleStop() {
        if (debateAbortRef.current && !debateAbortRef.current.signal.aborted) {
            debateAbortRef.current.abort();
        }
        setIsPaused(false);
        setIsFastForwarding(false);
        setSubmittedQuestion("");
        setFinishedLines([]);
        setCurrentLine(null);
        setThinkingName(null);
        setCurrentPhilosopher(null);
        clearQuestion();
    }

    function handleIntroduction() {
        // Placeholder for future introduction functionality
        console.log("Introduction button clicked");
    }

    return (
        <div className="app-container">
            {/* Menu overlay */}
            {isMenuOpen && (
                <Menu
                    isMenuOpen={isMenuOpen}
                    isPaused={isPaused}
                    isFastForwarding={isFastForwarding}
                    isVoiceEnabled={isVoiceEnabled}
                    imageSet={imageSet}
                    onPausePlay={() => setIsPaused(!isPaused)}
                    onStop={handleStop}
                    onFastForward={(isActive: boolean) => setIsFastForwarding(isActive)}
                    onImageSetChange={setImageSet}
                    onVoiceToggle={(enabled: boolean) => setIsVoiceEnabled(enabled)}
                    onIntroduction={handleIntroduction}
                />
            )}
            <div className="input-section">
                <input
                    ref={inputRef}
                    value={userQuestion}
                    onChange={(e) => setUserQuestion(e.target.value)}
                    placeholder=""
                    onKeyDown={(e) => {
                        if (e.key === "Enter") {
                            startDebate(userQuestion);
                            setSubmittedQuestion(userQuestion);
                            setUserQuestion(""); // Clear after submit
                            (e.target as HTMLInputElement).blur();
                        }
                    }}
                />
            </div>
            <ImageGrid
                imageSet={imageSet}
                onImageSetChange={setImageSet}
                typingPhilosopher={currentPhilosopher}
                thinkingName={thinkingName}
                currentPhilosopher={currentPhilosopher}
            />
            
            {/* 1. Visar den inskickade frågan när vi INTE spelar in */}
            {submittedQuestion && (
                <div className="user-question">Question: {submittedQuestion}</div>
            )}
            
            {/* 2. Visar live-transkriptionen på EXAKT samma plats när vi lyssnar */}
            {isListening && !submittedQuestion && (
                <div className="user-question" style={{ display: 'flex', justifyContent: 'center' }}>
                    <div className="live-transcript">
                        {/* Om transcript är tomt visar vi de animerade punkterna, annars texten */}
                        {transcript.trim() ? transcript : '.'.repeat(dotCount)}
                    </div>
                </div>
            )}

            {/*Renderar konversationen */}
            <DiscussionLog 
                finishedLines={finishedLines}
                currentLine={currentLine}
                isListening={isListening}
                liveTranscript={transcript}
                isFastForwarding={isFastForwarding}
                isPaused={isPaused}
            />
        </div>
    );
}

export default App;
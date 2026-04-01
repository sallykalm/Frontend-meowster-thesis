import { submitQuestion, getNextResponse } from "./api";
import { PORT } from "./constants";
import { useState, useEffect, useRef } from "react";
import DiscussionLog from "./DiscussionLog";
import type { ChatMessage } from "./DiscussionLog";
import ImageGrid from "./ImageGrid";
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
    
    // Web Speech API hook
    const { isListening, transcript, start: startVoice, stop: stopVoice, reset: resetVoice } = useWebSpeech();
    
    // Input field ref for checking focus
    const inputRef = useRef<HTMLInputElement>(null);
    
    // AbortController to interrupt debate loop when spacebar is pressed
    const debateAbortRef = useRef<AbortController | null>(null);

    async function startDebate(questionText: string) {
        // Create a new AbortController for this debate
        debateAbortRef.current = new AbortController();
        
        setFinishedLines([]);
        setCurrentLine(null);
        setSubmittedQuestion(questionText);

        await submitQuestion(questionText);

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
            if (data.audio_url) {
                const audio = new Audio(`http://localhost:${PORT}${data.audio_url}`);
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
            // If spacebar pressed, abort any ongoing debate
            if (e.code === "Space") {
                if (debateAbortRef.current && !debateAbortRef.current.signal.aborted) {
                    debateAbortRef.current.abort();
                    setSubmittedQuestion(""); // Clear question to allow new voice input
                }
            }
            // Only start voice if spacebar pressed, input NOT focused, and not already listening
            if (e.code === "Space" && !isListening && document.activeElement !== inputRef.current) {
                e.preventDefault();
                startVoice();
            }
        };
        const handleKeyUp = (e: KeyboardEvent) => {
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
        };
        window.addEventListener("keydown", handleKeyDown);
        window.addEventListener("keyup", handleKeyUp);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
            window.removeEventListener("keyup", handleKeyUp);
        };
    }, [isListening, transcript, startVoice, stopVoice, resetVoice]);

    return (
        <div className="app-container">
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
            {/* Show the submitted question or live transcript while listening */}
            {submittedQuestion && (
                <div className="user-question">{submittedQuestion}</div>
            )}
            {isListening && transcript && !submittedQuestion && (
                <div className="user-question">{transcript}</div>
            )}
            <DiscussionLog
                finishedLines={finishedLines}
                currentLine={currentLine}
                isListening={isListening}
                liveTranscript={transcript}
            />
        </div>
    );
}

export default App;
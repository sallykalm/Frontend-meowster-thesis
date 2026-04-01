import { submitQuestion, getNextResponse } from "./api";
import { PORT } from "./constants";
import { useState, useEffect } from "react";
import DiscussionLog from "./DiscussionLog";
import type { ChatMessage } from "./DiscussionLog";
import ImageGrid from "./ImageGrid";
import "./App.css";
import VoiceIndicator from "./VoiceIndicator";

function App() {
    const [finishedLines, setFinishedLines] = useState<ChatMessage[]>([]);
    const [currentLine, setCurrentLine] = useState<ChatMessage | null>(null);
    const [currentPhilosopher, setCurrentPhilosopher] = useState<string | null>(null);
    const [thinkingName, setThinkingName] = useState<string | null>(null);
    const [isListening, setIsListening] = useState(false);
    const [liveTranscript, setLiveTranscript] = useState("");
    const [imageSet, setImageSet] = useState(1);
    const [userQuestion, setUserQuestion] = useState<string>("");
    const [submittedQuestion, setSubmittedQuestion] = useState<string>("");

    async function startDebate(questionText: string) {
        setFinishedLines([]);
        setCurrentLine(null);
        setSubmittedQuestion(questionText);

        setThinkingName("...");

        await submitQuestion(questionText);

        let finished = false;
        let lastPhilosopher: string | null = null;

        while (!finished) {
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
            if (e.code === "Space" && !isListening) {
                setIsListening(true);
                // Start voice recognition here
            }
        };
        const handleKeyUp = (e: KeyboardEvent) => {
            if (e.code === "Space" && isListening) {
                setIsListening(false);
                // Stop voice recognition and submit transcript here
                if (liveTranscript.trim()) {
                    startDebate(liveTranscript.trim());
                    setSubmittedQuestion(liveTranscript.trim());
                    setUserQuestion("");
                    setLiveTranscript("");
                }
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        window.addEventListener("keyup", handleKeyUp);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
            window.removeEventListener("keyup", handleKeyUp);
        };
    }, [isListening, liveTranscript]);

    return (
        <div className="app-container">
            <div className="input-section">
                <input
                    value={userQuestion}
                    onChange={(e) => setUserQuestion(e.target.value)}
                    placeholder="[ press SPACE to speak, or type here ]"
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
            />
            {/* Show the submitted question (not while typing) */}
            {submittedQuestion && (
                <div className="user-question">{submittedQuestion}</div>
            )}
            <DiscussionLog
                finishedLines={finishedLines}
                currentLine={currentLine}
                thinkingName={thinkingName}
                isListening={isListening}
            />
            <VoiceIndicator isListening={isListening} liveTranscript={liveTranscript} />
        </div>
    );
}

export default App;
# Philosophers App — Frontend Instructions

## Project Context

This is the frontend for a **museum installation**: a live, AI-mediated philosophical debate system displayed on large projector screens in a dome theatre environment. Four philosopher-themed AI agents respond to audience questions in real time.

The system is designed to run unattended and self-contained—stability and reliability are paramount.

## Setup & Commands

### Quick Start
```bash
# Terminal 1: Backend (in four-philosopher-core folder)
.\.venv\Scripts\activate
python -m src.server.server [--no-ingest] [--tts] [--model MODEL]

# Terminal 2: Frontend (in philosophers-app folder)
npm install  # if needed
npm run dev
```

### Available Scripts
- **`npm run dev`** — Start dev server with HMR on localhost:5173
- **`npm run build`** — Compile TypeScript and bundle for production
- **`npm run lint`** — Run ESLint (no auto-fix; use `eslint . --fix` for that)
- **`npm run preview`** — Preview production build locally

## Project Architecture

### Current State (Prototype)
The project is a single-file monolith in `src/App.tsx`. This is expected to be refactored as the project matures.

**Key components embedded in App:**
- **Input handling** — Captures audience questions (voice and/or text)
- **Debate loop** — Polls the backend API for philosopher responses and manages response display
- **Visual display** — Renders philosopher frames, discussion log, and real-time indicators

**Core state:**
- `discussion` — Chat history (array of philosopher messages)
- `inputValue` — Current user input
- `submittedQuestion` — The question sent to the backend
- `thinkingName` — Which philosopher is currently processing (if any)
- `isListening` — Voice input active state

**Non-state refs** (for side effects that shouldn't trigger re-renders):
- `recognitionRef` — Voice input instance
- `debateActiveRef` — Prevents race conditions during rapid user interactions
- `liveTranscriptRef` — Tracks live voice transcript without state updates

### Target State (Planned)
- Refactored into multiple logical files
- Voice input via a more robust solution (not Web Speech API)
- Response streaming displayed without reliance on specific animation effects
- Hidden text input for accessibility and fallback

## Frontend ↔ Backend API Contract

The frontend communicates with the backend at `http://localhost:15567/api/` (hardcoded in App.tsx).

### Endpoints (Do Not Change)
- **POST `/api/question`** — Send audience question
  - Request body: `{ "text": "question string" }`
  - Response: 200 if accepted
  
- **GET `/api/next-response`** — Poll for next philosopher response
  - Response (200): `{ "philosopher": "string", "text": "string", "is_last": boolean }`
  - Response (504): Still waiting for backend processing (keep polling)
  - Response (any other): Debate has ended or error occurred

- **DELETE `/api/question`** — Clear current question and reset state
  - Used before starting a new debate

- **GET `/api/philosophers`** — Fetch philosopher list
  - Currently called on app mount for warm-up

### Philosopher Name Mapping

Internal philosopher identifiers are mapped to display names:
- "Flusser" → "Flusser-AI"
- "Weizenbaum" → "Weizenbaum-AI"
- "Virilio" → "Virilio-AI"
- "Weibel" → "Weibel-AI"

Each philosopher has:
- A display name (used in UI and COLORS map)
- An image prefix (lowercase, used for asset paths: `flusser1.png`, `virilio2.gif`, etc.)
- A color code (stored in COLORS object)

## Key Implementation Patterns

### Debate Loop
```
1. User submits question → POST /api/question
2. Poll /api/next-response in a loop
   - On 504: Retry (backend still processing)
   - On 200: Display philosopher thinking state
   - Wait ~2 seconds, then display streamed response
   - On is_last=true: End loop
3. Display all responses in reverse chronological order (newest first)
```

### Input Handling
**Current:** Space key for voice, Enter/form submission for text  
**Target:** Primary voice input (via new solution), hidden text input for fallback

### Response Display
Currently responses are animated character-by-character. This mechanism is expected to evolve. Future versions may display responses as they stream in from the backend, or use other presentation methods as the UI design develops.

The display order in the discussion log is **reverse chronological** (newest at top), with opacity fading as you go down.

### Interaction Methods (Current Prototype)

**Voice Input (Web Speech API)**
- **Hold Space** — Start voice recording. Release to submit. Live transcript appears in real-time.

**Image Toggling**
- **Press 1, 2, 3, or 4** — Switch between philosopher image sets (can be pressed anytime during operation)

**Text Input (Alternative)**
- **Click the text input box** → Type your question → Press **Enter** to submit
- This is an alternative to voice input and works if voice is unavailable or disabled

## Important Notes

- **Browser Support** — Current implementation uses Web Speech API (Chrome/Edge required). This will be replaced with a more robust voice input solution as the project evolves.
- **Backend Requirements** — Ensure backend is running before starting the frontend; the frontend does not gracefully handle connection failures yet.
- **Port Hardcoding** — The base URL (`http://localhost:15567/api/`) is hardcoded in App.tsx. For production, this should be configurable.
- **Polling Behavior** — The debate loop uses continuous polling with 504-status retry logic. This is intentional for compatibility with the backend's LLM processing delays.
- **Race Condition Prevention** — `debateActiveRef` is used to cancel in-flight updates if the user starts a new debate before the current one finishes. This is critical for stable operation.

## Asset Management

### Image Sets
Philosopher images are stored in `public/images/` and organized by image set (1–4) and philosopher. The current code supports toggling between sets using keys 1–4.

**Naming Convention:**
```
/images/[philosopher-prefix][set-number].[extension]
```

Examples:
- `flusser1.png`, `flusser1.gif` — Flusser, set 1 (static and animated versions)
- `virilio2.png`, `virilio2.gif` — Virilio, set 2
- `weizenbaum3.png`, `weibel4.png` — Weizenbaum and Weibel in sets 3 and 4

**Philosopher Prefixes:**
- Flusser → `flusser`
- Weizenbaum → `weizenbaum`
- Virilio → `virilio`
- Weibel → `weibel`

### Image Switching Logic
- **Set 1** can use `.gif` files (animated, shown when philosopher is actively generating a response)
- **Sets 2–4** use `.png` files (static)
- The code selects the appropriate format based on the current image set and whether the philosopher is currently typing

**Note:** This asset organization and naming convention may evolve as the museum installation design develops. When adding new image sets or philosopher assets, maintain consistency with this pattern.

## Development Tips

- **Debugging the loop** — Add console logs in the `startDebate` function to track the polling state
- **Testing input** — Use the text input or simulate voice input via browser dev tools
- **Styling** — App-level styles are in `src/App.css`; global styles in `src/index.css`
- **For new features** — Keep in mind this is early prototype code. Refactoring is expected and encouraged.

## Known Limitations & Future Work

- Monolithic component structure (will be refactored)
- No error boundaries or graceful failure states
- No persistent logging or analytics
- Web Speech API will be replaced with a more reliable voice solution
- Response display mechanism expected to evolve
- No accessibility features yet (ARIA labels, keyboard navigation beyond shortcuts)

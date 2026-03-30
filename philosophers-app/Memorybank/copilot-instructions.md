# Philosophers App — Frontend Instructions

**For the team: We're UX designers with limited coding experience. Please explain things in simple terms and focus on ideas rather than code details.**

## Project Context

This is the frontend for a **museum installation**: a live, AI-mediated philosophical debate system displayed on large projector screens in a dome theatre environment. Four philosopher-themed AI agents respond to audience questions in real time.

The system is designed to run unattended and self-contained—stability and reliability are paramount.

## Setup & Commands

### Quick Start
```bash
# Terminal 1: Backend (in four-philosopher-core folder) run in terminal
.\.venv\Scripts\activate
python -m src.server.server

# Terminal 2: Frontend (in philosophers-app folder) run in terminal
npm install  # if needed
npm run dev
```

### Available Scripts
- **`npm run dev`** — Start dev server with HMR on localhost:5173
- **`npm run build`** — Compile TypeScript and bundle for production
- **`npm run lint`** — Run ESLint (no auto-fix; use `eslint . --fix` for that)
- **`npm run preview`** — Preview production build locally

## Project Architecture

### Current State
The frontend is being **refactored from a monolith into separate components**. Progress:
- ✅ Input handling, Image grid, Discussion log, and Voice indicator are now separate React components
- ✅ API calls are centralized in an `api.ts` module
- ✅ Philosophy configuration is in `constants.ts`
- 🔄 `App.tsx` orchestrates these components and manages the main debate flow

**What the app does:**
1. Audience member asks a question (via voice or text)
2. Question gets sent to the backend
3. App repeatedly asks the backend for responses (polling)
4. As each philosopher responds, their message appears on screen
5. When all responses arrive, the debate ends

### Data Flow
- **Input → Backend** — Question submitted to `/api/question`
- **Polling Loop** — App calls `/api/next-response` to get each philosopher response as it becomes ready
- **Display** — Responses show up in the discussion log as they arrive
- **Cleanup** — When debate ends, clear state and wait for next question

### Philosopher Identity System
- **Internal IDs** (used by backend): `Flusser`, `Weizenbaum`, `Virilio`, `Weibel`
- **Display Names** (shown to audience): Can be customized (e.g., "Flusser-AI")
- **Image Prefixes** (for asset files): lowercase version of ID (e.g., `flusser1.png`)

This separation lets us change what people see without affecting how the system works internally.

## Frontend ↔ Backend API Contract

The frontend communicates with the backend at `http://localhost:15567/api/` (hardcoded in App.tsx).

### Available Endpoints

**POST `/api/question`** — Submit a question
- Sends the audience's question to start a debate
- Backend responds immediately; processing happens in the background

**GET `/api/next-response`** — Get the next philosopher response
- Used in a polling loop to fetch responses as they become ready
- May wait a long time (backend is thinking)
- Returns each philosopher's response one at a time
- Includes `is_last` flag to signal when the debate is complete

**DELETE `/api/question`** — Cancel current debate
- Stops the backend from processing further responses
- Clears the queue

**GET `/api/philosophers`** — Get the philosopher roster
- Called once when the app starts
- Returns metadata about each philosopher (name, description)

## Key Implementation Patterns

### Debate Loop
The debate works like this:
1. User submits a question → Sent to backend
2. App repeatedly asks backend "Do you have the next response yet?"
3. Backend eventually says "Yes, here's what philosopher X said"
4. App displays the response
5. Backend says "That was the last response" → Debate ends
6. App is ready for the next question

The exact timing of responses depends on the backend's AI processing, so the frontend just waits patiently.

### Philosopher Display

**Internal ID vs. Display Name:**
- Backend sends internal IDs (e.g., "Flusser")
- Frontend translates to display names (e.g., "Flusser-AI") before showing to audience
- This separation lets the UI team change names without backend changes

### Response Display
Responses appear as they arrive from the backend. The display method (character-by-character animation, streaming, etc.) will evolve—keep display code flexible and decoupled from the polling logic.

## Image Sets & Animated Visuals

### What are image sets?
Each philosopher has 4 sets of images (numbered 1–4). Audience can switch between sets using number keys 1, 2, 3, or 4.

### GIF Support
- **Set 1** can include animated `.gif` files
  - Used when a philosopher is actively responding (to show movement/expression)
  - Static `.png` fallback available
- **Sets 2, 3, 4** 
  - Currently use `.png` files (static)
  - May have `.gif` support added in the future

### File Naming
- Format: `[philosopher-prefix][set-number].[extension]`
- Examples: `flusser1.gif`, `virilio2.png`, `weibel3.png`
- Prefixes: `flusser`, `virilio`, `weizenbaum`, `weibel`

## Development Tips

- **Testing Input** — Use text input to test without needing voice input
- **Styling** — App-level styles in `src/App.css`; global styles in `src/index.css`
- **Refactoring** — Components are being split out as the project evolves. Keep new components focused and single-purpose.
- **API Testing** — Ensure backend is healthy before investigating frontend display issues.

## Known Limitations & Future Work

- ✅ **Refactoring in progress** — Components being extracted from monolith
- 🔄 **Voice input** — Will be replaced with a more robust solution
- 🔄 **Response display** — Display mechanism will evolve
- 🔄 **Image animation** — All sets 2, 3, 4 may get `.gif` support in the future
- 📋 **Timing & sync** — Exact polling behavior may change as backend improves
- ⚠️ **Error handling** — No graceful failure states yet
- ⚠️ **Accessibility** — ARIA labels and keyboard navigation coming soon

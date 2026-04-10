# Philosophers App

A real-time AI debate interface where four digital philosophers — Flusser-AI, Weizenbaum-AI, Virilio-AI, and Weibel-AI — discuss questions posed by the user.

---

## What it does

1. The user submits a question (by typing and pressing Enter, or by holding Space to speak).
2. The backend routes the question to each philosopher's AI model in sequence.
3. Responses are streamed back one at a time and displayed with a typewriter animation.
4. Audio narration plays alongside each response (when available).

---

## Running locally

### Prerequisites

- Node.js 22+
- The philosophers backend running on `http://localhost:15567`

### Install and start

```bash
npm install
npm run dev
```

The app will be available at `http://localhost:5173`. The Vite dev server proxies `/api` and `/audio` to the backend, so no CORS configuration is needed in development.

---

## Environment variables

| Variable        | Default     | Description          |
|-----------------|-------------|----------------------|
| `VITE_API_HOST` | `localhost` | Backend hostname     |
| `VITE_API_PORT` | `15567`     | Backend port         |

Copy `.env.example` to `.env` to override defaults. For production Docker builds, pass them as build args:

```bash
docker build \
  --build-arg VITE_API_HOST=api.example.com \
  --build-arg VITE_API_PORT=443 \
  -t philosophers-app .
```

---

## Keyboard shortcuts

| Key     | Action                                         |
|---------|------------------------------------------------|
| `Space` | Hold to record voice input; release to submit  |
| `Space` | While debate is running: abort and reset       |
| `1`–`4` | Switch philosopher image set                   |
| `Enter` | Submit typed question                          |

---

## Image sets

Press `1`–`4` to cycle through four visual styles for the philosopher portraits. Sets 1, 2, and 4 include animated GIFs that activate when a philosopher is speaking; set 3 is PNG-only.

---

## Project structure

```
src/
  components/     UI components, each with a co-located .module.css
  hooks/          useDebate, useWebSpeech, useDotAnimation
  __tests__/      Unit and smoke tests (Vitest + Testing Library)
  api.ts          All backend fetch calls
  constants.ts    Named constants and environment configuration
  types.ts        Shared TypeScript interfaces
  App.tsx         Root component and keyboard event wiring
  App.css         Global CSS reset and design tokens (:root variables)
```

---

## Available scripts

| Script          | Description                      |
|-----------------|----------------------------------|
| `npm run dev`   | Start dev server with HMR        |
| `npm run build` | Production build (type-check + bundle) |
| `npm run lint`  | ESLint with type-aware rules     |
| `npm test`      | Run Vitest unit and smoke tests  |

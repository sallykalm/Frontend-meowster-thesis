# Philosopher AI — Backend API

## Overview

The backend is a FastAPI server that runs the philosopher debate engine and exposes a simple pull-based HTTP API. The GUI submits a question, then repeatedly calls one endpoint to collect philosopher responses one at a time as they are generated.

There are no sessions or authentication — the server is designed for a single client.

**Base URL**: `http://localhost:15567`
**Interactive docs**: `http://localhost:15567/docs`

---

## Endpoints

### `GET /api/health`

Check whether the server and its dependencies are ready.

**Response**
```json
{ "status": "ok", "llm": true, "tts": false }
```

- `status`: `"ok"` if LLM is reachable, `"degraded"` otherwise
- `llm`: LLM provider is reachable
- `tts`: ElevenLabs TTS is configured (only some philosophers have voices)

---

### `GET /api/philosophers`

List all available philosophers and the moderator.

**Response** — array of:
```json
{
  "name": "Flusser",
  "description": "Vilém Flusser — ...",
  "has_voice": true
}
```

Philosophers: **Flusser, Virilio, Weizenbaum, Weibel** + **Moderator**.
The moderator may appear mid-debate to wrap up or reframe — treat it like any other speaker.

---

### `POST /api/question`

Submit a question and start the debate. If a debate is already running it is aborted first.

**Request body**
```json
{ "text": "What does artificial intelligence reveal about human consciousness?" }
```

**Response** — `202 Accepted`
```json
{ "question_id": "a1b2c3d4-..." }
```

Store the `question_id`. Every response you receive while this debate is active will carry the same ID, so you can detect when a stale response arrives after an abort.

---

### `DELETE /api/question`

Abort the current debate immediately. Clears the internal response queue and unblocks any pending `GET /api/next-response` call (which will return 404).

**Response** — `204 No Content`

Use this when the user wants to skip the current debate and ask a new question.

---

### `GET /api/next-response`

**The core endpoint.** Blocks until the next philosopher response is ready, then returns it. Call this in a loop for the duration of a debate.

**Query params**
| Param | Default | Description |
|-------|---------|-------------|
| `timeout` | `90.0` | Seconds to wait before giving up |

**Response**
```json
{
  "question_id": "a1b2c3d4-...",
  "response_id": "e5f6g7h8-...",
  "philosopher": "Flusser",
  "text": "The apparatus does not ask permission...",
  "audio_url": "/api/audio/e5f6g7h8-...",
  "is_last": false
}
```

- `audio_url` is `null` if TTS is disabled or this philosopher has no voice
- `is_last: true` means the debate is finished — the server is now ready for a new question

**Error responses**
| Status | Meaning |
|--------|---------|
| `404` | No active question (submit one first, or abort just cleared it) |
| `504` | Timeout — no response arrived within `timeout` seconds |

---

### `GET /api/audio/{response_id}`

Download the MP3 audio for a completed response. Only available when `audio_url` is set in the response object.

Returns the audio as `audio/mpeg` bytes.

---

## Typical client loop

```
1.  GET  /api/health          — verify server is up

2.  POST /api/question        — submit question, store question_id

3.  loop:
      GET /api/next-response
        → on 404: no active question, stop loop
        → on 504: timeout, retry or show error
        → on 200:
            display response.philosopher + response.text
            if response.audio_url: download and play audio
            if response.is_last: debate is done, exit loop and enable new question input

4.  User submits next question → go to step 2
    User wants to skip        → DELETE /api/question, then go to step 2
```

---

## Abort behaviour

When `DELETE /api/question` is called:
- The background debate task is cancelled immediately
- The response queue is cleared
- Any `GET /api/next-response` that is currently blocking returns `404`

The client should treat a `404` from `GET /api/next-response` as "debate ended" regardless of whether `is_last` was seen.

---

## Mock server vs real server

Both servers live in `src/server/` and expose identical endpoints. Switching between them requires only pointing at a different process — the API contract is the same.

| | Mock | Real |
|---|---|---|
| Module | `src/server/mock_server.py` | `src/server/server.py` |
| Responses | Pre-written, replayed with delays | Live LLM generation |
| Startup | Instant | Runs KB ingestion + loads philosophers |
| TTS | Always off | Optional (`--tts`) |
| Port | 15567 | 15567 |
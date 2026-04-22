# Distance-Based Dynamic Features — Implementation Plan

## Architecture Pre-Read Summary

### What already exists
- `rag_relevance?: number | null` is **already in `ApiResponse`** ([api.ts:23](../src/api.ts#L23)) — this IS the distance field. No new endpoint or type changes needed.
- `ragRelevanceMap` is already tracked per philosopher in `useDebate.ts` and passed to `ImageGrid.tsx` ([useDebate.ts:121](../src/hooks/useDebate.ts#L121), [useDebate.ts:290-295](../src/hooks/useDebate.ts#L290-L295)).
- `THINKING_DELAY_MS = 5000` is a fixed constant ([constants.ts:26](../src/constants.ts#L26)) — Feature 2 replaces this with a dynamic value.
- Prefetch mechanism already exists:
  - **Subtitle mode**: prefetch starts the moment audio begins playing ([useDebate.ts:356](../src/hooks/useDebate.ts#L356)).
  - **Typewriter mode**: prefetch starts on the last line ([useDebate.ts:464](../src/hooks/useDebate.ts#L464)).
- `ImageGrid.tsx` already handles the set-1 speaking GIF branch ([ImageGrid.tsx:76](../src/components/ImageGrid.tsx#L76)) — Feature 1 adds a conditional for `_distorted.gif`.

### Current turn lifecycle (baseline)
```
[previous audio ends]
  → setCurrentPhilosopher(null)
  → setThinkingName(next)       — thinking GIF starts
  → await sleep(THINKING_DELAY_MS)
  → setThinkingName(null)
  → setCurrentPhilosopher(next) — speaking GIF starts / audio plays
```

### Target turn lifecycle (after all 4 features)
```
[previous audio, at t = duration - overlapDuration]
  → setThinkingName(next)              — thinking GIF pre-starts mid-audio

[previous audio ends]
  → setCurrentPhilosopher(null)
  → await sleep(answerDelay)           — dead-air gap, philosopher still thinking

[answerDelay expires]
  → setThinkingName(null)
  → setCurrentPhilosopher(next)        — speaking GIF starts
```

Where: `overlapDuration = thinkingTime − answerDelay`

### Feature 4 look-ahead strategy
The prefetch already fetches `nextData` **during** current audio playback. When it resolves we have `nextData.rag_relevance` for the upcoming philosopher. We hook into this callback to:
1. Compute their `thinkingTime` and `answerDelay`.
2. Compute `overlapDuration = thinkingTime − answerDelay`.
3. In **subtitle mode**: call `waitForAudioTime(audio, audio.duration - overlapDuration, signal)`, then `setThinkingName(nextData.philosopher)`.
4. Store `pendingAnswerDelayRef.current = answerDelay` so that `processPhilosopherTurn` for the next turn knows thinking is already running and only needs to sleep the dead-air portion.

In **typewriter mode** (no known audio duration): when the prefetch resolves while still on the last line, start thinking immediately if `overlapDuration > 0` (the last line serves as a natural proxy for "still speaking").

---

## Step-by-Step Checklist

### Step 1 — Mock Injection (api.ts) COMPLETE

- [ ] **1.1** In `getNextResponse`, directly after `const data = await response.json() as ApiResponse;` (currently [api.ts:141](../src/api.ts#L141)), add a single mock line:
  ```ts
  // MOCK: remove when backend sends rag_relevance natively
  if (data.rag_relevance == null) data.rag_relevance = Math.random() * (1.5 - 0.1) + 0.1;
  ```
  This attaches a random distance to every response that doesn't already have one. Removing the two-line block later is the only change needed when the backend provides real values.

- [ ] **1.2** Verify the existing `console.log('[rag]', data.philosopher, 'distance:', data.rag_relevance ?? 'null (no RAG)')` at [useDebate.ts:294](../src/hooks/useDebate.ts#L294) now always prints a number (not `null`) during testing.

---

### Step 2 — Distance Utility Functions (new file) COMPLETE

- [ ] **2.1** Create `src/utils/distanceUtils.ts` with two pure functions:

  ```ts
  /** Thinking duration in ms based on distance [0.1, 1.5]. */
  export function computeThinkingTime(distance: number): number {
    if (distance <= 0.5) return 1000;
    return 1000 + ((distance - 0.5) / 1.0) * 4000; // 1000→5000 ms over [0.5, 1.5]
  }

  /** Dead-air answer delay in ms based on distance [0.1, 1.5]. */
  export function computeAnswerDelay(distance: number): number {
    if (distance <= 0.8) return 500;
    return 500 + ((distance - 0.8) / 0.7) * 2500; // 500→3000 ms over [0.8, 1.5]
  }
  ```

- [ ] **2.2** Write a small unit test in `src/__tests__/distanceUtils.test.ts` checking boundary values:
  - `computeThinkingTime(0.1)` → 1000
  - `computeThinkingTime(0.5)` → 1000
  - `computeThinkingTime(1.0)` → 3000
  - `computeThinkingTime(1.5)` → 5000
  - `computeAnswerDelay(0.1)` → 500
  - `computeAnswerDelay(0.8)` → 500
  - `computeAnswerDelay(1.15)` → ~1750
  - `computeAnswerDelay(1.5)` → 3000

---

### Step 3 — Feature 1: Distance GIF (ImageGrid.tsx) COMPLETE

- [ ] **3.1** In the `imageSet === 1` speaking branch of `ImageGrid.tsx` ([ImageGrid.tsx:76](../src/components/ImageGrid.tsx#L76)), change:
  ```ts
  imgSrc = `/images/${config.filePrefix}${imageSet}.gif`;
  ```
  to:
  ```ts
  const dist = ragRelevanceMap[baseName];
  const useDistanceGif = dist != null && dist <= 0.5;
  imgSrc = useDistanceGif
    ? `/images/${config.filePrefix}1_distorted.gif`
    : `/images/${config.filePrefix}${imageSet}.gif`;
  ```
  The `ragRelevanceMap` prop is already received by `ImageGrid` — no prop changes needed.

- [ ] **3.2** Confirm that the four `[prefix]1_distorted.gif` files exist in `public/images/` (one per philosopher). These will need to be created/placed; plan accordingly.

---

### Step 4 — Feature 2: Dynamic Thinking Time (useDebate.ts) COMPLETE

- [x] **4.1** Import `computeThinkingTime` from `../utils/distanceUtils` in `useDebate.ts`.

- [x] **4.2** In `processPhilosopherTurn`, replaced `setTimeout(res, THINKING_DELAY_MS)` with:
  ```ts
  const thinkingMs = computeThinkingTime(data.rag_relevance ?? 1.5);
  const t = setTimeout(res, thinkingMs);
  ```
  A null distance defaults to `1.5` (maximum thinking time — safest default when relevance is unknown).

- [x] **4.3** `THINKING_DELAY_MS` import removed from `useDebate.ts` (no longer referenced). Constant remains in `constants.ts` untouched.

---

### Step 5 — Feature 3: Dynamic Answer Delay (useDebate.ts) COMPLETE

Features 3 and 4 are implemented together since they share the same timing ref infrastructure.

- [ ] **5.1** Add a new ref at the top of `useDebate`:
  ```ts
  // When set, the next processPhilosopherTurn should skip re-starting thinking
  // (it was pre-started during the previous audio) and only sleep this dead-air duration.
  const pendingAnswerDelayRef = useRef<number | null>(null);
  ```

- [ ] **5.2** Import `computeAnswerDelay` from `../utils/distanceUtils`.

- [ ] **5.3** In `processPhilosopherTurn`, in the philosopher-change block (the `else` branch for non-interruption, [useDebate.ts:268](../src/hooks/useDebate.ts#L268)):

  Replace the current logic:
  ```ts
  setThinkingName(data.philosopher);
  await new Promise<void>((res) => {
    const t = setTimeout(res, THINKING_DELAY_MS);
    ...
  });
  setThinkingName(null);
  ```

  With the new logic that checks whether thinking was pre-started by Feature 4:
  ```ts
  const answerDelayMs = pendingAnswerDelayRef.current ?? computeAnswerDelay(data.rag_relevance ?? 1.5);
  pendingAnswerDelayRef.current = null;

  const thinkingWasPreStarted = /* set by Feature 4 — see Step 6 */ thinkingPreStartedRef.current;
  thinkingPreStartedRef.current = false;

  if (!thinkingWasPreStarted) {
    // Normal path: thinking was not pre-started, show thinking GIF for full thinkingTime
    const thinkingMs = computeThinkingTime(data.rag_relevance ?? 1.5);
    setThinkingName(data.philosopher);
    await new Promise<void>((res) => {
      const t = setTimeout(res, thinkingMs);
      signal.addEventListener('abort', () => { clearTimeout(t); res(); }, { once: true });
    });
  } else {
    // Overlap path: thinking GIF was already started during previous audio.
    // Only sleep the dead-air answer delay portion.
    setThinkingName(data.philosopher); // ensure it's still set (may have been cleared on abort)
    await new Promise<void>((res) => {
      const t = setTimeout(res, answerDelayMs);
      signal.addEventListener('abort', () => { clearTimeout(t); res(); }, { once: true });
    });
  }

  if (signal.aborted) return;
  setThinkingName(null);
  ```

---

### Step 6 — Feature 4: Overlapping Thinking State (useDebate.ts) COMPLETE 

- [ ] **6.1** Add a second ref alongside `pendingAnswerDelayRef`:
  ```ts
  const thinkingPreStartedRef = useRef<boolean>(false);
  ```

- [ ] **6.2** Reset both refs in `startDebate` and `resetForNewQuestion` alongside `prefetchPromiseRef.current = null`:
  ```ts
  pendingAnswerDelayRef.current = null;
  thinkingPreStartedRef.current = false;
  ```

- [ ] **6.3** In `processSubtitleTurn`, inside the prefetch `.then()` callback ([useDebate.ts:358](../src/hooks/useDebate.ts#L358)), after the interruption-handling block, add the overlap pre-start logic:
  ```ts
  // Feature 4: pre-start thinking for next philosopher during current audio
  if (
    nextData &&
    nextData.turn_type !== 'interruption' &&
    nextData.philosopher !== data.philosopher &&
    nextData.philosopher !== 'SYSTEM'
  ) {
    const dist = nextData.rag_relevance ?? 1.5;
    const thinkingMs = computeThinkingTime(dist);
    const delayMs = computeAnswerDelay(dist);
    const overlapMs = thinkingMs - delayMs;

    if (overlapMs > 0) {
      const audioDuration = audio.duration; // available once audio metadata loads
      const overlapStartTime = audioDuration - overlapMs / 1000; // convert ms → seconds

      const doPreStartThinking = () => {
        if (signal.aborted) return;
        thinkingPreStartedRef.current = true;
        pendingAnswerDelayRef.current = delayMs;
        setThinkingName(nextData.philosopher);
      };

      if (!isNaN(audioDuration) && overlapStartTime > audio.currentTime) {
        void waitForAudioTime(audio, overlapStartTime, signal).then(doPreStartThinking);
      } else {
        // Audio too short or metadata not yet loaded — trigger immediately
        doPreStartThinking();
      }
    }
  }
  return nextData;
  ```

- [ ] **6.4** In `processTypewriterTurn`, inside the prefetch `.then()` callback on the last line ([useDebate.ts:465](../src/hooks/useDebate.ts#L465)), after the interruption block, add the typewriter-mode overlap:
  ```ts
  // Feature 4 (typewriter): start thinking immediately since we are already
  // on the last line — a rough proxy for "current speaker is nearly done".
  if (
    nextData &&
    nextData.turn_type !== 'interruption' &&
    nextData.philosopher !== data.philosopher &&
    nextData.philosopher !== 'SYSTEM'
  ) {
    const dist = nextData.rag_relevance ?? 1.5;
    const thinkingMs = computeThinkingTime(dist);
    const delayMs = computeAnswerDelay(dist);
    const overlapMs = thinkingMs - delayMs;

    if (overlapMs > 0 && !signal.aborted) {
      thinkingPreStartedRef.current = true;
      pendingAnswerDelayRef.current = delayMs;
      setThinkingName(nextData.philosopher);
    }
  }
  return nextData;
  ```

- [ ] **6.5** In `triggerHardReset` and `startDebate`, clear both new refs to avoid stale state leaking across sessions.

---

### Step 7 — Cleanup & Edge Cases COMPLETE

- [ ] **7.1** Ensure `pendingAnswerDelayRef` and `thinkingPreStartedRef` are cleared inside `sendLiveInstruction` (alongside `prefetchPromiseRef.current = null` at [useDebate.ts:214](../src/hooks/useDebate.ts#L214)) — a live instruction discards the prefetched turn, so the pre-started thinking state is also invalid.

- [ ] **7.2** Verify that `overlapDuration` is always non-negative. Since `thinkingTime >= 1000` and `answerDelay <= 3000`, and at `distance=1.5` thinkingTime=5000 and answerDelay=3000, the minimum overlap is 2000ms at max distance. At min distance (0.1) thinkingTime=1000 and answerDelay=500 → overlap=500ms. This is always positive — no clamping needed.

- [ ] **7.3** Interruption turns must bypass all of this: the `turn_type === 'interruption'` check in both prefetch callbacks already guards them. Double-check that `thinkingPreStartedRef` and `pendingAnswerDelayRef` are NOT set for interruption turns.

- [ ] **7.4** When the debate ends (`is_last === true`), the prefetch may have pre-started thinking for a philosopher who never speaks. Clear `thinkingName` in the `is_last` cleanup path (already done in `startPassiveLoop` [useDebate.ts:717](../src/hooks/useDebate.ts#L717) and `runDebateLoop` [useDebate.ts:547](../src/hooks/useDebate.ts#L547)).

- [ ] **7.5** Validate that `audio.duration` is available when the overlap `waitForAudioTime` is scheduled in Step 6.3. If not (e.g. metadata not yet loaded), attach an `onloadedmetadata` handler or fall back to triggering immediately.

---

### Step 8 — Manual Smoke Test

- [ ] **8.1** Run the app with mock injection active. Console should show distances in `[rag]` lines for every turn.
- [ ] **8.2** Switch to image set 1. Force a low distance (set mock to always return 0.3) — confirm `[prefix]1_distorted.gif` is rendered while speaking.
- [ ] **8.3** Force a high distance (mock always 1.5) — confirm standard `[prefix]1.gif` is rendered.
- [ ] **8.4** Log `thinkingMs` and `answerDelayMs` to console in `processPhilosopherTurn`. With distance 1.5, verify thinking=5000ms and dead-air=3000ms.
- [ ] **8.5** Check Feature 4 overlap: with distance 1.5, the next philosopher's thinking GIF should appear ~2s before the current audio ends (5000−3000=2000ms overlap).

---

## File Change Summary

| File | Change |
|---|---|
| `src/api.ts` | +2 lines: mock injection in `getNextResponse` |
| `src/utils/distanceUtils.ts` | **New file**: `computeThinkingTime`, `computeAnswerDelay` |
| `src/__tests__/distanceUtils.test.ts` | **New file**: unit tests for boundary values |
| `src/components/ImageGrid.tsx` | ~5 lines: distance GIF conditional in set-1 speaking branch |
| `src/hooks/useDebate.ts` | ~50 lines: 2 new refs, dynamic timing in `processPhilosopherTurn`, overlap pre-start in both prefetch callbacks, ref cleanup in reset functions |
| `src/constants.ts` | No change (keep `THINKING_DELAY_MS` as unused fallback, or delete if preferred) |

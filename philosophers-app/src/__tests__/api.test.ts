import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { submitQuestion, getNextResponse, fetchPhilosophers, clearQuestion } from '../api';

const BASE_RESPONSE = { philosopher: 'Flusser', text: 'Hello.', is_last: true };

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  });
}

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch(200, BASE_RESPONSE));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('fetchPhilosophers', () => {
  it('returns parsed JSON on success', async () => {
    vi.stubGlobal('fetch', mockFetch(200, ['Flusser', 'Weizenbaum']));
    const result = await fetchPhilosophers();
    expect(result).toEqual(['Flusser', 'Weizenbaum']);
  });

  it('returns null on non-200', async () => {
    vi.stubGlobal('fetch', mockFetch(500, null));
    const result = await fetchPhilosophers();
    expect(result).toBeNull();
  });
});

describe('submitQuestion', () => {
  it('returns true on 200', async () => {
    vi.stubGlobal('fetch', mockFetch(200, {}));
    expect(await submitQuestion('What is time?')).toBe(true);
  });

  it('returns false on 400', async () => {
    vi.stubGlobal('fetch', mockFetch(400, {}));
    expect(await submitQuestion('Bad question')).toBe(false);
  });

  it('returns false on network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));
    expect(await submitQuestion('question')).toBe(false);
  });
});

describe('getNextResponse', () => {
  it('returns parsed and validated ApiResponse on success', async () => {
    vi.stubGlobal('fetch', mockFetch(200, BASE_RESPONSE));
    const result = await getNextResponse();
    expect(result).toMatchObject(BASE_RESPONSE);
  });

  it('returns null on network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const result = await getNextResponse();
    expect(result).toBeNull();
  });

  it('returns null when response is missing required fields', async () => {
    vi.stubGlobal('fetch', mockFetch(200, { is_last: true }));
    const result = await getNextResponse();
    expect(result).toBeNull();
  });
});

describe('clearQuestion', () => {
  it('calls the DELETE endpoint', async () => {
    const spy = mockFetch(200, {});
    vi.stubGlobal('fetch', spy);
    await clearQuestion();
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('question'),
      expect.objectContaining({ method: 'DELETE' }),
    );
  });
});

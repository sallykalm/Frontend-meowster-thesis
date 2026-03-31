import { BASE_URL } from './constants';

export interface ApiResponse {
  philosopher: string;
  text: string;
  is_last: boolean;
}

export async function fetchPhilosophers() {
  try {
    await fetch(`${BASE_URL}philosophers`);
  } catch (error) {
    console.error("Error fetching philosophers:", error);
  }
}

export async function submitQuestion(text: string) {
  try {
    const response = await fetch(`${BASE_URL}question`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
    return response.ok;
  } catch (error) {
    console.error("Error submitting question:", error);
    return false;
  }
}

export async function getNextResponse(): Promise<ApiResponse | null> {
  try {
    const response = await fetch(`${BASE_URL}next-response`);
    if (response.status === 504) {
      // Still waiting for backend, return null to signal retry
      return null;
    }
    if (!response.ok) {
      return null;
    }
    return await response.json();
  } catch (error) {
    console.error("Error getting next response:", error);
    return null;
  }
}

export async function clearQuestion() {
  try {
    await fetch(`${BASE_URL}question`, { method: 'DELETE' });
  } catch (error) {
    console.error("Error clearing question:", error);
  }
}

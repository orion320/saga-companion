/**
 * Saga Bridge API client.
 *
 * All capture requests include the token in the Authorization header.
 * Security features don't use this module — they're standalone.
 */

import { getToken, invalidateStatusCache } from './token.js';

const DEFAULT_SAGA_URL = 'http://127.0.0.1:8420';

/** Get the saga_bridge base URL. */
export async function getSagaUrl() {
  const result = await chrome.storage.local.get('saga_url');
  return result.saga_url || DEFAULT_SAGA_URL;
}

/**
 * Send a capture to Saga.
 *
 * @param {object} capture - Capture payload
 * @param {string} capture.source - Source domain
 * @param {string} capture.url - Page URL
 * @param {string} [capture.title] - Page title
 * @param {string} capture.capture_type - 'selection' | 'page' | 'screenshot' | 'recording' | 'full_conversation' | 'last_response'
 * @param {string} [capture.content] - Text content
 * @param {object[]} [capture.messages] - Structured messages (for AI chat extraction)
 * @param {string} [capture.screenshot] - Base64 WebP image data
 * @param {Blob} [capture.recording] - Video/audio blob
 * @param {object} [destination] - Where to route (defaults to captures folder)
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export async function sendCapture(capture, destination) {
  const sagaUrl = await getSagaUrl();
  const token = await getToken();

  if (!token) {
    return { success: false, error: 'No token — open Saga to generate one' };
  }

  const payload = {
    capture: {
      ...capture,
      captured_at: new Date().toISOString(),
    },
    destination: destination || { type: 'captures' },
  };

  try {
    const res = await fetch(`${sagaUrl}/api/capture`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    if (res.status === 401) {
      invalidateStatusCache();
      return { success: false, error: 'Token expired — open Saga to renew' };
    }

    if (!res.ok) {
      return { success: false, error: `Saga returned ${res.status}` };
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: 'Could not reach Saga' };
  }
}

/**
 * Check if Saga is reachable (for connection status indicator).
 * Does NOT require a token — just pings the server.
 */
export async function isSagaReachable() {
  const sagaUrl = await getSagaUrl();
  try {
    const res = await fetch(`${sagaUrl}/api/settings`, {
      method: 'HEAD',
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

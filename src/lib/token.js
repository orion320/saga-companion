/**
 * Token management for Saga connection.
 *
 * Capture features (outbound data) require a valid token.
 * Security features (inbound alerts) never require a token.
 *
 * Token is generated in Saga's settings with a user-selected TTL.
 * Stored in extension storage. Validated by saga_bridge on every
 * capture request via Authorization header.
 */

const STORAGE_KEY = 'saga_companion_token';
const STATUS_CACHE_TTL = 60_000; // re-validate every 60s

let cachedStatus = null;
let cachedAt = 0;

/** @returns {Promise<string | null>} */
export async function getToken() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return result[STORAGE_KEY] || null;
}

/** @param {string} token */
export async function setToken(token) {
  await chrome.storage.local.set({ [STORAGE_KEY]: token });
  cachedStatus = null; // invalidate cache
}

export async function clearToken() {
  await chrome.storage.local.remove(STORAGE_KEY);
  cachedStatus = null;
}

/**
 * Check if the current token is valid against saga_bridge.
 * Caches the result briefly to avoid hammering the server.
 *
 * @param {string} sagaUrl - Base URL of saga_bridge (e.g. http://127.0.0.1:8420)
 * @returns {Promise<{ valid: boolean, expiresAt: string | null, error: string | null }>}
 */
export async function checkTokenStatus(sagaUrl) {
  if (cachedStatus && Date.now() - cachedAt < STATUS_CACHE_TTL) {
    return cachedStatus;
  }

  const token = await getToken();
  if (!token) {
    return { valid: false, expiresAt: null, error: null };
  }

  try {
    const res = await fetch(`${sagaUrl}/api/extension/token/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      cachedStatus = { valid: false, expiresAt: null, error: `HTTP ${res.status}` };
      cachedAt = Date.now();
      return cachedStatus;
    }

    const data = await res.json();
    cachedStatus = {
      valid: data.valid === true,
      expiresAt: data.expires_at || null,
      error: null,
    };
    cachedAt = Date.now();
    return cachedStatus;
  } catch (err) {
    return { valid: false, expiresAt: null, error: 'Saga not reachable' };
  }
}

/** Invalidate the cached status (e.g. after a capture fails with 401). */
export function invalidateStatusCache() {
  cachedStatus = null;
  cachedAt = 0;
}

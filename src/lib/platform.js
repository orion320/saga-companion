/**
 * Platform detection and capability checks.
 *
 * The extension runs on Chrome, Firefox, and Safari. Each has different
 * APIs available. This module exposes capability booleans so the rest of
 * the codebase never checks browser names — only capabilities.
 */

/** @returns {'chrome' | 'firefox' | 'safari'} */
export function detectBrowser() {
  if (typeof browser !== 'undefined' && browser.runtime?.getBrowserInfo) {
    return 'firefox';
  }
  if (navigator.userAgent.includes('Safari') && !navigator.userAgent.includes('Chrome')) {
    return 'safari';
  }
  return 'chrome';
}

export const BROWSER = detectBrowser();

/** Chrome sidePanel API. */
export const HAS_SIDE_PANEL = typeof chrome?.sidePanel !== 'undefined';

/** Firefox sidebar_action API. */
export const HAS_SIDEBAR = typeof browser?.sidebarAction !== 'undefined';

/** Tab capture for screen recording (Chrome only). */
export const HAS_TAB_CAPTURE = typeof chrome?.tabCapture !== 'undefined';

/** Offscreen documents for media processing (Chrome only). */
export const HAS_OFFSCREEN = typeof chrome?.offscreen !== 'undefined';

/** Native messaging to companion app (Chrome + Firefox). */
export const HAS_NATIVE_MESSAGING = typeof chrome?.runtime?.connectNative !== 'undefined' ||
  typeof browser?.runtime?.connectNative !== 'undefined';

/** Tab screenshot — works on all browsers. */
export const HAS_SCREENSHOT = true;

/**
 * Whether running inside Saga's CEF shell (auto-loaded extension).
 * CEF injects a random nonce into `data-saga-cef-nonce` on the document
 * element. The nonce is required in the `X-Saga-CEF` header for auth bypass.
 */
export function isInsideCEF() {
  try {
    return Boolean(document.documentElement.dataset.sagaCefNonce);
  } catch {
    return false;
  }
}

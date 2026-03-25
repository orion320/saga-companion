/**
 * Tracker Observation — Content Script
 *
 * MV3 requires request observation to live in the service worker. This script
 * keeps the worker synced with in-page navigation state, including SPA URL
 * changes, and exposes the latest summary back onto the page context.
 */

let lastUrl = '';

function currentContext() {
  return {
    url: window.location.href,
    title: document.title,
    hostname: window.location.hostname,
  };
}

function publishSummary(summary) {
  const root = document.documentElement;
  root.dataset.sagaTrackerCount = String(summary?.totalObserved || 0);
  root.dataset.sagaTrackerVendors = (summary?.topVendors || []).map((item) => item.vendor).join(',');
  window.dispatchEvent(new CustomEvent('saga:tracker-summary', { detail: summary || null }));
}

function reportContext(force = false) {
  const next = currentContext();
  if (!force && next.url === lastUrl) {
    return;
  }

  lastUrl = next.url;
  chrome.runtime.sendMessage({
    action: 'tracker-page-context',
    context: next,
  }).then((response) => {
    if (response?.summary) {
      publishSummary(response.summary);
    }
  }).catch(() => {});
}

function hookHistoryMethod(methodName) {
  const original = history[methodName];
  if (typeof original !== 'function') {
    return;
  }

  history[methodName] = function patchedHistoryMethod(...args) {
    const result = original.apply(this, args);
    queueMicrotask(() => reportContext());
    return result;
  };
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'tracker-summary-updated' || message.action === 'tracker-summary') {
    publishSummary(message.summary || null);
  }
});

hookHistoryMethod('pushState');
hookHistoryMethod('replaceState');

window.addEventListener('popstate', () => reportContext());
window.addEventListener('hashchange', () => reportContext());
window.addEventListener('pageshow', () => reportContext(true));

if (document.readyState === 'complete') {
  reportContext(true);
} else {
  window.addEventListener('load', () => reportContext(true), { once: true });
}

/**
 * Saga Companion — Service Worker
 *
 * Owns the authenticated Saga upload flow and the MV3-only tracker observation
 * path. Content scripts gather page context and annotation input, then the
 * worker routes captures and tracker summaries to the side panel.
 */

import { sendCapture } from '../lib/api.js';
import { HAS_SIDE_PANEL } from '../lib/platform.js';
import { classifyTrackerRequest, extractHostname } from '../lib/tracker-lists.js';

const RECENT_CAPTURES_KEY = 'recent_captures';
const TRACKER_SUMMARIES_KEY = 'tracker_summaries_v1';
const MAX_RECENT_CAPTURES = 12;
const MAX_RECENT_TRACKERS = 10;
const MAX_UNIQUE_HOSTS = 200;

const trackerSummaries = new Map();
const pageContexts = new Map();
let trackerPersistTimer = null;
let trackerLoadPromise = null;

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'saga-send-selection',
      title: 'Send to Saga Captures',
      contexts: ['selection'],
    });

    chrome.contextMenus.create({
      id: 'saga-capture-page',
      title: 'Capture this page',
      contexts: ['page'],
    });

    chrome.contextMenus.create({
      id: 'saga-screenshot',
      title: 'Screenshot with annotation',
      contexts: ['page', 'image', 'video'],
    });
  });

  if (HAS_SIDE_PANEL) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  }
});

void ensureTrackerStateLoaded();

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) {
    return;
  }

  switch (info.menuItemId) {
    case 'saga-send-selection':
      await chrome.tabs.sendMessage(tab.id, {
        action: 'capture-selection',
        text: info.selectionText,
      }).catch(() => {});
      break;

    case 'saga-capture-page':
      await chrome.tabs.sendMessage(tab.id, {
        action: 'capture-page',
      }).catch(() => {});
      break;

    case 'saga-screenshot':
      await captureScreenshot(tab);
      break;

    default:
      break;
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  trackerSummaries.delete(tabId);
  pageContexts.delete(tabId);
  scheduleTrackerPersist();
});

chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    void observeTrackerRequest(details);
  },
  { urls: ['<all_urls>'] },
);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case 'capture-screenshot':
      getActiveTab()
        .then((tab) => {
          if (!tab) {
            return { success: false, error: 'No active tab available' };
          }
          return captureScreenshot(tab);
        })
        .then(sendResponse);
      return true;

    case 'send-capture':
      handleSendCapture(message.capture, message.destination, {
        cefNonce: message.cefNonce || null,
      }).then(sendResponse);
      return true;

    case 'get-recent-captures':
      getRecentCapturesReturn().then((captures) => sendResponse({ captures }));
      return true;

    case 'tracker-page-context':
      handleTrackerPageContext(sender.tab?.id ?? null, message.context)
        .then((summary) => sendResponse({ success: true, summary }))
        .catch((error) => sendResponse({ success: false, error: error?.message || 'Tracker context update failed' }));
      return true;

    case 'get-active-tab-summary':
      getActiveTabSummary().then(sendResponse);
      return true;

    case 'get-tracker-summary':
      getTrackerSummary(message.tabId).then((summary) => sendResponse({ summary }));
      return true;

    case 'security-finding':
      forwardToSidePanel(message);
      sendResponse({ success: true });
      return false;

    default:
      return false;
  }
});

async function captureScreenshot(tab) {
  try {
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
      format: 'png',
    });

    await chrome.tabs.sendMessage(tab.id, {
      action: 'show-annotation-overlay',
      screenshot: dataUrl,
      url: tab.url,
      title: tab.title,
    });

    return { success: true };
  } catch (error) {
    console.error('Saga Companion screenshot capture failed', error);
    return { success: false, error: 'Screenshot capture failed on this page' };
  }
}

async function handleSendCapture(capture, destination, options = {}) {
  if (!capture || typeof capture !== 'object') {
    return { success: false, error: 'Missing capture payload' };
  }

  const capturedAt = new Date().toISOString();
  const normalizedCapture = {
    ...capture,
    title: capture.title || 'Untitled capture',
    source: capture.source || extractHostname(capture.url || '') || 'unknown',
    captured_at: capture.captured_at || capturedAt,
  };

  const result = await sendCapture(
    normalizedCapture,
    normalizeDestination(destination),
    { cefNonce: options.cefNonce || null },
  );

  if (result.success) {
    const recentEntry = {
      title: normalizedCapture.title,
      source: normalizedCapture.source,
      url: normalizedCapture.url,
      capture_type: normalizedCapture.capture_type,
      captured_at: normalizedCapture.captured_at,
    };
    await addRecentCapture(recentEntry);
    forwardToSidePanel({
      action: 'capture-complete',
      capture: recentEntry,
    });
  }

  return result;
}

function normalizeDestination(destination) {
  if (destination && typeof destination === 'object' && destination.type) {
    return destination;
  }
  return { type: 'captures' };
}

async function handleTrackerPageContext(tabId, context) {
  if (!tabId || !context?.url) {
    return null;
  }

  await ensureTrackerStateLoaded();

  const nextContext = {
    url: context.url,
    title: context.title || '',
    hostname: context.hostname || extractHostname(context.url),
  };
  const previous = pageContexts.get(tabId);
  pageContexts.set(tabId, nextContext);

  let summary = trackerSummaries.get(tabId);
  if (!summary || previous?.url !== nextContext.url) {
    summary = createTrackerSummary(tabId, nextContext);
  } else {
    summary = {
      ...summary,
      url: nextContext.url,
      title: nextContext.title,
      pageHost: nextContext.hostname,
      updatedAt: new Date().toISOString(),
    };
  }

  trackerSummaries.set(tabId, summary);
  scheduleTrackerPersist();
  notifyTrackerSummary(tabId, summary);
  return cloneTrackerSummary(summary);
}

async function observeTrackerRequest(details) {
  if (!details || details.tabId < 0 || details.url.startsWith('http://127.0.0.1:')) {
    return;
  }

  await ensureTrackerStateLoaded();

  const tabId = details.tabId;
  const context = pageContexts.get(tabId) || {};
  const classification = classifyTrackerRequest({
    requestUrl: details.url,
    tabUrl: context.url || '',
    initiator: details.initiator,
  });

  if (!classification) {
    return;
  }

  const baseSummary = trackerSummaries.get(tabId) || createTrackerSummary(tabId, context);
  const vendorCounts = { ...(baseSummary.vendorCounts || {}) };
  vendorCounts[classification.vendor] = (vendorCounts[classification.vendor] || 0) + 1;

  const uniqueHosts = baseSummary.uniqueHosts?.includes(classification.requestHost)
    ? baseSummary.uniqueHosts
    : [...(baseSummary.uniqueHosts || []), classification.requestHost].slice(0, MAX_UNIQUE_HOSTS);

  const recentTrackers = [
    {
      vendor: classification.vendor,
      host: classification.requestHost,
      category: classification.category,
      seenAt: new Date().toISOString(),
    },
    ...(baseSummary.recentTrackers || []),
  ].slice(0, MAX_RECENT_TRACKERS);

  const summary = {
    ...baseSummary,
    url: context.url || baseSummary.url,
    title: context.title || baseSummary.title,
    pageHost: context.hostname || baseSummary.pageHost || extractHostname(details.initiator || ''),
    totalObserved: (baseSummary.totalObserved || 0) + 1,
    vendorCounts,
    uniqueHosts,
    recentTrackers,
    updatedAt: new Date().toISOString(),
  };

  trackerSummaries.set(tabId, summary);
  scheduleTrackerPersist();
  notifyTrackerSummary(tabId, summary);
}

function createTrackerSummary(tabId, context = {}) {
  return {
    tabId,
    url: context.url || '',
    title: context.title || '',
    pageHost: context.hostname || extractHostname(context.url || ''),
    totalObserved: 0,
    vendorCounts: {},
    uniqueHosts: [],
    recentTrackers: [],
    updatedAt: new Date().toISOString(),
  };
}

function topVendors(summary) {
  return Object.entries(summary.vendorCounts || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([vendor, count]) => ({ vendor, count }));
}

function cloneTrackerSummary(summary) {
  if (!summary) {
    return null;
  }

  return {
    ...summary,
    vendorCounts: { ...(summary.vendorCounts || {}) },
    uniqueHosts: [...(summary.uniqueHosts || [])],
    recentTrackers: [...(summary.recentTrackers || [])],
    topVendors: topVendors(summary),
  };
}

function notifyTrackerSummary(tabId, summary) {
  const payload = cloneTrackerSummary(summary);
  forwardToSidePanel({
    action: 'tracker-summary-updated',
    tabId,
    summary: payload,
  });

  chrome.tabs.sendMessage(tabId, {
    action: 'tracker-summary-updated',
    summary: payload,
  }).catch(() => {});
}

function scheduleTrackerPersist() {
  if (trackerPersistTimer !== null) {
    clearTimeout(trackerPersistTimer);
  }

  trackerPersistTimer = setTimeout(() => {
    trackerPersistTimer = null;
    void persistTrackerSummaries();
  }, 250);
}

async function persistTrackerSummaries() {
  const storage = getExtensionStorage();
  const plain = Object.fromEntries(
    [...trackerSummaries.entries()].map(([tabId, summary]) => [String(tabId), summary]),
  );
  await storage.set({ [TRACKER_SUMMARIES_KEY]: plain });
}

async function ensureTrackerStateLoaded() {
  if (!trackerLoadPromise) {
    trackerLoadPromise = (async () => {
      const storage = getExtensionStorage();
      const result = await storage.get(TRACKER_SUMMARIES_KEY);
      const summaries = result[TRACKER_SUMMARIES_KEY] || {};
      for (const [tabId, summary] of Object.entries(summaries)) {
        trackerSummaries.set(Number(tabId), summary);
      }
    })().catch(() => {
      trackerLoadPromise = null;
    });
  }

  await trackerLoadPromise;
}

async function getActiveTabSummary() {
  const tab = await getActiveTab();
  if (!tab?.id) {
    return { summary: null };
  }

  return { summary: await getTrackerSummary(tab.id) };
}

async function getTrackerSummary(tabId) {
  await ensureTrackerStateLoaded();
  const numericTabId = Number(tabId);
  const summary = trackerSummaries.get(numericTabId);
  if (summary) {
    return cloneTrackerSummary(summary);
  }

  const context = pageContexts.get(numericTabId);
  return context ? cloneTrackerSummary(createTrackerSummary(numericTabId, context)) : null;
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0] || null;
}

async function addRecentCapture(capture) {
  const storage = getExtensionStorage();
  const current = await getRecentCapturesReturn();
  const next = [capture, ...current].slice(0, MAX_RECENT_CAPTURES);
  await storage.set({ [RECENT_CAPTURES_KEY]: next });
}

async function getRecentCapturesReturn() {
  const storage = getExtensionStorage();
  const result = await storage.get(RECENT_CAPTURES_KEY);
  const captures = result[RECENT_CAPTURES_KEY];
  return Array.isArray(captures) ? captures : [];
}

function getExtensionStorage() {
  return chrome.storage.session || chrome.storage.local;
}

function forwardToSidePanel(message) {
  chrome.runtime.sendMessage(message).catch(() => {});
}

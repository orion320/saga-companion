/**
 * Saga Companion — Service Worker (background script)
 *
 * Responsibilities:
 * 1. Context menu registration (right-click capture actions)
 * 2. Message relay between content scripts and side panel
 * 3. Token validation on startup and periodic check
 * 4. Screenshot capture (chrome.tabs.captureVisibleTab)
 * 5. Side panel open/close management
 */

import { HAS_SIDE_PANEL } from '../lib/platform.js';

// ── Context Menus ───────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
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

  // Open side panel on action click
  if (HAS_SIDE_PANEL) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  }
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;

  switch (info.menuItemId) {
    case 'saga-send-selection':
      chrome.tabs.sendMessage(tab.id, {
        action: 'capture-selection',
        text: info.selectionText,
      });
      break;

    case 'saga-capture-page':
      chrome.tabs.sendMessage(tab.id, {
        action: 'capture-page',
      });
      break;

    case 'saga-screenshot':
      await captureScreenshot(tab);
      break;
  }
});

// ── Screenshot Capture ──────────────────────────────────────

async function captureScreenshot(tab) {
  try {
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
      format: 'png',
    });

    // Send to content script to show annotation overlay
    chrome.tabs.sendMessage(tab.id, {
      action: 'show-annotation-overlay',
      screenshot: dataUrl,
      url: tab.url,
      title: tab.title,
    });
  } catch (err) {
    console.error('Screenshot capture failed:', err);
  }
}

// ── Message Relay ───────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case 'capture-screenshot':
      // Content script requests a screenshot (e.g. from side panel button)
      chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
        if (tabs[0]) {
          await captureScreenshot(tabs[0]);
          sendResponse({ success: true });
        }
      });
      return true; // async response

    case 'send-annotated-screenshot':
      // Annotation overlay completed — forward to side panel for routing
      forwardToSidePanel(message);
      sendResponse({ success: true });
      break;

    case 'capture-complete':
      // A capture was sent to Saga — notify side panel to refresh recent list
      forwardToSidePanel({ action: 'refresh-recent' });
      break;

    default:
      break;
  }
});

function forwardToSidePanel(message) {
  chrome.runtime.sendMessage(message).catch(() => {
    // Side panel might not be open — that's fine
  });
}

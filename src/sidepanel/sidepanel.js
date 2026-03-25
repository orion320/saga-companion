/**
 * Saga Companion — Side Panel Logic
 *
 * Shows connection/token state, current-page security state, and the recent
 * captures acknowledged by the background worker.
 */

import { getSagaUrl, isSagaReachable } from '../lib/api.js';
import { checkTokenStatus, getToken } from '../lib/token.js';

let connected = false;
let tokenValid = false;
let recentCaptures = [];
let currentTrackerSummary = null;
let alertTotal = 0;

const connectionDot = document.querySelector('#connection-status .status-dot');
const connectionLabel = document.getElementById('connection-label');
const tokenRow = document.getElementById('token-status');
const tokenLabel = document.getElementById('token-label');
const tokenExpiry = document.getElementById('token-expiry');
const trackerCount = document.getElementById('tracker-count');
const alertCount = document.getElementById('alert-count');
const captureActions = document.getElementById('capture-actions');
const captureDisabled = document.getElementById('capture-disabled');
const recentList = document.getElementById('recent-captures');
const viewLink = document.getElementById('view-in-saga');
const pageAnalysis = document.getElementById('page-analysis');
const pageDetails = document.getElementById('page-details');

const captureButtons = captureActions.querySelectorAll('.capture-btn');

async function checkConnection() {
  connected = await isSagaReachable();

  connectionDot.className = `status-dot ${connected ? 'connected' : 'disconnected'}`;
  connectionLabel.textContent = connected ? 'Connected to Saga' : 'Saga not running';

  if (connected) {
    const sagaUrl = await getSagaUrl();
    const status = await checkTokenStatus(sagaUrl);
    tokenValid = status.valid;
    tokenRow.style.display = 'flex';

    if (status.valid) {
      const token = await getToken();
      tokenLabel.textContent = `Token: ${maskToken(token)}`;
      tokenExpiry.textContent = status.expiresAt ? `expires ${formatRelative(status.expiresAt)}` : '';
      connectionDot.className = 'status-dot connected';
    } else if (status.error === 'Saga not reachable') {
      tokenRow.style.display = 'none';
    } else {
      tokenLabel.textContent = 'Token expired';
      tokenExpiry.textContent = 'Open Saga to renew';
      connectionDot.className = 'status-dot expired';
    }
  } else {
    tokenRow.style.display = 'none';
    tokenValid = false;
  }

  updateCaptureState();
}

function updateCaptureState() {
  const enabled = connected && tokenValid;
  captureActions.style.display = enabled ? 'grid' : 'none';
  captureDisabled.style.display = enabled ? 'none' : 'block';
  viewLink.style.display = connected ? 'block' : 'none';

  for (const button of captureButtons) {
    button.disabled = !enabled;
  }
}

document.getElementById('btn-screenshot').addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'capture-screenshot' });
});

document.getElementById('btn-record').addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'start-recording' });
});

document.getElementById('btn-text').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    chrome.tabs.sendMessage(tab.id, { action: 'capture-selection' });
  }
});

document.getElementById('btn-page').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    chrome.tabs.sendMessage(tab.id, { action: 'capture-page' });
  }
});

viewLink.addEventListener('click', async (event) => {
  event.preventDefault();
  if (!connected) {
    return;
  }

  const sagaUrl = await getSagaUrl();
  await chrome.tabs.create({ url: sagaUrl });
});

function renderRecent() {
  recentList.textContent = '';

  if (recentCaptures.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No captures yet';
    recentList.appendChild(empty);
    return;
  }

  for (const capture of recentCaptures.slice(0, 8)) {
    const item = document.createElement('div');
    item.className = 'recent-item';

    const info = document.createElement('div');
    info.className = 'recent-item-info';

    const title = document.createElement('div');
    title.className = 'recent-item-title';
    title.textContent = capture.title || 'Untitled capture';

    const meta = document.createElement('div');
    meta.className = 'recent-item-meta';
    meta.textContent = `${capture.source || 'unknown'} · ${formatRelative(capture.captured_at)}`;

    const badge = document.createElement('span');
    badge.className = 'recent-item-badge';
    badge.textContent = capture.capture_type || 'capture';

    info.appendChild(title);
    info.appendChild(meta);
    item.appendChild(info);
    item.appendChild(badge);
    recentList.appendChild(item);
  }
}

function renderTrackerSummary(summary) {
  currentTrackerSummary = summary;

  if (!summary) {
    trackerCount.textContent = 'monitoring';
    pageAnalysis.style.display = 'none';
    return;
  }

  trackerCount.textContent = `${summary.totalObserved || 0} observed`;
  pageAnalysis.style.display = 'block';

  if (!summary.totalObserved) {
    pageDetails.textContent = 'No known third-party trackers observed on this page yet.';
    return;
  }

  const parts = [];
  const uniqueHosts = summary.uniqueHosts?.length || 0;
  const vendors = (summary.topVendors || []).map((item) => item.vendor).join(', ');

  parts.push(`${summary.totalObserved} requests across ${uniqueHosts} tracker domains.`);
  if (vendors) {
    parts.push(`Top vendors: ${vendors}.`);
  }
  if (summary.pageHost) {
    parts.push(`Page: ${summary.pageHost}.`);
  }

  pageDetails.textContent = parts.join(' ');
}

function renderAlerts() {
  alertCount.textContent = `${alertTotal} new`;
  alertCount.style.color = alertTotal > 0 ? '#e74c3c' : '#27ae60';
}

async function refreshRecentCaptures() {
  const response = await chrome.runtime.sendMessage({ action: 'get-recent-captures' });
  recentCaptures = Array.isArray(response?.captures) ? response.captures : [];
  renderRecent();
}

async function refreshTrackerSummary() {
  const response = await chrome.runtime.sendMessage({ action: 'get-active-tab-summary' });
  renderTrackerSummary(response?.summary || null);
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'capture-complete') {
    if (message.capture) {
      recentCaptures = [message.capture, ...recentCaptures].slice(0, 8);
      renderRecent();
    } else {
      void refreshRecentCaptures();
    }
  }

  if (message.action === 'tracker-summary-updated') {
    renderTrackerSummary(message.summary || null);
  }

  if (message.action === 'security-finding') {
    alertTotal += Array.isArray(message.findings) ? message.findings.length : 1;
    renderAlerts();
  }
});

function maskToken(token) {
  if (!token) {
    return '----';
  }
  return `${token.slice(0, 10)}…`;
}

function formatRelative(dateStr) {
  try {
    const date = new Date(dateStr);
    const diff = date.getTime() - Date.now();

    if (diff > 0) {
      const days = Math.floor(diff / 86400000);
      const hours = Math.floor((diff % 86400000) / 3600000);
      if (days > 0) return `in ${days}d`;
      if (hours > 0) return `in ${hours}h`;
      return 'soon';
    }

    const ago = Math.abs(diff);
    const mins = Math.floor(ago / 60000);
    const hours = Math.floor(ago / 3600000);
    const days = Math.floor(ago / 86400000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  } catch {
    return dateStr;
  }
}

renderAlerts();
renderRecent();
void checkConnection();
void refreshRecentCaptures();
void refreshTrackerSummary();

setInterval(() => {
  void checkConnection();
  void refreshTrackerSummary();
}, 30000);

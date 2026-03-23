/**
 * Saga Companion — Side Panel Logic
 *
 * Two-tier UI:
 *   Top:    Configuration — connection status, token, security dashboard
 *   Bottom: Captures — action buttons, recent captures list
 */

import { isSagaReachable } from '../lib/api.js';
import { checkTokenStatus, getToken } from '../lib/token.js';

// ── State ───────────────────────────────────────────────────

let connected = false;
let tokenValid = false;
let recentCaptures = [];

// ── DOM References ──────────────────────────────────────────

const connectionDot = document.querySelector('#connection-status .status-dot');
const connectionLabel = document.getElementById('connection-label');
const tokenRow = document.getElementById('token-status');
const tokenLabel = document.getElementById('token-label');
const tokenExpiry = document.getElementById('token-expiry');
const captureActions = document.getElementById('capture-actions');
const captureDisabled = document.getElementById('capture-disabled');
const recentList = document.getElementById('recent-captures');
const viewLink = document.getElementById('view-in-saga');

const captureButtons = captureActions.querySelectorAll('.capture-btn');

// ── Connection Check ────────────────────────────────────────

async function checkConnection() {
  connected = await isSagaReachable();

  connectionDot.className = `status-dot ${connected ? 'connected' : 'disconnected'}`;
  connectionLabel.textContent = connected ? 'Connected to Saga' : 'Saga not running';

  if (connected) {
    const sagaUrl = 'http://127.0.0.1:8420'; // TODO: make configurable
    const status = await checkTokenStatus(sagaUrl);
    tokenValid = status.valid;

    tokenRow.style.display = 'flex';

    if (status.valid) {
      const token = await getToken();
      tokenLabel.textContent = `Token: ${maskToken(token)}`;
      tokenExpiry.textContent = status.expiresAt
        ? `expires ${formatRelative(status.expiresAt)}`
        : '';
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

// ── Capture State ───────────────────────────────────────────

function updateCaptureState() {
  const enabled = connected && tokenValid;

  captureActions.style.display = enabled ? 'grid' : 'none';
  captureDisabled.style.display = enabled ? 'none' : 'block';
  viewLink.style.display = enabled ? 'block' : 'none';

  for (const btn of captureButtons) {
    btn.disabled = !enabled;
  }
}

// ── Capture Buttons ─────────────────────────────────────────

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

// ── Recent Captures ─────────────────────────────────────────

function renderRecent() {
  recentList.textContent = '';

  if (recentCaptures.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No captures yet';
    recentList.appendChild(empty);
    return;
  }

  for (const cap of recentCaptures.slice(0, 8)) {
    const item = document.createElement('div');
    item.className = 'recent-item';

    const info = document.createElement('div');
    info.className = 'recent-item-info';

    const title = document.createElement('div');
    title.className = 'recent-item-title';
    title.textContent = cap.title || 'Untitled capture';

    const meta = document.createElement('div');
    meta.className = 'recent-item-meta';
    meta.textContent = `${cap.source} \u00B7 ${formatRelative(cap.captured_at)}`;

    info.appendChild(title);
    info.appendChild(meta);

    const badge = document.createElement('span');
    badge.className = 'recent-item-badge';
    badge.textContent = cap.capture_type || 'capture';

    item.appendChild(info);
    item.appendChild(badge);
    recentList.appendChild(item);
  }
}

// ── Messages from Background/Content ────────────────────────

chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'refresh-recent') {
    // TODO: fetch recent captures from Saga
    renderRecent();
  }

  if (message.action === 'security-finding') {
    updateSecurityDisplay(message);
  }
});

function updateSecurityDisplay(message) {
  const alertCount = document.getElementById('alert-count');
  const current = parseInt(alertCount.textContent) || 0;
  alertCount.textContent = `${current + message.findings.length} new`;
  alertCount.style.color = '#e74c3c';
}

// ── Helpers ─────────────────────────────────────────────────

function maskToken(token) {
  if (!token) return '----';
  return token.slice(0, 10) + '\u2026';
}

function formatRelative(dateStr) {
  try {
    const date = new Date(dateStr);
    const diff = date.getTime() - Date.now();

    if (diff > 0) {
      // Future (expiry)
      const days = Math.floor(diff / 86400000);
      const hours = Math.floor((diff % 86400000) / 3600000);
      if (days > 0) return `in ${days}d`;
      if (hours > 0) return `in ${hours}h`;
      return 'soon';
    }

    // Past
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

// ── Init ────────────────────────────────────────────────────

checkConnection();
renderRecent();

// Re-check connection every 30 seconds
setInterval(checkConnection, 30_000);

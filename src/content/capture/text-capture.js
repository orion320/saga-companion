/**
 * Text & Page Capture — Content Script
 *
 * Handles two capture types:
 * 1. Selection capture — grabs highlighted text + surrounding context
 * 2. Page capture — extracts title, URL, headings, main content, metadata
 *
 * Receives messages from service worker (via context menu or side panel).
 * Sends capture payload back to service worker for routing to Saga.
 */

import { sendCapture } from '../../lib/api.js';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'capture-selection') {
    handleSelectionCapture(message.text);
    sendResponse({ received: true });
  }

  if (message.action === 'capture-page') {
    handlePageCapture();
    sendResponse({ received: true });
  }
});

async function handleSelectionCapture(text) {
  const selectedText = text || window.getSelection()?.toString();
  if (!selectedText) return;

  const result = await sendCapture({
    source: extractDomain(window.location.hostname),
    url: window.location.href,
    title: document.title,
    capture_type: 'selection',
    content: selectedText,
  });

  if (result.success) {
    showToast('Sent to Saga');
  }
}

async function handlePageCapture() {
  const content = extractPageContent();

  const result = await sendCapture({
    source: extractDomain(window.location.hostname),
    url: window.location.href,
    title: document.title,
    capture_type: 'page',
    content,
  });

  if (result.success) {
    showToast('Page captured');
  }
}

function extractPageContent() {
  const parts = [];

  // Title
  parts.push(`# ${document.title}`);
  parts.push(`URL: ${window.location.href}`);
  parts.push('');

  // Meta description
  const desc = document.querySelector('meta[name="description"]')?.getAttribute('content');
  if (desc) parts.push(`> ${desc}\n`);

  // Headings and content
  const headings = document.querySelectorAll('h1, h2, h3');
  for (const h of Array.from(headings).slice(0, 20)) {
    const level = h.tagName === 'H1' ? '#' : h.tagName === 'H2' ? '##' : '###';
    parts.push(`${level} ${h.textContent.trim()}`);
  }

  // Main content (article or body text)
  const article = document.querySelector('article, [role="main"], main');
  const textSource = article || document.body;
  const visibleText = textSource?.innerText?.slice(0, 50000) || '';
  parts.push('');
  parts.push(visibleText);

  return parts.join('\n');
}

function extractDomain(hostname) {
  return hostname.replace(/^www\./, '');
}

function showToast(message) {
  const toast = document.createElement('div');
  toast.textContent = message;
  Object.assign(toast.style, {
    position: 'fixed',
    bottom: '20px',
    right: '20px',
    zIndex: '2147483647',
    background: '#1a1a2e',
    color: '#c9a030',
    padding: '10px 18px',
    borderRadius: '8px',
    fontSize: '13px',
    fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
    border: '1px solid rgba(201,160,48,0.3)',
    boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
    transition: 'opacity 0.3s',
  });

  document.documentElement.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}

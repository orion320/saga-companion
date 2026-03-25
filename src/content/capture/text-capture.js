/**
 * Text & Page Capture — Content Script
 *
 * Handles selection + page extraction on the current page. The content script
 * gathers page context and hands the payload to the background worker, which
 * owns the authenticated Saga upload.
 */

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'capture-selection') {
    handleSelectionCapture(message.text)
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({ success: false, error: error?.message || 'Selection capture failed' }));
    return true;
  }

  if (message.action === 'capture-page') {
    handlePageCapture()
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({ success: false, error: error?.message || 'Page capture failed' }));
    return true;
  }

  return false;
});

async function handleSelectionCapture(text) {
  const selectedText = text || window.getSelection()?.toString();
  if (!selectedText?.trim()) {
    showToast('Select text first');
    return { success: false, error: 'No text selected' };
  }

  const result = await chrome.runtime.sendMessage({
    action: 'send-capture',
    cefNonce: getCefNonce(),
    capture: {
      source: extractDomain(window.location.hostname),
      url: window.location.href,
      title: document.title,
      capture_type: 'selection',
      content: selectedText.trim(),
    },
  });

  if (result?.success) {
    showToast('Sent to Saga');
  } else if (result?.error) {
    showToast(result.error);
  }

  return result || { success: false, error: 'No response from extension worker' };
}

async function handlePageCapture() {
  const content = extractPageContent();

  const result = await chrome.runtime.sendMessage({
    action: 'send-capture',
    cefNonce: getCefNonce(),
    capture: {
      source: extractDomain(window.location.hostname),
      url: window.location.href,
      title: document.title,
      capture_type: 'page',
      content,
    },
  });

  if (result?.success) {
    showToast('Page captured');
  } else if (result?.error) {
    showToast(result.error);
  }

  return result || { success: false, error: 'No response from extension worker' };
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

// getCefNonce, extractDomain, showToast provided by content/shared.js

/** Shared utilities for Saga Companion content scripts. */

/** Return the CEF nonce if running inside Saga's CEF shell, or null. */
function getCefNonce() {
  try {
    return document.documentElement.dataset.sagaCefNonce || null;
  } catch {
    return null;
  }
}

function extractDomain(hostname) {
  return (hostname || '').replace(/^www\./, '');
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

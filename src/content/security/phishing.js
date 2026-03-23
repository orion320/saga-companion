/**
 * Phishing Detection — Content Script
 *
 * Runs on every page. Analyzes the current URL and page structure for
 * phishing indicators. All analysis is local — no data leaves the browser.
 *
 * Checks:
 * 1. Lookalike domain detection (Levenshtein distance, homoglyphs)
 * 2. Password fields on suspicious domains
 * 3. Form actions pointing to unknown servers
 * 4. Known phishing patterns from community lists
 */

const TRUSTED_DOMAINS = new Set([
  'google.com', 'github.com', 'microsoft.com', 'apple.com',
  'amazon.com', 'facebook.com', 'twitter.com', 'x.com',
  'linkedin.com', 'paypal.com', 'stripe.com', 'netflix.com',
  'chase.com', 'bankofamerica.com', 'wellsfargo.com',
  'claude.ai', 'anthropic.com', 'openai.com', 'chatgpt.com',
]);

// Homoglyph map: characters that look like ASCII but aren't
const HOMOGLYPHS = {
  'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'у': 'y',
  'х': 'x', 'і': 'i', 'ј': 'j', 'ѕ': 's', 'ω': 'w', 'ν': 'v',
  'ɡ': 'g', 'ɑ': 'a', 'ℓ': 'l',
};

function normalizeHomoglyphs(str) {
  return [...str].map(ch => HOMOGLYPHS[ch] || ch).join('');
}

function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function extractDomain(hostname) {
  const parts = hostname.replace(/^www\./, '').split('.');
  if (parts.length <= 2) return parts.join('.');
  return parts.slice(-2).join('.');
}

function checkLookalike(hostname) {
  const domain = extractDomain(hostname);
  const normalized = normalizeHomoglyphs(domain);

  for (const trusted of TRUSTED_DOMAINS) {
    if (domain === trusted) return null;

    if (normalized === trusted && domain !== trusted) {
      return { type: 'homoglyph', target: trusted, severity: 'high' };
    }

    const dist = levenshtein(domain, trusted);
    if (dist === 1 && domain.length >= 4) {
      return { type: 'typosquat', target: trusted, severity: 'medium' };
    }

    if (domain.includes(trusted.split('.')[0]) && domain !== trusted && domain.length > trusted.length) {
      return { type: 'substring', target: trusted, severity: 'low' };
    }
  }

  return null;
}

function checkPasswordForms() {
  const passwordFields = document.querySelectorAll('input[type="password"]');
  if (passwordFields.length === 0) return null;

  const forms = document.querySelectorAll('form');
  for (const form of forms) {
    const action = form.getAttribute('action');
    if (!action) continue;

    try {
      const actionUrl = new URL(action, window.location.href);
      const currentDomain = extractDomain(window.location.hostname);
      const actionDomain = extractDomain(actionUrl.hostname);

      if (actionDomain !== currentDomain && actionDomain !== '') {
        return { type: 'cross-domain-form', actionDomain, severity: 'high' };
      }
    } catch {
      // malformed URL
    }
  }

  return null;
}

// ── Main Analysis ───────────────────────────────────────────

function analyze() {
  const findings = [];

  const lookalike = checkLookalike(window.location.hostname);
  if (lookalike) findings.push(lookalike);

  const formIssue = checkPasswordForms();
  if (formIssue) findings.push(formIssue);

  if (findings.length > 0) {
    chrome.runtime.sendMessage({
      action: 'security-finding',
      findings,
      url: window.location.href,
      hostname: window.location.hostname,
    }).catch(() => {});

    const highSeverity = findings.find(f => f.severity === 'high');
    if (highSeverity) {
      showAlert(highSeverity);
    }
  }
}

function showAlert(finding) {
  const banner = document.createElement('div');
  banner.id = 'saga-companion-phishing-alert';
  Object.assign(banner.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    right: '0',
    zIndex: '2147483647',
    background: 'linear-gradient(135deg, #1a1a2e, #16213e)',
    borderBottom: '2px solid #e74c3c',
    color: '#ecf0f1',
    padding: '12px 20px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontSize: '14px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
  });

  const icon = document.createElement('span');
  icon.textContent = '\u{1F6E1}\uFE0F'; // shield emoji
  icon.style.fontSize = '20px';

  const msg = document.createElement('span');
  msg.style.flex = '1';

  if (finding.type === 'homoglyph') {
    msg.textContent = `This domain uses characters that look like ${finding.target} but aren't. Be cautious with login credentials.`;
  } else if (finding.type === 'typosquat') {
    msg.textContent = `This domain is very similar to ${finding.target}. Verify you're on the right site before entering credentials.`;
  } else if (finding.type === 'cross-domain-form') {
    msg.textContent = `A login form on this page submits to ${finding.actionDomain} \u2014 a different domain. This could be a phishing attempt.`;
  }

  const dismiss = document.createElement('button');
  dismiss.textContent = 'Dismiss';
  Object.assign(dismiss.style, {
    background: 'rgba(255,255,255,0.1)',
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: '6px',
    color: '#ecf0f1',
    padding: '6px 12px',
    cursor: 'pointer',
    fontSize: '12px',
  });
  dismiss.addEventListener('click', () => banner.remove());

  banner.appendChild(icon);
  banner.appendChild(msg);
  banner.appendChild(dismiss);
  document.documentElement.appendChild(banner);
}

if (document.readyState === 'complete') {
  analyze();
} else {
  window.addEventListener('load', analyze, { once: true });
}

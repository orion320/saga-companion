const TRACKER_VENDORS = [
  {
    vendor: 'Google',
    category: 'analytics',
    domains: [
      'google-analytics.com',
      'googletagmanager.com',
      'doubleclick.net',
      'googleadservices.com',
      'googlesyndication.com',
    ],
  },
  {
    vendor: 'Meta',
    category: 'social',
    domains: [
      'facebook.net',
      'facebook.com',
      'connect.facebook.net',
      'fbcdn.net',
    ],
  },
  {
    vendor: 'X',
    category: 'social',
    domains: [
      'twitter.com',
      'twimg.com',
      'ads-twitter.com',
      'platform.twitter.com',
    ],
  },
  {
    vendor: 'LinkedIn',
    category: 'analytics',
    domains: [
      'licdn.com',
      'linkedin.com',
      'snap.licdn.com',
    ],
  },
  {
    vendor: 'TikTok',
    category: 'analytics',
    domains: [
      'analytics.tiktok.com',
      'tiktok.com',
      'tiktokcdn-us.com',
    ],
  },
  {
    vendor: 'Reddit',
    category: 'analytics',
    domains: [
      'redditstatic.com',
      'reddit.com',
      'ads.reddit.com',
    ],
  },
  {
    vendor: 'Hotjar',
    category: 'analytics',
    domains: [
      'hotjar.com',
      'hotjar.io',
    ],
  },
  {
    vendor: 'Amplitude',
    category: 'analytics',
    domains: [
      'amplitude.com',
      'amplitude.io',
    ],
  },
  {
    vendor: 'Segment',
    category: 'analytics',
    domains: [
      'segment.com',
      'segment.io',
    ],
  },
  {
    vendor: 'Mixpanel',
    category: 'analytics',
    domains: [
      'mixpanel.com',
      'mxpnl.com',
    ],
  },
];

const TRACKER_DOMAIN_INDEX = new Map();

for (const vendor of TRACKER_VENDORS) {
  for (const domain of vendor.domains) {
    TRACKER_DOMAIN_INDEX.set(domain, {
      vendor: vendor.vendor,
      category: vendor.category,
      matchedDomain: domain,
    });
  }
}

export function extractHostname(input) {
  if (!input || typeof input !== 'string') {
    return '';
  }

  try {
    if (input.includes('://')) {
      return new URL(input).hostname.toLowerCase();
    }
    return input.toLowerCase().replace(/^\.+/, '').replace(/\.+$/, '');
  } catch {
    return '';
  }
}

export function baseDomain(input) {
  const hostname = extractHostname(input);
  if (!hostname) {
    return '';
  }

  const parts = hostname.split('.').filter(Boolean);
  if (parts.length <= 2) {
    return hostname;
  }

  return parts.slice(-2).join('.');
}

function lookupTracker(hostname) {
  if (!hostname) {
    return null;
  }

  for (const [domain, meta] of TRACKER_DOMAIN_INDEX.entries()) {
    if (hostname === domain || hostname.endsWith(`.${domain}`)) {
      return meta;
    }
  }

  return null;
}

export function classifyTrackerRequest({ requestUrl, tabUrl, initiator }) {
  const requestHost = extractHostname(requestUrl);
  const topLevelHost = extractHostname(initiator || tabUrl);

  if (!requestHost || !topLevelHost) {
    return null;
  }

  if (baseDomain(requestHost) === baseDomain(topLevelHost)) {
    return null;
  }

  const tracker = lookupTracker(requestHost);
  if (!tracker) {
    return null;
  }

  return {
    requestHost,
    topLevelHost,
    vendor: tracker.vendor,
    category: tracker.category,
    matchedDomain: tracker.matchedDomain,
  };
}

# Saga Companion

Open-source browser extension that protects your browsing and captures anything for your AI workspace.

## What it does

**Security (always on, no account needed)**
- Phishing detection — warns about lookalike domains and suspicious login forms
- Tracker observation — shows which third parties are watching you on every page
- Privacy monitoring — alerts when sites access your camera, mic, or clipboard
- All analysis runs locally. Nothing leaves your browser.

**Capture (connects to [Saga](https://saga.so))**
- Screenshot with annotation — draw, arrows, text, blur sensitive info
- Screen recording with audio narration — like Loom, but local-first
- Text and page capture — grab anything to share with AI
- AI conversation extraction — capture chats from claude.ai, chatgpt.com

## Install

**Chrome:** Coming to Chrome Web Store.
**Firefox:** Coming to Firefox Add-ons.
**Safari:** Distributed via macOS companion app.

## Architecture

```
saga-companion (extension)
├── Security layer ── always on, standalone
├── Capture layer ─── requires Saga connection + token
└── Side panel UI ─── two-tier: config + captures

saga-companion-native (per-platform helper)
├── macOS:   ScreenCaptureKit
├── Windows: Windows.Graphics.Capture
└── Linux:   PipeWire / XDG Desktop Portal
```

The extension handles security, text capture, and screenshots natively. Screen recording with audio delegates to a lightweight native companion app.

## Token system

Capture features require a token generated in Saga with a user-selected duration (1 hour to 1 month). When it expires, captures pause until you consciously renew. Security features always work, no token needed.

## Development

```bash
# Build for Chrome
node scripts/build.js chrome

# Load in Chrome
# 1. Go to chrome://extensions
# 2. Enable Developer mode
# 3. Click "Load unpacked"
# 4. Select dist/chrome/
```

## License

MIT

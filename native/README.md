# Saga Companion — Native Helpers

Platform-specific native apps for screen recording and audio capture. The browser extension delegates to these when browser APIs alone aren't sufficient.

## Why native?

- **Safari**: No tabCapture or desktopCapture API. Apple requires native ScreenCaptureKit.
- **Firefox**: No tabCapture API. Native companion via native messaging.
- **Chrome**: Has tabCapture but native gives better quality and system audio capture.
- **All platforms**: Microphone capture alongside screen recording works better natively.

## Platform Architecture

### macOS (`native/macos/`)

Swift app using:
- **ScreenCaptureKit** (macOS 12.3+) for screen/window capture
- **AVFoundation** for audio recording
- Communicates with extension via App Extension bridge (Safari) or native messaging (Chrome/Firefox)
- Requires Screen Recording TCC permission
- Distributed alongside Safari extension as the required native app container

### Windows (`native/windows/`)

Win32/C++ app using:
- **Windows.Graphics.Capture** (Windows 10 1903+) for screen/window capture
- **WASAPI** loopback for system audio, standard capture for microphone
- Communicates with extension via native messaging (Chrome/Firefox)
- No special permissions beyond standard screen capture prompt

### Linux (`native/linux/`)

Rust or Python helper using:
- **PipeWire** or **XDG Desktop Portal** for screen capture (Wayland-compatible)
- **PulseAudio/PipeWire** for audio capture
- Communicates with extension via native messaging (Chrome/Firefox)
- Respects Wayland security model (user must grant via portal dialog)

## Communication Protocol

All native helpers use the same JSON-over-stdin/stdout protocol (Chrome/Firefox native messaging format):

```json
// Extension → Native: Start recording
{ "action": "start-recording", "options": { "audio": true, "region": null } }

// Native → Extension: Recording started
{ "status": "recording", "id": "rec-001" }

// Extension → Native: Stop recording
{ "action": "stop-recording", "id": "rec-001" }

// Native → Extension: Recording complete
{ "status": "complete", "id": "rec-001", "video_path": "/tmp/saga-rec-001.webm", "audio_path": "/tmp/saga-rec-001.wav" }
```

For Safari, communication goes through the App Extension bridge instead of stdin/stdout, but the message format is identical.

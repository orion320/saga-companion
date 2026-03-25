# Saga Companion — Post Workstream 3 Plan

**Date:** 2026-03-24
**Status:** Next phase after tracker observation, screenshot annotation, and token-gated capture are in place

## Goal

Turn the current Chrome-primary extension prototype into a stable cross-platform capture and security tool that can support Windows and macOS work over the next one to two weeks without redoing the architecture.

## What Is Now Done

- Tracker observation path is wired through the MV3 service worker, with per-page summaries surfaced to the side panel.
- Screenshot capture now opens an in-page annotation overlay with draw, arrow, rect, text, blur, crop, undo, keyboard shortcuts, and send-to-Saga.
- Saga bridge now supports extension tokens, token status, token revocation, trusted CEF bypass, screenshot payloads, and a real `captures` destination that writes into the project's `Captures` folder.

## Phase 1: Hardening And UX Cleanup

**Priority:** Immediate

1. Load the unpacked Chrome build and run manual end-to-end tests on:
   - selection capture
   - page capture
   - screenshot annotate/send
   - tracker counts updating on tracker-heavy pages
   - token-expired behavior

2. Add a small Saga settings UI for token generation and revocation:
   - generate token with 1 hour / 1 day / 1 week / 1 month TTL presets
   - copy token action
   - current token status and expiry
   - revoke action

3. Tighten the screenshot overlay:
   - better text placement and drag handles
   - resize/reposition for rectangle and blur actions
   - explicit crop reset control in the toolbar
   - annotation persistence only within the active overlay session

4. Replace worker-local recent captures with Saga-backed recent capture fetching so the side panel reflects captures across browser restarts and machines.

## Phase 2: Native Capture Layer

**Priority:** Next major track

1. Define the native helper contract for all three platforms:
   - start recording
   - stop recording
   - microphone on/off
   - return video file path, transcript sidecar path, and metadata

2. Implement the first native helpers:
   - macOS: `ScreenCaptureKit`
   - Windows: `Windows.Graphics.Capture`
   - Linux: `PipeWire` / portal fallback

3. Add extension-side recording orchestration:
   - background worker start/stop handshake
   - recording overlay UI
   - preview/discard/send flow
   - upload path to Saga capture API

4. Keep screen recording separate from screenshot annotation code so the screenshot path stays simple and stable.

## Phase 3: Security Layer Completion

**Priority:** Parallel with native helper work when possible

1. Add `privacy.js` main-world monitoring for:
   - camera/mic requests
   - geolocation access
   - clipboard read attempts

2. Improve tracker observation:
   - expand tracker lists
   - add category labels in the side panel
   - support optional blocking via `declarativeNetRequest`
   - add periodic security digest routing into Saga

3. Add clearer per-page status in the side panel:
   - low / medium / high risk
   - top tracker vendors
   - active permission usage

## Phase 4: Site Extractors And Capture Targets

**Priority:** After baseline stability

1. Add structured conversation extractors for:
   - `claude.ai`
   - `chatgpt.com`
   - generic fallback extraction

2. Add capture target selection in the side panel:
   - Captures folder
   - editor file
   - active chat
   - specific chat

3. Add upload progress and better failure states for large captures.

## Phase 5: Cross-Platform Release Pass

**Priority:** Before public packaging

1. Chrome:
   - verify context menus, side panel, tracker observation, screenshot overlay, token status

2. Windows:
   - validate native helper launch, path handling, clipboard behavior, recording permissions

3. macOS:
   - validate ScreenCaptureKit permissions, app signing expectations, extension-to-helper bridge

4. Firefox:
   - verify manifest transform, sidebar fallback, and degraded feature set without Chrome-only APIs

## Recommended Order

1. Manual Chrome QA on the current prototype
2. Saga settings token UI
3. Native helper protocol and macOS/Windows helper spike
4. Recording flow
5. Privacy monitoring
6. AI site extractors
7. Firefox/Safari packaging cleanup

## Main Risks

- Native recording APIs will diverge significantly across macOS, Windows, and Linux.
- The screenshot overlay still needs real browser QA on complex pages with heavy pointer handling and custom CSS.
- Token UI does not exist in Saga yet, so the backend routes are ready before the user-facing management surface is.

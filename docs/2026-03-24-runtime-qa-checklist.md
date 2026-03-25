# Workstream 3 — Runtime QA Checklist

**Date:** 2026-03-24
**Scope:** Tracker observation, screenshot annotation, text/page capture, token-gated auth, bridge storage
**Prereqs:** `npm run build:chrome` passes, `cargo check -p saga_bridge` passes

---

## 0. Setup

- [ ] Build extension: `npm run build:chrome` in `saga-companion/`
- [ ] Start Saga: `SAGA_DEV=1 cargo run` in `Saga/`
- [ ] Open Chrome, go to `chrome://extensions`, enable Developer mode
- [ ] Load unpacked from `saga-companion/dist/chrome/`
- [ ] Confirm extension icon appears in toolbar
- [ ] Confirm no errors in `chrome://extensions` for Saga Companion
- [ ] Open service worker inspector (click "Inspect views: service worker" on the extension card)
- [ ] Confirm no console errors on startup

---

## 1. Connection & Token Auth

### 1a. No token state
- [ ] Open side panel (click extension icon)
- [ ] Side panel shows "Not connected" or "Saga not running" if bridge isn't up
- [ ] Start Saga bridge — side panel polls and shows "Connected to Saga" within 30s
- [ ] Token row shows no token (captures disabled)
- [ ] Capture buttons are disabled / "Connect to Saga to capture" message visible

### 1b. Generate token
- [ ] `curl -X POST http://127.0.0.1:8420/api/extension/token -H 'Content-Type: application/json' -d '{"ttl_seconds": 3600}'`
- [ ] Response contains `success: true`, `token: "saga_ext_..."`, `expires_at`, `ttl_seconds: 3600`
- [ ] Copy the token value

### 1c. Store token in extension
- [ ] In extension service worker console: `chrome.storage.local.set({ saga_companion_token: "<token>" })`
- [ ] Reload side panel (close and reopen)
- [ ] Token row shows masked token (`saga_ext_1a...`)
- [ ] Expiry shows relative time (e.g. "in 59m")
- [ ] Status dot is green (connected)
- [ ] Capture buttons become enabled

### 1d. Token status check
- [ ] `curl http://127.0.0.1:8420/api/extension/token/status -H 'Authorization: Bearer <token>'`
- [ ] Response: `{ "valid": true, "expiresAt": "...", "error": null }`

### 1e. Token expiry behavior
- [ ] Generate a token with short TTL: `curl -X POST ... -d '{"ttl_seconds": 3600}'` (minimum 1h)
- [ ] After expiry, side panel shows "Token expired" with "Open Saga to renew"
- [ ] Capture attempts return error toast, not silent failure

### 1f. Token revocation
- [ ] `curl -X DELETE http://127.0.0.1:8420/api/extension/token`
- [ ] Response: `{ "success": true }`
- [ ] Side panel updates to show token invalid/missing on next poll cycle
- [ ] Capture attempts fail with auth error

### 1g. CEF bypass
- [ ] `curl -X POST http://127.0.0.1:8420/api/capture -H 'X-Saga-CEF: 1' -H 'Content-Type: application/json' -d '{"capture":{"source":"test","url":"http://test","capture_type":"selection","content":"hello","captured_at":"2026-03-24T00:00:00Z"},"destination":{"type":"captures"}}'`
- [ ] Response: `{ "success": true, "file_path": "...", "json_path": "..." }`
- [ ] No token required when `X-Saga-CEF: 1` header is present

---

## 2. Tracker Observation

### 2a. Basic detection
- [ ] Navigate to a tracker-heavy page (e.g. a news site, reddit.com, any site with Google Analytics)
- [ ] Side panel "Trackers" count updates from 0 to a positive number
- [ ] Service worker console shows no errors during observation

### 2b. Page context sync
- [ ] Check `document.documentElement.dataset.sagaTrackerCount` in page console — should be a number string
- [ ] Check `document.documentElement.dataset.sagaTrackerVendors` — should list vendor names (e.g. "Google,Meta")

### 2c. SPA navigation
- [ ] Navigate to a single-page app (e.g. GitHub, Twitter)
- [ ] Click internal links (SPA navigation via pushState/replaceState)
- [ ] Tracker count resets per new URL context
- [ ] Service worker receives `tracker-page-context` messages for each navigation

### 2d. Side panel detail
- [ ] "This Page" section appears when trackers are observed
- [ ] Shows request count, unique domains, top vendors
- [ ] Page host is displayed correctly

### 2e. Tab cleanup
- [ ] Open a tracker-heavy page in a new tab, observe trackers
- [ ] Close that tab
- [ ] Confirm no errors in service worker console (tab cleanup should remove tracker state)

### 2f. Persistence across worker restart
- [ ] Load a tracker-heavy page, note the count
- [ ] Stop and restart the service worker (click "service worker" link in chrome://extensions)
- [ ] Tracker state should persist via `chrome.storage.session`

---

## 3. Selection Capture

### 3a. Context menu
- [ ] Select text on any page
- [ ] Right-click, choose "Send to Saga Captures"
- [ ] Toast appears: "Sent to Saga"
- [ ] Check Saga data dir: `ls ~/.saga/data/captures/` — new `.json` file appears
- [ ] Check Saga data dir: `ls ~/.saga/data/files/` — new directory with `.md` file appears
- [ ] JSON file contains `capture_type: "selection"`, selected text in `content`

### 3b. Side panel button
- [ ] Select text on a page
- [ ] Click "Text" button in side panel
- [ ] Toast appears: "Sent to Saga"
- [ ] Recent captures list in side panel updates with new entry
- [ ] Entry shows correct source domain, title, and "selection" badge

### 3c. No selection
- [ ] Deselect all text on page
- [ ] Click "Text" button — should show "Select text first" toast
- [ ] No capture sent to bridge

### 3d. Error handling
- [ ] Stop Saga bridge
- [ ] Select text, try to capture
- [ ] Toast shows "Could not reach Saga" (not a silent failure)

---

## 4. Page Capture

### 4a. Context menu
- [ ] Right-click on any page (no selection), choose "Capture this page"
- [ ] Toast: "Page captured"
- [ ] JSON file in captures dir has `capture_type: "page"`
- [ ] Content includes page title, URL, headings, and body text (markdown format)

### 4b. Side panel button
- [ ] Click "Page" button in side panel
- [ ] Toast: "Page captured"
- [ ] Recent list updates

### 4c. Content extraction
- [ ] Capture a page with `<article>` or `<main>` element
- [ ] Verify content preferentially extracts from article/main, not full body
- [ ] Content is truncated at 50k chars (no enormous payloads)

---

## 5. Screenshot Annotation

### 5a. Trigger
- [ ] Right-click on page, choose "Screenshot with annotation"
- [ ] Full-page annotation overlay appears
- [ ] Screenshot image is rendered on canvas
- [ ] Toolbar shows: Draw, Arrow, Rect, Text, Blur, Crop tools
- [ ] Color picker shows 4 color options
- [ ] Action buttons: Undo, Cancel, Send to Saga

### 5b. Side panel trigger
- [ ] Click "Screenshot" button in side panel
- [ ] Same overlay appears

### 5c. Drawing tools
- [ ] **Draw:** freehand drawing works, stroke appears in selected color
- [ ] **Arrow:** click-drag creates an arrow with head
- [ ] **Rect:** click-drag creates a rectangle outline
- [ ] **Text:** click on canvas opens text popover, type text, click "Add" — text label appears with background
- [ ] **Blur:** click-drag blurs a rectangular region (pixelated effect)
- [ ] **Crop:** click-drag sets a crop region (dark mask outside, dashed border inside)

### 5d. Keyboard shortcuts
- [ ] `d` = Draw, `a` = Arrow, `r` = Rect, `t` = Text, `b` = Blur, `c` = Crop
- [ ] `1-4` = select colors
- [ ] `Ctrl+Z` / `Cmd+Z` = undo last action
- [ ] `Escape` = close overlay (or close text popover if open)
- [ ] `Enter` = send screenshot

### 5e. Undo behavior
- [ ] Draw something, undo — last annotation removed
- [ ] Set crop, undo — crop cleared (before removing annotations)
- [ ] Open text popover, undo — popover closes (before clearing crop)
- [ ] Status bar updates with undo feedback messages

### 5f. Send to Saga
- [ ] Add a few annotations, set a crop region
- [ ] Click "Send to Saga"
- [ ] Status shows "Sending screenshot to Saga..."
- [ ] Toast: "Screenshot sent to Saga"
- [ ] Overlay closes automatically
- [ ] Check captures dir: new screenshot file (`.webp`) exists
- [ ] Verify image is cropped to the crop region
- [ ] Verify annotations are baked into the image
- [ ] JSON sidecar contains `capture_type: "screenshot"`, source URL, title

### 5g. Send without crop
- [ ] Open overlay, draw annotations, do NOT set crop
- [ ] Send — full screenshot exported with annotations

### 5h. Cancel
- [ ] Open overlay, draw something
- [ ] Click "Cancel" — overlay closes, nothing sent

### 5i. Complex pages
- [ ] Test overlay on pages with: iframes, fixed headers, custom scroll containers, `pointer-events: none` elements
- [ ] Overlay should render above everything (z-index 2147483647)
- [ ] Pointer events should be captured by the canvas, not leaked to page underneath

### 5j. Error handling
- [ ] Stop Saga bridge, try to send screenshot
- [ ] Status shows error message, send button re-enables
- [ ] Overlay stays open (user can retry or cancel)

---

## 6. Bridge Storage Verification

### 6a. Captures folder routing
- [ ] All captures with destination `{ type: "captures" }` write to `~/.saga/data/files/<uuid>/`
- [ ] DB entry created: `saga_bridge` assigns file to first project, folder = "Captures"
- [ ] Screenshot files are `.webp`, text captures are `.md`

### 6b. JSON archive
- [ ] Every capture also writes a `.json` sidecar to `~/.saga/data/captures/<uuid>.json`
- [ ] JSON contains full payload including source, URL, title, content, timestamp

### 6c. File naming
- [ ] Screenshots: `screenshot-<sanitized-title>-<timestamp>.webp`
- [ ] Selections: `selection-<sanitized-title>-<timestamp>.md`
- [ ] Pages: `page-<sanitized-title>-<timestamp>.md`
- [ ] Titles with special chars are sanitized (no slashes, no spaces — lowercase with dashes)

### 6d. Token file security (Linux)
- [ ] Check permissions on `~/.saga/data/extension_token.json`: should be `0600` (owner read/write only)

---

## 7. Side Panel State

- [ ] Recent captures list shows up to 8 items
- [ ] Each item shows: title, source domain, relative time, capture type badge
- [ ] "View all in Saga" link appears when connected, opens Saga URL in new tab
- [ ] Connection status updates on 30s interval
- [ ] Tracker summary updates on 30s interval
- [ ] Alert count starts at 0, increments on security findings
- [ ] Side panel works after browser restart (recent captures use `chrome.storage.session`, so they reset — this is expected)

---

## 8. Edge Cases

- [ ] **chrome:// pages:** Extension cannot inject content scripts — context menu and screenshot should fail gracefully (no crash)
- [ ] **about:blank:** Capture should fail gracefully or capture empty content
- [ ] **PDF viewer:** Screenshot should work (captureVisibleTab works on any tab), text capture may be empty
- [ ] **Multiple windows:** Extension icon click opens side panel in the correct window
- [ ] **Rapid captures:** Send 3 captures quickly — all should succeed, recent list shows all 3
- [ ] **Large page:** Capture a page with >50k chars of text — content is truncated, no timeout
- [ ] **Large screenshot:** Annotate a 4K display screenshot — canvas handles it, WebP export doesn't exceed reasonable size

---

## Verdict

- [ ] **All critical paths pass** (setup, token, capture, screenshot, trackers)
- [ ] **No silent failures** — every error produces user-visible feedback
- [ ] **Ready to commit**

const OVERLAY_ROOT_ID = 'saga-companion-shot-root';
const OVERLAY_STYLE_ID = 'saga-companion-shot-style';
const OVERLAY_STYLE_URL = chrome.runtime.getURL('content/capture/screenshot-overlay.css');
const TOOL_LABELS = {
  draw: 'Draw',
  arrow: 'Arrow',
  rect: 'Rect',
  text: 'Text',
  blur: 'Blur',
  crop: 'Crop',
};
const COLORS = ['#ff5f57', '#ffd166', '#f8fafc', '#60a5fa'];

let overlayState = null;
let stylesReadyPromise = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'show-annotation-overlay') {
    openOverlay(message)
      .then(() => sendResponse({ success: true }))
      .catch((error) => sendResponse({ success: false, error: error?.message || 'Overlay failed to open' }));
    return true;
  }

  return false;
});

async function openOverlay(payload) {
  await ensureStyles();
  destroyOverlay();

  const image = await loadImage(payload.screenshot);
  const root = document.createElement('div');
  root.id = OVERLAY_ROOT_ID;

  const shell = document.createElement('div');
  shell.className = 'saga-shot-shell';

  const toolbar = document.createElement('div');
  toolbar.className = 'saga-shot-toolbar';

  const title = document.createElement('div');
  title.className = 'saga-shot-title';
  title.textContent = payload.title || 'Screenshot';

  const toolRow = document.createElement('div');
  toolRow.className = 'saga-shot-tool-row';

  const colorRow = document.createElement('div');
  colorRow.className = 'saga-shot-color-row';

  const spacer = document.createElement('div');
  spacer.className = 'saga-shot-spacer';

  const status = document.createElement('div');
  status.className = 'saga-shot-status';
  status.textContent = 'Draw, annotate, crop, then send.';

  const actionRow = document.createElement('div');
  actionRow.className = 'saga-shot-action-row';

  const canvasWrap = document.createElement('div');
  canvasWrap.className = 'saga-shot-canvas-wrap';

  const canvas = document.createElement('canvas');
  canvas.className = 'saga-shot-canvas';
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  canvasWrap.appendChild(canvas);

  toolbar.appendChild(title);
  toolbar.appendChild(toolRow);
  toolbar.appendChild(colorRow);
  toolbar.appendChild(spacer);
  toolbar.appendChild(status);
  toolbar.appendChild(actionRow);

  shell.appendChild(toolbar);
  shell.appendChild(canvasWrap);
  root.appendChild(shell);
  document.documentElement.appendChild(root);

  overlayState = {
    root,
    shell,
    toolbar,
    canvasWrap,
    canvas,
    ctx: canvas.getContext('2d'),
    image,
    sourceUrl: payload.url || window.location.href,
    title: payload.title || document.title,
    tool: 'draw',
    color: COLORS[0],
    actions: [],
    cropRect: null,
    draft: null,
    pointerDown: false,
    sendButton: null,
    status,
    textPopover: null,
    keyHandler: null,
    toolButtons: new Map(),
    colorButtons: [],
  };

  buildToolbar(overlayState, toolRow, colorRow, actionRow);
  bindCanvasEvents(overlayState);
  bindKeyboardEvents(overlayState);
  redrawScene(overlayState);
}

function buildToolbar(state, toolRow, colorRow, actionRow) {
  for (const [tool, label] of Object.entries(TOOL_LABELS)) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'saga-shot-button';
    button.textContent = label;
    button.addEventListener('click', () => setTool(state, tool));
    toolRow.appendChild(button);
    state.toolButtons.set(tool, button);
  }

  for (const color of COLORS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'saga-shot-color';
    button.style.setProperty('--shot-color', color);
    button.addEventListener('click', () => setColor(state, color));
    colorRow.appendChild(button);
    state.colorButtons.push(button);
  }

  const undoButton = actionButton('Undo', () => {
    if (state.textPopover) {
      closeTextPopover(state);
      return;
    }

    if (state.cropRect) {
      state.cropRect = null;
      setStatus(state, 'Crop cleared.');
      redrawScene(state);
      return;
    }

    if (state.actions.length > 0) {
      state.actions.pop();
      setStatus(state, 'Last annotation removed.');
      redrawScene(state);
    }
  });

  const cancelButton = actionButton('Cancel', () => destroyOverlay());
  const sendButton = actionButton('Send to Saga', () => {
    void sendScreenshot(state);
  });
  sendButton.classList.add('primary');
  state.sendButton = sendButton;

  actionRow.appendChild(undoButton);
  actionRow.appendChild(cancelButton);
  actionRow.appendChild(sendButton);

  setTool(state, state.tool);
  setColor(state, state.color);
}

function actionButton(label, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'saga-shot-action';
  button.textContent = label;
  button.addEventListener('click', onClick);
  return button;
}

function bindCanvasEvents(state) {
  const onPointerDown = (event) => {
    if (event.button !== 0) {
      return;
    }

    if (state.textPopover) {
      closeTextPopover(state);
    }

    const point = canvasPoint(state, event);
    if (!point) {
      return;
    }

    event.preventDefault();

    if (state.tool === 'text') {
      openTextPopover(state, point, event.clientX, event.clientY);
      return;
    }

    state.pointerDown = true;
    state.canvas.setPointerCapture?.(event.pointerId);

    if (state.tool === 'draw') {
      state.draft = { type: 'draw', color: state.color, points: [point] };
    } else {
      state.draft = { type: state.tool, color: state.color, start: point, end: point };
    }

    redrawScene(state);
  };

  const onPointerMove = (event) => {
    if (!state.pointerDown || !state.draft) {
      return;
    }

    const point = canvasPoint(state, event);
    if (!point) {
      return;
    }

    if (state.draft.type === 'draw') {
      state.draft.points.push(point);
    } else {
      state.draft.end = point;
    }

    redrawScene(state);
  };

  const onPointerUp = (event) => {
    if (!state.pointerDown || !state.draft) {
      return;
    }

    state.pointerDown = false;
    state.canvas.releasePointerCapture?.(event.pointerId);

    if (state.draft.type === 'crop') {
      state.cropRect = normalizeRect(state.draft.start, state.draft.end);
      state.draft = null;
      setStatus(state, 'Crop set. Send exports the cropped area.');
      redrawScene(state);
      return;
    }

    if (state.draft.type !== 'draw' || state.draft.points.length > 1) {
      state.actions.push(finalizeAction(state.draft));
    }

    state.draft = null;
    redrawScene(state);
  };

  state.canvas.addEventListener('pointerdown', onPointerDown);
  state.canvas.addEventListener('pointermove', onPointerMove);
  state.canvas.addEventListener('pointerup', onPointerUp);
  state.canvas.addEventListener('pointerleave', onPointerUp);
}

function bindKeyboardEvents(state) {
  const handler = (event) => {
    if (!overlayState) {
      return;
    }

    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      const undoButton = state.toolbar.querySelector('.saga-shot-action');
      undoButton?.click();
      return;
    }

    if (state.textPopover) {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeTextPopover(state);
      }
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      destroyOverlay();
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      void sendScreenshot(state);
      return;
    }

    const key = event.key.toLowerCase();
    if (key === 'd') setTool(state, 'draw');
    if (key === 'a') setTool(state, 'arrow');
    if (key === 'r') setTool(state, 'rect');
    if (key === 't') setTool(state, 'text');
    if (key === 'b') setTool(state, 'blur');
    if (key === 'c') setTool(state, 'crop');

    if (['1', '2', '3', '4'].includes(key)) {
      setColor(state, COLORS[Number(key) - 1]);
    }
  };

  state.keyHandler = handler;
  window.addEventListener('keydown', handler, true);
}

function setTool(state, tool) {
  state.tool = tool;
  for (const [key, button] of state.toolButtons.entries()) {
    button.classList.toggle('active', key === tool);
  }
  setStatus(state, `${TOOL_LABELS[tool]} ready.`);
}

function setColor(state, color) {
  state.color = color;
  for (const button of state.colorButtons) {
    button.classList.toggle('active', button.style.getPropertyValue('--shot-color') === color);
  }
}

function openTextPopover(state, point, clientX, clientY) {
  closeTextPopover(state);

  const popover = document.createElement('div');
  popover.className = 'saga-shot-text-popover';
  popover.style.left = `${Math.max(16, clientX - 120)}px`;
  popover.style.top = `${Math.max(72, clientY - 12)}px`;

  const input = document.createElement('textarea');
  input.className = 'saga-shot-text-input';
  input.placeholder = 'Add label...';

  const row = document.createElement('div');
  row.className = 'saga-shot-text-actions';

  const cancel = actionButton('Cancel', () => closeTextPopover(state));
  const add = actionButton('Add', () => {
    const text = input.value.trim();
    if (!text) {
      closeTextPopover(state);
      return;
    }

    state.actions.push({
      type: 'text',
      color: state.color,
      x: point.x,
      y: point.y,
      text,
    });
    closeTextPopover(state);
    redrawScene(state);
  });
  add.classList.add('primary');

  row.appendChild(cancel);
  row.appendChild(add);

  popover.appendChild(input);
  popover.appendChild(row);
  state.root.appendChild(popover);
  state.textPopover = popover;

  requestAnimationFrame(() => input.focus());
}

function closeTextPopover(state) {
  state.textPopover?.remove();
  state.textPopover = null;
}

function canvasPoint(state, event) {
  const rect = state.canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) {
    return null;
  }

  const x = ((event.clientX - rect.left) / rect.width) * state.canvas.width;
  const y = ((event.clientY - rect.top) / rect.height) * state.canvas.height;
  return {
    x: clamp(x, 0, state.canvas.width),
    y: clamp(y, 0, state.canvas.height),
  };
}

function finalizeAction(action) {
  if (action.type === 'draw') {
    return {
      type: 'draw',
      color: action.color,
      points: [...action.points],
    };
  }

  return {
    ...action,
    start: action.start,
    end: action.end,
  };
}

function normalizeRect(start, end) {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  const width = Math.abs(end.x - start.x);
  const height = Math.abs(end.y - start.y);
  return { x, y, width, height };
}

function redrawScene(state) {
  drawScene(state, state.ctx, {
    showCropOverlay: true,
    includeDraft: true,
  });
}

function drawScene(state, ctx, options = {}) {
  const { showCropOverlay = false, includeDraft = false } = options;
  ctx.clearRect(0, 0, state.canvas.width, state.canvas.height);
  ctx.drawImage(state.image, 0, 0, state.canvas.width, state.canvas.height);

  for (const action of state.actions) {
    drawAction(state, ctx, action);
  }

  if (includeDraft && state.draft) {
    drawAction(state, ctx, state.draft, true);
  }

  if (showCropOverlay) {
    const cropRect = state.draft?.type === 'crop'
      ? normalizeRect(state.draft.start, state.draft.end)
      : state.cropRect;
    if (cropRect) {
      drawCropMask(ctx, cropRect, state.canvas.width, state.canvas.height);
    }
  }
}

function drawAction(state, ctx, action, isDraft = false) {
  switch (action.type) {
    case 'draw':
      drawFreehand(ctx, action, isDraft);
      break;
    case 'arrow':
      drawArrow(ctx, action, isDraft);
      break;
    case 'rect':
      drawRect(ctx, action, isDraft);
      break;
    case 'text':
      drawText(ctx, action);
      break;
    case 'blur':
      drawBlur(state, ctx, action, isDraft);
      break;
    default:
      break;
  }
}

function drawFreehand(ctx, action, isDraft) {
  if (!action.points?.length) {
    return;
  }

  ctx.save();
  ctx.strokeStyle = action.color;
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalAlpha = isDraft ? 0.8 : 1;
  ctx.beginPath();
  ctx.moveTo(action.points[0].x, action.points[0].y);
  for (const point of action.points.slice(1)) {
    ctx.lineTo(point.x, point.y);
  }
  ctx.stroke();
  ctx.restore();
}

function drawArrow(ctx, action, isDraft) {
  const start = action.start;
  const end = action.end;
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const head = 20;

  ctx.save();
  ctx.strokeStyle = action.color;
  ctx.fillStyle = action.color;
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.globalAlpha = isDraft ? 0.8 : 1;
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(end.x, end.y);
  ctx.lineTo(end.x - head * Math.cos(angle - Math.PI / 8), end.y - head * Math.sin(angle - Math.PI / 8));
  ctx.lineTo(end.x - head * Math.cos(angle + Math.PI / 8), end.y - head * Math.sin(angle + Math.PI / 8));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawRect(ctx, action, isDraft) {
  const rect = normalizeRect(action.start, action.end);
  ctx.save();
  ctx.strokeStyle = action.color;
  ctx.lineWidth = 5;
  ctx.globalAlpha = isDraft ? 0.8 : 1;
  ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
  ctx.restore();
}

function drawText(ctx, action) {
  const lines = action.text.split('\n').filter(Boolean);
  if (!lines.length) {
    return;
  }

  ctx.save();
  ctx.font = '600 24px system-ui, sans-serif';
  const widths = lines.map((line) => ctx.measureText(line).width);
  const boxWidth = Math.max(...widths) + 20;
  const lineHeight = 30;
  const boxHeight = lines.length * lineHeight + 14;

  ctx.fillStyle = 'rgba(5, 10, 20, 0.8)';
  roundRect(ctx, action.x - 10, action.y - 26, boxWidth, boxHeight, 10);
  ctx.fill();

  ctx.fillStyle = action.color;
  lines.forEach((line, index) => {
    ctx.fillText(line, action.x, action.y + index * lineHeight);
  });
  ctx.restore();
}

// Intentionally reads from state.image (the original screenshot), not the
// composited canvas. This ensures privacy redaction always blurs the real
// content, even if annotations were drawn over the area first.
function drawBlur(state, ctx, action, isDraft) {
  const rect = normalizeRect(action.start, action.end);
  if (!rect.width || !rect.height) {
    return;
  }

  const temp = document.createElement('canvas');
  temp.width = Math.max(1, Math.round(rect.width / 18));
  temp.height = Math.max(1, Math.round(rect.height / 18));
  const tempCtx = temp.getContext('2d');

  tempCtx.drawImage(
    state.image,
    rect.x,
    rect.y,
    rect.width,
    rect.height,
    0,
    0,
    temp.width,
    temp.height,
  );

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = isDraft ? 0.9 : 1;
  ctx.drawImage(temp, 0, 0, temp.width, temp.height, rect.x, rect.y, rect.width, rect.height);
  ctx.strokeStyle = action.color;
  ctx.lineWidth = 2;
  ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
  ctx.restore();
}

function drawCropMask(ctx, rect, width, height) {
  ctx.save();
  ctx.fillStyle = 'rgba(3, 6, 12, 0.68)';
  ctx.fillRect(0, 0, width, height);
  ctx.clearRect(rect.x, rect.y, rect.width, rect.height);
  ctx.strokeStyle = '#f8fafc';
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 8]);
  ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
  ctx.restore();
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

async function sendScreenshot(state) {
  if (!state.sendButton) {
    return;
  }

  state.sendButton.disabled = true;
  setStatus(state, 'Sending screenshot to Saga…');

  try {
    const dataUrl = exportAnnotatedImage(state);
    const result = await chrome.runtime.sendMessage({
      action: 'send-capture',
      cefNonce: getCefNonce(),
      capture: {
        source: extractDomain(window.location.hostname),
        url: state.sourceUrl,
        title: state.title,
        capture_type: 'screenshot',
        content: `Annotated screenshot from ${state.sourceUrl}`,
        screenshot: dataUrl,
      },
    });

    if (!result?.success) {
      throw new Error(result?.error || 'Saga rejected the screenshot');
    }

    showToast('Screenshot sent to Saga');
    destroyOverlay();
  } catch (error) {
    state.sendButton.disabled = false;
    setStatus(state, error?.message || 'Screenshot upload failed');
  }
}

function exportAnnotatedImage(state) {
  const fullCanvas = document.createElement('canvas');
  fullCanvas.width = state.canvas.width;
  fullCanvas.height = state.canvas.height;
  const fullCtx = fullCanvas.getContext('2d');
  drawScene(state, fullCtx, { showCropOverlay: false, includeDraft: false });

  const crop = state.cropRect || {
    x: 0,
    y: 0,
    width: state.canvas.width,
    height: state.canvas.height,
  };

  const exportCanvas = document.createElement('canvas');
  exportCanvas.width = Math.max(1, Math.round(crop.width));
  exportCanvas.height = Math.max(1, Math.round(crop.height));
  const exportCtx = exportCanvas.getContext('2d');
  exportCtx.drawImage(
    fullCanvas,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    exportCanvas.width,
    exportCanvas.height,
  );

  return exportCanvas.toDataURL('image/webp', 0.92);
}

function setStatus(state, message) {
  state.status.textContent = message;
}

// getCefNonce, extractDomain, showToast provided by content/shared.js

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

async function ensureStyles() {
  if (document.getElementById(OVERLAY_STYLE_ID)) {
    return;
  }

  if (!stylesReadyPromise) {
    stylesReadyPromise = fetch(OVERLAY_STYLE_URL)
      .then((response) => response.text())
      .then((cssText) => {
        if (document.getElementById(OVERLAY_STYLE_ID)) {
          return;
        }
        const style = document.createElement('style');
        style.id = OVERLAY_STYLE_ID;
        style.textContent = cssText;
        document.documentElement.appendChild(style);
      })
      .catch(() => {
        stylesReadyPromise = null;
      });
  }

  await stylesReadyPromise;
}

function destroyOverlay() {
  if (!overlayState) {
    return;
  }

  closeTextPopover(overlayState);
  if (overlayState.keyHandler) {
    window.removeEventListener('keydown', overlayState.keyHandler, true);
  }
  overlayState.root.remove();
  overlayState = null;
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Screenshot image could not be loaded'));
    image.src = dataUrl;
  });
}

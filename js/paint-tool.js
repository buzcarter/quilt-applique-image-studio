/**
 * Paint / Erase overlay tool.
 *
 * Fully encapsulates brush state, canvas interaction, color palette options,
 * and overlay pixel merging. Nothing outside this module writes to the
 * overlay canvas or reads paintState directly.
 *
 * initPaintTool({ onStrokeEnd, onClear })
 *   onStrokeEnd — called after each completed brush stroke
 *   onClear     — called after the overlay is cleared via the Clear button
 */

const _state = {
  mode: 'paint',
  brushSize: 18,
  colorHex: '#2c5f4f',
  colorIndex: null,
  isDrawing: false,
  lastPoint: null,
};

let _paletteOptions = [];
let _onStrokeEnd = null;
let _onClear = null;

// DOM refs — resolved once on init
let _canvas = null;
let _brushCursor = null;
let _paintBtn = null;
let _eraseBtn = null;
let _clearBtn = null;
let _sizeSlider = null;
let _sizeLabel = null;
let _colorSelect = null;
let _colorChip = null;

export function initPaintTool({ onStrokeEnd, onClear }) {
  _onStrokeEnd = onStrokeEnd;
  _onClear = onClear;

  _canvas      = document.getElementById('paintOverlayCanvas');
  _brushCursor = document.getElementById('brushCursor');
  _paintBtn    = document.getElementById('paintModeBtn');
  _eraseBtn    = document.getElementById('eraseModeBtn');
  _clearBtn    = document.getElementById('clearOverlayBtn');
  _sizeSlider  = document.getElementById('brushSize');
  _sizeLabel   = document.getElementById('brushSizeValue');
  _colorSelect = document.getElementById('paintColorSelect');
  _colorChip   = document.getElementById('paintColorChip');

  _updateSizeLabel();
  _setMode('paint');
  refreshPaintColorOptions([]);

  _paintBtn.addEventListener('change', (e) => { e.stopPropagation(); if (_paintBtn.checked) _setMode('paint'); });
  _eraseBtn.addEventListener('change', (e) => { e.stopPropagation(); if (_eraseBtn.checked) _setMode('erase'); });
  _clearBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    clearPaintOverlay();
    _onClear?.();
  });
  _sizeSlider.addEventListener('input', (e) => {
    e.stopPropagation();
    _state.brushSize = parseInt(_sizeSlider.value, 10);
    _updateSizeLabel();
  });
  _colorSelect.addEventListener('change', (e) => { e.stopPropagation(); _applySelectedColor(); });

  // Prevent control interactions from bubbling to canvas/document handlers
  for (const el of [_paintBtn, _eraseBtn, _clearBtn, _sizeSlider, _colorSelect]) {
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    el.addEventListener('click', (e) => e.stopPropagation());
  }

  _canvas.addEventListener('pointerdown', _beginStroke);
  _canvas.addEventListener('pointermove', _continueStroke);
  _canvas.addEventListener('pointermove', _moveCursor);
  _canvas.addEventListener('pointerenter', () => { _brushCursor.hidden = false; });
  _canvas.addEventListener('pointerleave', () => { _brushCursor.hidden = true; });
  _canvas.addEventListener('pointerup', _endStroke);
  _canvas.addEventListener('pointercancel', _endStroke);
}

/** Clears all paint from the overlay canvas without triggering callbacks. */
export function clearPaintOverlay() {
  _canvas.getContext('2d').clearRect(0, 0, _canvas.width, _canvas.height);
}

/** Returns current paint overlay as PNG data URL, or null when unavailable. */
export function getPaintOverlayDataUrl() {
  if (!_canvas || _canvas.width <= 0 || _canvas.height <= 0) return null;
  return _canvas.toDataURL('image/png');
}

/**
 * Restores paint overlay from a PNG data URL.
 * Draws into the current overlay canvas size and returns true on success.
 */
export function restorePaintOverlayFromDataUrl(dataUrl) {
  return new Promise((resolve) => {
    if (!_canvas || !dataUrl || _canvas.width <= 0 || _canvas.height <= 0) {
      resolve(false);
      return;
    }

    const img = new Image();
    img.onload = () => {
      const ctx = _canvas.getContext('2d');
      ctx.clearRect(0, 0, _canvas.width, _canvas.height);
      ctx.drawImage(img, 0, 0, _canvas.width, _canvas.height);
      resolve(true);
    };
    img.onerror = () => resolve(false);
    img.src = dataUrl;
  });
}

/**
 * Resizes the overlay canvas to match a new display size, scaling any
 * existing paint content to fit. No-op if dimensions are unchanged.
 */
export function syncPaintOverlayCanvas(width, height) {
  if (_canvas.width === width && _canvas.height === height) return;

  const snap = document.createElement('canvas');
  snap.width = _canvas.width;
  snap.height = _canvas.height;
  if (snap.width > 0 && snap.height > 0) {
    snap.getContext('2d').drawImage(_canvas, 0, 0);
  }

  _canvas.width = width;
  _canvas.height = height;

  if (snap.width > 0 && snap.height > 0) {
    _canvas.getContext('2d').drawImage(snap, 0, 0, snap.width, snap.height, 0, 0, width, height);
  }
}

/**
 * Rebuilds the paint color dropdown from the current palette.
 * Preserves the previously selected color when possible.
 */
export function refreshPaintColorOptions(palette) {
  const previous = _colorSelect.value;
  _colorSelect.innerHTML = '';

  _paletteOptions = (palette && palette.length > 0)
    ? palette.map((e) => ({ colorIndex: e.colorIndex, overlayHex: e.hex, label: e.fabric?.name || e.hex }))
    : [{ colorIndex: 0, overlayHex: '#2c5f4f', label: 'Default Green' }];

  for (const entry of _paletteOptions) {
    const opt = document.createElement('option');
    opt.value = String(entry.colorIndex);
    opt.textContent = entry.label;
    _colorSelect.appendChild(opt);
  }

  const hasPrev = _paletteOptions.some((e) => String(e.colorIndex) === previous);
  _colorSelect.value = hasPrev ? previous : String(_paletteOptions[0].colorIndex);
  _applySelectedColor();
}

/**
 * Merges the current overlay paint pixels into baseAssignments.
 * Painted pixels replace the underlying color assignment using nearest-
 * neighbor matching against the current palette options.
 *
 * Returns { assignments, hasPaint }.
 */
export function getMergedAssignments(baseAssignments, processingW, processingH) {
  if (!_canvas.width || !_canvas.height) {
    return { assignments: baseAssignments, hasPaint: false };
  }

  const merged = new Uint16Array(baseAssignments);

  const scaled = document.createElement('canvas');
  scaled.width = processingW;
  scaled.height = processingH;
  const sCtx = scaled.getContext('2d');
  sCtx.clearRect(0, 0, processingW, processingH);
  sCtx.imageSmoothingEnabled = true;
  sCtx.drawImage(_canvas, 0, 0, _canvas.width, _canvas.height, 0, 0, processingW, processingH);

  const pixels = sCtx.getImageData(0, 0, processingW, processingH).data;
  let hasPaint = false;

  for (let i = 0; i < merged.length; i++) {
    const off = i * 4;
    if (pixels[off + 3] < 12) continue;
    hasPaint = true;
    merged[i] = _nearestColorIndex(pixels[off], pixels[off + 1], pixels[off + 2]);
  }

  return { assignments: hasPaint ? merged : baseAssignments, hasPaint };
}

// --- Private ---

function _setMode(mode) {
  _state.mode = mode === 'erase' ? 'erase' : 'paint';
  _paintBtn.checked = _state.mode === 'paint';
  _eraseBtn.checked = _state.mode === 'erase';
}

function _updateSizeLabel() {
  _sizeLabel.textContent = `${_sizeSlider.value} px`;
}

function _applySelectedColor() {
  const found = _paletteOptions.find((e) => String(e.colorIndex) === _colorSelect.value)
    || _paletteOptions[0];
  _state.colorIndex = found.colorIndex;
  _state.colorHex = found.overlayHex;
  _colorChip.style.backgroundColor = _state.colorHex;
}

function _getPoint(event) {
  const rect = _canvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * (_canvas.width / rect.width),
    y: (event.clientY - rect.top) * (_canvas.height / rect.height),
  };
}

function _drawSegment(from, to) {
  const ctx = _canvas.getContext('2d');
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = _state.brushSize;
  if (_state.mode === 'erase') {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.strokeStyle = 'rgba(0,0,0,1)';
  } else {
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = _state.colorHex;
  }
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
  ctx.restore();
}

function _beginStroke(event) {
  if (event.button !== 0 && event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
  event.preventDefault();
  event.stopPropagation();
  _state.isDrawing = true;
  _state.lastPoint = _getPoint(event);
  _canvas.setPointerCapture(event.pointerId);
  _drawSegment(_state.lastPoint, _state.lastPoint);
}

function _continueStroke(event) {
  if (!_state.isDrawing) return;
  event.preventDefault();
  event.stopPropagation();
  const next = _getPoint(event);
  _drawSegment(_state.lastPoint, next);
  _state.lastPoint = next;
}

function _endStroke(event) {
  if (!_state.isDrawing) return;
  event.preventDefault();
  event.stopPropagation();
  _state.isDrawing = false;
  _state.lastPoint = null;
  if (_canvas.hasPointerCapture(event.pointerId)) {
    _canvas.releasePointerCapture(event.pointerId);
  }
  _onStrokeEnd?.();
}

function _moveCursor(event) {
  const rect = _canvas.getBoundingClientRect();
  const cssR = (_state.brushSize / 2) * (rect.width / _canvas.width);
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  _brushCursor.style.width = `${cssR * 2}px`;
  _brushCursor.style.height = `${cssR * 2}px`;
  _brushCursor.style.left = `${x - cssR}px`;
  _brushCursor.style.top = `${y - cssR}px`;
}

function _parseHex(hex) {
  const n = String(hex || '').replace('#', '');
  if (n.length !== 6) return [44, 95, 79];
  return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)];
}

function _nearestColorIndex(r, g, b) {
  let best = _paletteOptions[0]?.colorIndex ?? 0;
  let dist = Infinity;
  for (const e of _paletteOptions) {
    const [tr, tg, tb] = _parseHex(e.overlayHex);
    const d = (r - tr) ** 2 + (g - tg) ** 2 + (b - tb) ** 2;
    if (d < dist) { dist = d; best = e.colorIndex; }
  }
  return best;
}

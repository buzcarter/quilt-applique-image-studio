/**
 * Manages the adjustment controls panel.
 *
 * Handles slider label updates, nudge buttons, and debounced callbacks
 * for the two pipeline stages:
 *   onQuantize()    — Stage A change; re-runs k-means (quiltWidth, colors, minPiece)
 *   onPattern()     — Stage B change; re-vectorizes only (curveComplexity, smoothness)
 *   onWidthChange() — immediate (non-debounced) callback when quilt width changes
 */

const _SLIDERS = {
  quiltWidth:      { labelId: 'quiltWidthValue',      format: (v) => `${v}"` },
  colorSlider:     { labelId: 'colorValue',            format: (v) => `${v}` },
  minPieceSize:    { labelId: 'minPieceSizeValue',     format: (v) => `${v}"` },
  curveComplexity: { labelId: 'curveComplexityValue',  format: (v) => `${v}%` },
  smoothness:      { labelId: 'smoothnessValue',       format: (v) => `${v}%` },
};

export function initControlsPanel({ onQuantize, onPattern, onWidthChange }) {
  let quantizeTimer = null;
  let patternTimer = null;

  const debounceQuantize = () => {
    clearTimeout(quantizeTimer);
    quantizeTimer = setTimeout(onQuantize, 150);
  };

  const debouncePattern = () => {
    clearTimeout(patternTimer);
    patternTimer = setTimeout(onPattern, 80);
  };

  // Nudge (+/-) buttons that flank each slider
  document.querySelectorAll('.slider-step-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const slider = document.getElementById(btn.dataset.target);
      const dir = parseInt(btn.dataset.direction, 10);
      if (!slider || Number.isNaN(dir)) return;
      _nudge(slider, dir);
    });
  });

  // quiltWidth: update dimensions immediately, then debounce quantize
  const quiltWidthEl = document.getElementById('quiltWidth');
  quiltWidthEl.addEventListener('input', () => {
    _updateLabel(quiltWidthEl);
    onWidthChange?.();
    debounceQuantize();
  });

  // Remaining Stage A sliders
  _bindSlider('colorSlider', debounceQuantize);
  _bindSlider('minPieceSize', debounceQuantize);

  // Stage B sliders
  _bindSlider('curveComplexity', debouncePattern);
  _bindSlider('smoothness', debouncePattern);
}

/** Returns current values for all controls as a plain object. */
export function getControlValues() {
  return {
    numColors:       parseInt(document.getElementById('colorSlider').value, 10),
    quiltWidth:      parseInt(document.getElementById('quiltWidth').value, 10),
    minPieceSize:    parseFloat(document.getElementById('minPieceSize').value),
    curveComplexity: parseInt(document.getElementById('curveComplexity').value, 10),
    smoothness:      parseInt(document.getElementById('smoothness').value, 10),
  };
}

/** Resets all sliders to their HTML default values and refreshes their labels. */
export function resetControlValues() {
  for (const id of Object.keys(_SLIDERS)) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.value = el.defaultValue;
    _updateLabel(el);
  }
}

/** Restores slider values from a saved session and refreshes their labels. */
export function restoreControlValues(session) {
  const restore = [
    ['colorSlider',     session.numColors],
    ['quiltWidth',      session.quiltWidth],
    ['minPieceSize',    session.minPieceSize],
    ['curveComplexity', session.curveComplexity],
    ['smoothness',      session.smoothness],
  ];
  for (const [id, value] of restore) {
    if (value == null) continue;
    const el = document.getElementById(id);
    if (!el) continue;
    el.value = value;
    _updateLabel(el);
  }
}

/** Sets the quilt dimensions hint text below the quilt-width slider. */
export function setQuiltDimensionsText(text) {
  const el = document.getElementById('quiltDimensions');
  if (el) el.textContent = text;
}

// --- Private ---

function _bindSlider(id, callback) {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('input', () => {
    _updateLabel(el);
    callback();
  });
}

function _updateLabel(slider) {
  const cfg = _SLIDERS[slider.id];
  if (!cfg) return;
  const label = document.getElementById(cfg.labelId);
  if (label) label.textContent = cfg.format(slider.value);
}

function _nudge(slider, direction) {
  const min = parseFloat(slider.min);
  const max = parseFloat(slider.max);
  const step = parseFloat(slider.step || '1');
  const decimalPlaces = (slider.step.split('.')[1] || '').length;
  const next = Math.min(max, Math.max(min, parseFloat(slider.value) + step * direction));
  slider.value = next.toFixed(decimalPlaces);
  slider.dispatchEvent(new Event('input', { bubbles: true }));
}

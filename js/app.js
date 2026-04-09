/**
 * Main application: orchestrates the quilting pipeline.
 *
 * Processing pipeline (order of operations):
 * 1. CROP — user selects region of interest (original always retained for re-crop)
 * 2. QUILT SIZE — user sets width in inches; height derived from crop aspect ratio
 * 3. COLOR QUANTIZATION — reduce to N fabric colors using k-means in CIELAB space
 * 4. REGION MERGING — absorb isolated regions below the minimum piece threshold
 * 5. FABRIC MATCHING — map quantized colors to nearest Kona Cotton Solid
 * 6. DISPLAY — show pattern preview + fabric shopping list
 *
 * Future steps (not yet implemented):
 * - EDGE SMOOTHING — contour simplification for organic shapes
 * - SVG OUTPUT — vector paths per fabric region (the real deliverable)
 */
import { CropTool } from './crop-tool.js';
import { quantizeColors, mergeSmallRegions } from './image-processing.js';
import { loadFabricLibrary, matchPaletteToFabrics } from './fabric-matcher.js';
import { generatePatternSVG } from './svg-tracer.js';
import { exportPdf } from './pdf-export.js';
import { saveSession, loadSession } from './session.js';

// State
let originalImage = null;
let originalDataUrl = null;
let cropTool = null;
let currentCrop = null;
let currentPalette = [];
let currentTotalPieces = 0;
let currentPatternRender = null;
let currentPatternSvgMarkup = '';
let currentSimplifiedResult = null; // cached quantization; only cleared by crop/size/color changes

function chooseBackgroundColorIndex(palette) {
  if (!palette || palette.length === 0) return null;

  const sorted = [...palette].sort((a, b) => {
    const aPixels = Number(a.pixelCount || 0);
    const bPixels = Number(b.pixelCount || 0);
    if (bPixels !== aPixels) return bPixels - aPixels;

    const aPercent = Number(a.percentage || 0);
    const bPercent = Number(b.percentage || 0);
    if (bPercent !== aPercent) return bPercent - aPercent;

    const aLabel = String(a.fabric?.name || a.hex || '').toLowerCase();
    const bLabel = String(b.fabric?.name || b.hex || '').toLowerCase();
    return aLabel.localeCompare(bLabel);
  });

  return sorted[0]?.colorIndex ?? null;
}

// DOM refs
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const cropSection = document.getElementById('cropSection');
const cropCanvas = document.getElementById('cropCanvas');
const resetCropBtn = document.getElementById('resetCropBtn');
const applyCropBtn = document.getElementById('applyCropBtn');
const recropBtn = document.getElementById('recropBtn');
const controls = document.getElementById('controls');
const canvasContainer = document.getElementById('canvasContainer');
const originalCanvas = document.getElementById('originalCanvas');
const patternCanvas = document.getElementById('patternCanvas');
const paletteSection = document.getElementById('palette');
const downloadBtn = document.getElementById('downloadBtn');
const actionButtons = document.getElementById('actionButtons');
const colorSlider = document.getElementById('colorSlider');
const colorValue = document.getElementById('colorValue');
const quiltWidth = document.getElementById('quiltWidth');
const quiltWidthValue = document.getElementById('quiltWidthValue');
const quiltDimensions = document.getElementById('quiltDimensions');
const minPieceSize = document.getElementById('minPieceSize');
const minPieceSizeValue = document.getElementById('minPieceSizeValue');
const curveComplexity = document.getElementById('curveComplexity');
const curveComplexityValue = document.getElementById('curveComplexityValue');
const smoothness = document.getElementById('smoothness');
const smoothnessValue = document.getElementById('smoothnessValue');
const fabricStatus = document.getElementById('fabricStatus');

// --- Init ---
async function init() {
  try {
    const fabrics = await loadFabricLibrary('kona-colors.json');
    fabricStatus.textContent = `Loaded ${fabrics.length} Kona Cotton Solids`;
  } catch (err) {
    fabricStatus.textContent = 'Could not load fabric library';
    console.error('Failed to load fabric library:', err);
  }

  setupUpload();
  setupControls();
  setupCropPresets();
  setupButtons();
  setupPanelLayout();
  restoreSession();
}

// --- Session ---
function restoreSession() {
  const session = loadSession();
  if (!session || !session.imageDataUrl) return;

  const img = new Image();
  img.onload = () => {
    originalImage = img;
    originalDataUrl = session.imageDataUrl;

    if (session.numColors) {
      colorSlider.value = session.numColors;
      colorValue.textContent = session.numColors;
    }
    if (session.quiltWidth) {
      quiltWidth.value = session.quiltWidth;
      quiltWidthValue.textContent = session.quiltWidth + '"';
    }
    if (session.minPieceSize) {
      minPieceSize.value = session.minPieceSize;
      minPieceSizeValue.textContent = session.minPieceSize + '"';
    }
    if (session.curveComplexity !== undefined) {
      curveComplexity.value = session.curveComplexity;
      curveComplexityValue.textContent = session.curveComplexity + '%';
    }
    if (session.smoothness !== undefined) {
      smoothness.value = session.smoothness;
      smoothnessValue.textContent = session.smoothness + '%';
    }

    if (session.crop) {
      currentCrop = session.crop;
      applyCrop();
    } else {
      showCropStep();
    }
  };
  img.src = session.imageDataUrl;
}

function persistSession() {
  if (!originalDataUrl) return;
  saveSession({
    imageDataUrl: originalDataUrl,
    crop: currentCrop,
    numColors: parseInt(colorSlider.value),
    quiltWidth: parseInt(quiltWidth.value),
    minPieceSize: parseFloat(minPieceSize.value),
    curveComplexity: parseInt(curveComplexity.value),
    smoothness: parseInt(smoothness.value),
  });
}

// --- Upload ---
function setupUpload() {
  uploadArea.addEventListener('click', () => fileInput.click());

  uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('dragging');
  });

  uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('dragging');
  });

  uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragging');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) loadImage(file);
  });

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) loadImage(file);
  });
}

function loadImage(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      originalImage = img;
      originalDataUrl = e.target.result;
      showCropStep();
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

// --- Crop Step ---
function showCropStep() {
  uploadArea.classList.add('hidden');
  cropSection.classList.remove('hidden');
  controls.classList.add('hidden');
  canvasContainer.classList.add('hidden');
  paletteSection.classList.add('hidden');
  actionButtons.classList.add('hidden');

  // Reset preset buttons to "Free"
  document.querySelectorAll('.crop-preset-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.ratio === 'free');
  });

  if (cropTool) cropTool.destroy();
  cropTool = new CropTool(cropCanvas, originalImage, (crop) => {
    currentCrop = crop;
  });
  currentCrop = cropTool.getCrop();
}

function applyCrop() {
  cropSection.classList.add('hidden');
  controls.classList.remove('hidden');
  canvasContainer.classList.remove('hidden');
  paletteSection.classList.remove('hidden');
  actionButtons.classList.remove('hidden');
  recropBtn.classList.remove('hidden');
  downloadBtn.classList.remove('hidden');
  updateQuiltDimensions();
  persistSession();
  processQuantization();
}

// --- Crop Presets ---
function setupCropPresets() {
  document.querySelectorAll('.crop-preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.crop-preset-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const ratio = btn.dataset.ratio;
      if (cropTool) {
        cropTool.setAspectRatio(ratio === 'free' ? null : 1);
      }
    });
  });
}

// --- Controls ---
function setupControls() {
  // Slow sliders: re-run full quantization pipeline (k-means + merge + SVG)
  let quantizeTimer = null;
  const debounceQuantize = () => {
    clearTimeout(quantizeTimer);
    quantizeTimer = setTimeout(() => {
      if (originalImage && currentCrop) {
        processQuantization();
        persistSession();
      }
    }, 150);
  };

  // Fast sliders: only regenerate SVG from cached assignments — deterministic
  let patternTimer = null;
  const debouncePattern = () => {
    clearTimeout(patternTimer);
    patternTimer = setTimeout(() => {
      if (currentSimplifiedResult) {
        processPattern();
        persistSession();
      }
    }, 80);
  };

  const nudgeSlider = (slider, direction) => {
    const min = parseFloat(slider.min);
    const max = parseFloat(slider.max);
    const step = parseFloat(slider.step || '1');
    const currentValue = parseFloat(slider.value);
    const decimalPlaces = (slider.step.split('.')[1] || '').length;
    const nextValue = Math.min(max, Math.max(min, currentValue + (step * direction)));

    slider.value = nextValue.toFixed(decimalPlaces);
    slider.dispatchEvent(new Event('input', { bubbles: true }));
  };

  document.querySelectorAll('.slider-step-btn').forEach(button => {
    button.addEventListener('click', () => {
      const sliderId = button.dataset.target;
      const direction = parseInt(button.dataset.direction, 10);
      const slider = document.getElementById(sliderId);
      if (!slider || Number.isNaN(direction)) return;
      nudgeSlider(slider, direction);
    });
  });

  // These sliders change pixel data → must re-quantize
  quiltWidth.addEventListener('input', () => {
    quiltWidthValue.textContent = quiltWidth.value + '"';
    updateQuiltDimensions();
    debounceQuantize();
  });

  colorSlider.addEventListener('input', () => {
    colorValue.textContent = colorSlider.value;
    debounceQuantize();
  });

  minPieceSize.addEventListener('input', () => {
    minPieceSizeValue.textContent = minPieceSize.value + '"';
    debounceQuantize();
  });

  // These sliders only change SVG generation → reuse cached assignments
  curveComplexity.addEventListener('input', () => {
    curveComplexityValue.textContent = curveComplexity.value + '%';
    debouncePattern();
  });

  smoothness.addEventListener('input', () => {
    smoothnessValue.textContent = smoothness.value + '%';
    debouncePattern();
  });
}

/** Show computed quilt height based on crop ratio and chosen width */
function updateQuiltDimensions() {
  if (!currentCrop) return;
  const widthInches = parseInt(quiltWidth.value);
  const aspectRatio = currentCrop.h / currentCrop.w;
  const heightInches = Math.round(widthInches * aspectRatio);
  quiltDimensions.textContent = `Pattern will be ${widthInches}" × ${heightInches}"`;
}

// --- Processing Pipeline ---

/**
 * Stage 1 — runs k-means quantization and region merging.
 * Triggered by: quiltWidth, colorSlider, minPieceSize, or a new crop.
 * Updates the Simplified canvas and caches result in currentSimplifiedResult.
 * Always calls processPattern() afterwards.
 */
function processQuantization() {
  if (!originalImage || !currentCrop) return;

  const numColors = parseInt(colorSlider.value);
  const widthInches = parseInt(quiltWidth.value);
  const pieceSize = parseFloat(minPieceSize.value);

  // Step 1: Extract cropped region
  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = currentCrop.w;
  srcCanvas.height = currentCrop.h;
  const srcCtx = srcCanvas.getContext('2d');
  srcCtx.drawImage(
    originalImage,
    currentCrop.x, currentCrop.y, currentCrop.w, currentCrop.h,
    0, 0, currentCrop.w, currentCrop.h
  );

  // Step 2: Choose a processing resolution that preserves contours.
  const processingW = Math.min(currentCrop.w, Math.max(320, Math.min(1200, Math.round(widthInches * 24))));
  const aspectRatio = currentCrop.h / currentCrop.w;
  const processingH = Math.max(4, Math.round(processingW * aspectRatio));

  // Step 3: Display original (cropped) at screen resolution
  const maxDisplayWidth = 400;
  const displayScale = Math.min(maxDisplayWidth / currentCrop.w, 1);
  const displayW = Math.floor(currentCrop.w * displayScale);
  const displayH = Math.floor(currentCrop.h * displayScale);

  originalCanvas.width = displayW;
  originalCanvas.height = displayH;
  originalCanvas.getContext('2d').drawImage(srcCanvas, 0, 0, displayW, displayH);

  // Step 4: Quantize at a higher resolution, then merge tiny isolated regions.
  const workCanvas = document.createElement('canvas');
  workCanvas.width = processingW;
  workCanvas.height = processingH;
  const workCtx = workCanvas.getContext('2d');
  workCtx.imageSmoothingEnabled = true;
  workCtx.drawImage(srcCanvas, 0, 0, processingW, processingH);

  const imageData = workCtx.getImageData(0, 0, processingW, processingH);
  const quantized = quantizeColors(imageData, numColors);
  const pixelsPerInch = processingW / widthInches;
  const minimumRegionPixels = Math.max(1, Math.round((pieceSize * pixelsPerInch) ** 2));
  const simplified = mergeSmallRegions(quantized, minimumRegionPixels);

  // Step 5: Render pattern preview with smoothed scaling for organic boundaries.
  const processedCanvas = document.createElement('canvas');
  processedCanvas.width = processingW;
  processedCanvas.height = processingH;
  processedCanvas.getContext('2d').putImageData(simplified.imageData, 0, 0);

  currentPatternRender = {
    processedCanvas,
    assignments: simplified.assignments,
    processingW,
    processingH,
    displayW,
    displayH,
    maskCache: new Map(),
  };
  renderPatternPreview(null);

  // Resolve fabric names so background tie-break uses human-readable names
  const matchedPalette = matchPaletteToFabrics(simplified.palette);
  const backgroundColorIndex = chooseBackgroundColorIndex(matchedPalette);

  // Cache everything processPattern() needs
  currentSimplifiedResult = {
    assignments: simplified.assignments,
    processingW,
    processingH,
    palette: simplified.palette,
    matchedPalette,
    backgroundColorIndex,
  };

  processPattern();
}

/**
 * Stage 2 — generates the SVG Pattern from cached Simplified data.
 * Triggered by: curveComplexity, smoothness (or after processQuantization).
 * Pure and deterministic: same inputs always produce the same SVG.
 * Does NOT touch the Simplified canvas or re-run k-means.
 */
function processPattern() {
  if (!currentSimplifiedResult) return;

  const { assignments, processingW, processingH, palette, matchedPalette, backgroundColorIndex } =
    currentSimplifiedResult;

  const curveComplexityAmt = parseInt(curveComplexity.value, 10);
  const smoothnessAmt = parseInt(smoothness.value, 10);

  const svgContainer = document.getElementById('svgContainer');
  const svgResult = generatePatternSVG(
    assignments,
    processingW,
    processingH,
    palette,
    {
      backgroundColorIndex,
      curveComplexity: curveComplexityAmt,
      smoothness: smoothnessAmt,
    }
  );
  currentPatternSvgMarkup = svgResult.svg;
  svgContainer.innerHTML = svgResult.svg;

  currentPalette = matchedPalette.map((entry) => ({
    ...entry,
    pieceCount: svgResult.pieceCounts.get(entry.colorIndex) || 0,
    isBackground: entry.colorIndex === backgroundColorIndex,
  }));
  currentTotalPieces = svgResult.totalPieces;
  displayPalette(currentPalette, currentTotalPieces);
}

function displayPalette(palette, totalPieces) {
  document.getElementById('paletteCount').textContent = palette.length;
  document.getElementById('pieceCount').textContent = totalPieces;
  document.getElementById('patternPanelFabricCount').textContent = palette.length;
  document.getElementById('patternPanelPieceCount').textContent = totalPieces;
  const container = document.getElementById('colorSwatches');
  container.innerHTML = '';

  for (const color of palette) {
    const swatch = document.createElement('div');
    swatch.className = 'color-swatch';
    if (color.isBackground) {
      swatch.classList.add('color-swatch--background');
    }
    swatch.tabIndex = 0;
    swatch.dataset.colorIndex = String(color.colorIndex);

    if (!color.isBackground) {
      swatch.addEventListener('mouseenter', () => {
        renderPatternPreview(color.colorIndex);
        highlightSVGColor(color.colorIndex);
      });
      swatch.addEventListener('mouseleave', () => {
        renderPatternPreview(null);
        highlightSVGColor(null);
      });
      swatch.addEventListener('focus', () => {
        renderPatternPreview(color.colorIndex);
        highlightSVGColor(color.colorIndex);
      });
      swatch.addEventListener('blur', () => {
        renderPatternPreview(null);
        highlightSVGColor(null);
      });
    }

    if (color.fabric) {
      swatch.innerHTML = `
        <div class="color-box" style="background-color: ${color.fabric.hex}"></div>
        <div class="color-info">
          <div class="fabric-name-row">
            <div class="fabric-name">${color.fabric.name}</div>
            ${color.isBackground ? '<span class="swatch-role-badge">Background</span>' : ''}
          </div>
          <div class="fabric-details">
            <span class="fabric-number">${color.fabric.number}</span>
            <span class="fabric-sep">·</span>
            <span class="color-percent">${color.percentage}%</span>
            ${color.isBackground ? '' : `<span class="fabric-sep">·</span><span class="color-pieces">${formatPieceCount(color.pieceCount)}</span>`}
          </div>
          <div class="fabric-match-bar">
            <span class="match-swatch" style="background-color: ${color.hex}" title="Image color ${color.hex}"></span>
            <span class="match-arrow">→</span>
            <span class="match-swatch" style="background-color: ${color.fabric.hex}" title="Kona ${color.fabric.name} ${color.fabric.hex}"></span>
            <span class="match-delta" title="Color difference (lower = closer match)">Δ${color.fabric.distance}</span>
          </div>
        </div>
      `;
    } else {
      swatch.innerHTML = `
        <div class="color-box" style="background-color: ${color.hex}"></div>
        <div class="color-info">
          <div class="fabric-name-row">
            <div class="color-hex">${color.hex}</div>
            ${color.isBackground ? '<span class="swatch-role-badge">Background</span>' : ''}
          </div>
          <div class="color-percent">${color.isBackground ? `${color.percentage}%` : `${color.percentage}% · ${formatPieceCount(color.pieceCount)}`}</div>
        </div>
      `;
    }

    container.appendChild(swatch);
  }
}

function formatPieceCount(pieceCount) {
  return `${pieceCount} ${pieceCount === 1 ? 'piece' : 'pieces'}`;
}

function renderPatternPreview(activeColorIndex) {
  if (!currentPatternRender) return;

  const { processedCanvas, processingW, processingH, displayW, displayH } = currentPatternRender;
  patternCanvas.width = displayW;
  patternCanvas.height = displayH;

  const patternCtx = patternCanvas.getContext('2d');
  patternCtx.clearRect(0, 0, displayW, displayH);

  if (activeColorIndex === null || activeColorIndex === undefined) {
    patternCtx.imageSmoothingEnabled = true;
    patternCtx.drawImage(processedCanvas, 0, 0, processingW, processingH, 0, 0, displayW, displayH);
    return;
  }

  patternCtx.imageSmoothingEnabled = true;
  patternCtx.filter = 'grayscale(1) contrast(0.5) brightness(1.2)';
  patternCtx.drawImage(processedCanvas, 0, 0, processingW, processingH, 0, 0, displayW, displayH);
  patternCtx.filter = 'none';

  const selectedLayer = document.createElement('canvas');
  selectedLayer.width = displayW;
  selectedLayer.height = displayH;
  const selectedCtx = selectedLayer.getContext('2d');
  selectedCtx.imageSmoothingEnabled = true;
  selectedCtx.drawImage(processedCanvas, 0, 0, processingW, processingH, 0, 0, displayW, displayH);

  const maskCanvas = getSelectedMaskCanvas(activeColorIndex);
  selectedCtx.globalCompositeOperation = 'destination-in';
  selectedCtx.imageSmoothingEnabled = false;
  selectedCtx.drawImage(maskCanvas, 0, 0, processingW, processingH, 0, 0, displayW, displayH);
  selectedCtx.globalCompositeOperation = 'source-over';

  patternCtx.drawImage(selectedLayer, 0, 0);
}

function getSelectedMaskCanvas(colorIndex) {
  if (currentPatternRender.maskCache.has(colorIndex)) {
    return currentPatternRender.maskCache.get(colorIndex);
  }

  const { assignments, processingW, processingH } = currentPatternRender;
  const maskData = new Uint8ClampedArray(assignments.length * 4);

  for (let i = 0; i < assignments.length; i++) {
    if (assignments[i] !== colorIndex) continue;
    const off = i * 4;
    maskData[off] = 255;
    maskData[off + 1] = 255;
    maskData[off + 2] = 255;
    maskData[off + 3] = 255;
  }

  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = processingW;
  maskCanvas.height = processingH;
  maskCanvas.getContext('2d').putImageData(new ImageData(maskData, processingW, processingH), 0, 0);

  currentPatternRender.maskCache.set(colorIndex, maskCanvas);
  return maskCanvas;
}

function highlightSVGColor(activeColorIndex) {
  const container = document.getElementById('svgContainer');
  if (!container) return;

  if (activeColorIndex === null || activeColorIndex === undefined) {
    container.classList.remove('highlight');
    for (const path of container.querySelectorAll('path.active')) {
      path.classList.remove('active');
    }
    return;
  }

  container.classList.add('highlight');
  for (const path of container.querySelectorAll('path')) {
    path.classList.toggle('active', path.dataset.colorIndex === String(activeColorIndex));
  }
}

// --- Panel Layout (sidebar + hero) ---
let currentHeroPanel = 'pattern';

function setupPanelLayout() {
  const panels = canvasContainer.querySelectorAll('.canvas-wrapper[data-panel]');
  for (const panel of panels) {
    panel.addEventListener('click', () => {
      promoteToHero(panel.dataset.panel);
    });
  }
  promoteToHero(currentHeroPanel);
}

function promoteToHero(panelName) {
  currentHeroPanel = panelName;
  const sidebar = document.getElementById('panelSidebar');
  const hero = document.getElementById('panelHero');
  const panels = Array.from(canvasContainer.querySelectorAll('.canvas-wrapper[data-panel]'));

  // Sort non-hero panels by their original order
  const sidebarPanels = panels
    .filter(p => p.dataset.panel !== panelName)
    .sort((a, b) => +a.dataset.order - +b.dataset.order);

  const heroPanel = panels.find(p => p.dataset.panel === panelName);

  // Move panels into their containers
  sidebar.replaceChildren(...sidebarPanels);
  hero.replaceChildren(heroPanel);
}

// --- Buttons ---
function setupButtons() {
  resetCropBtn.addEventListener('click', () => {
    if (cropTool) cropTool.resetCrop();
  });

  applyCropBtn.addEventListener('click', applyCrop);
  recropBtn.addEventListener('click', () => showCropStep());

  downloadBtn.addEventListener('click', () => {
    const quiltWidthInches = parseInt(quiltWidth.value, 10);
    const quiltHeightInches = currentCrop
      ? Math.round(quiltWidthInches * (currentCrop.h / currentCrop.w))
      : null;

    exportPdf(document.getElementById('svgContainer'), currentPalette, {
      svgMarkup: currentPatternSvgMarkup,
      quiltWidthInches,
      quiltHeightInches,
    });
  });
}

// --- Go ---
init();

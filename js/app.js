/**
 * Main application — orchestrates the quilting pipeline.
 *
 * This module scaffolds and wires together submodules. It owns app-level
 * state and the two pipeline stages; all rendering and DOM mutation is
 * delegated to the appropriate submodule.
 *
 * Processing pipeline (order of operations):
 * 1. CROP — user selects region of interest (original always retained for re-crop)
 * 2. QUILT SIZE — user sets width in inches; height derived from crop aspect ratio
 * 3. COLOR QUANTIZATION — reduce to N fabric colors using k-means in CIELAB space
 * 4. REGION MERGING — absorb isolated regions below the minimum piece threshold
 * 5. FABRIC MATCHING — map quantized colors to nearest Kona Cotton Solid
 * 6. DISPLAY — show pattern preview + fabric shopping list
 */
import { CropTool } from './crop-tool.js';
import { quantizeColors, mergeSmallRegions } from './image-processing.js';
import { loadFabricLibrary, matchPaletteToFabrics, getFabricLibrary } from './fabric-matcher.js';
import { generatePatternSVG } from './svg-tracer.js';
import { exportPdf } from './pdf-export.js';
import { saveSession, loadSession } from './session.js';
import { initUpload } from './upload.js';
import { initControlsPanel, getControlValues, restoreControlValues, resetControlValues, setQuiltDimensionsText } from './controls-panel.js';
import {
  initPaintTool,
  clearPaintOverlay,
  syncPaintOverlayCanvas,
  refreshPaintColorOptions,
  getMergedAssignments,
  getPaintOverlayDataUrl,
  restorePaintOverlayFromDataUrl,
} from './paint-tool.js';
import { renderPalette } from './palette-view.js';
import { initPanelLayout } from './panel-layout.js';
import { rgbToLab, deltaE } from './color-science.js';
import { initFabricPicker, openFabricPicker } from './fabric-picker.js';

// --- App state ---
let originalImage = null;
let originalDataUrl = null;
let cropTool = null;
let currentCrop = null;
let currentPalette = [];
let currentTotalPieces = 0;
let currentPatternRender = null;
let currentPatternSvgMarkup = '';
let currentSimplifiedResult = null; // cached quantization; only cleared by crop/size/color changes
let pendingPaintOverlayDataUrl = null;

// DOM refs used by the orchestration layer only
const uploadArea      = document.getElementById('uploadArea');
const cancelUploadRow = document.getElementById('cancelUploadRow');
const newProjectArea  = document.getElementById('newProjectArea');
const cropSection     = document.getElementById('cropSection');
const cropCanvas      = document.getElementById('cropCanvas');
const controls        = document.getElementById('controls');
const canvasContainer = document.getElementById('canvasContainer');
const originalCanvas  = document.getElementById('originalCanvas');
const patternCanvas   = document.getElementById('patternCanvas');
const paletteSection  = document.getElementById('palette');
const actionButtons   = document.getElementById('actionButtons');
const recropBtn       = document.getElementById('recropBtn');
const downloadBtn     = document.getElementById('downloadBtn');
const fabricStatus    = document.getElementById('fabricStatus');

// --- Init ---
async function init() {
  try {
    const fabrics = await loadFabricLibrary('colors-data/kona-colors.json');
    fabricStatus.textContent = `Loaded ${fabrics.length} Kona Cotton Solids`;
  } catch (err) {
    fabricStatus.textContent = 'Could not load fabric library';
    console.error('Failed to load fabric library:', err);
  }

  initUpload((img, dataUrl) => {
    const isNewProject = !!originalImage;
    originalImage = img;
    originalDataUrl = dataUrl;
    if (isNewProject) {
      resetControlValues();
      clearPaintOverlay();
      currentSimplifiedResult = null;
      currentPatternRender = null;
    }
    showCropStep();
  });

  initControlsPanel({
    onQuantize:   () => { if (originalImage && currentCrop) { _updateQuiltDimensions(); processQuantization(); persistSession(); } },
    onPattern:    () => { if (currentSimplifiedResult) { processPattern(); persistSession(); } },
    onWidthChange: () => _updateQuiltDimensions(),
  });

  initPaintTool({
    onStrokeEnd: () => {
      if (currentSimplifiedResult) processPattern();
      persistSession();
    },
    onClear: () => {
      if (currentSimplifiedResult) processPattern();
      persistSession();
    },
  });

  _setupCropPresets();
  _setupButtons();
  initPanelLayout(canvasContainer);
  initFabricPicker({
    getLibrary: () => getFabricLibrary(),
    onSelect: (colorIndex, fabric) => {
      _overrideMatchedFabric(colorIndex, fabric);
    },
  });
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
    pendingPaintOverlayDataUrl = session.paintOverlayDataUrl || null;
    restoreControlValues(session);
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
  const { numColors, quiltWidth, minPieceSize, curveComplexity, smoothness } = getControlValues();
  saveSession({
    imageDataUrl: originalDataUrl,
    paintOverlayDataUrl: getPaintOverlayDataUrl(),
    crop: currentCrop,
    numColors,
    quiltWidth,
    minPieceSize,
    curveComplexity,
    smoothness,
  });
}

// --- Flow ---
function showCropStep() {
  uploadArea.classList.add('hidden');
  cancelUploadRow.classList.add('hidden');
  newProjectArea.classList.add('hidden');
  cropSection.classList.remove('hidden');
  controls.classList.add('hidden');
  canvasContainer.classList.add('hidden');
  paletteSection.classList.add('hidden');
  actionButtons.classList.add('hidden');

  document.querySelectorAll('.crop-preset-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.ratio === 'free');
  });

  if (cropTool) cropTool.destroy();
  clearPaintOverlay();
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
  newProjectArea.classList.remove('hidden');
  _updateQuiltDimensions();
  persistSession();
  processQuantization();
}

function _setupCropPresets() {
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

// --- Helpers ---

function _updateQuiltDimensions() {
  if (!currentCrop) return;
  const { quiltWidth } = getControlValues();
  const h = Math.round(quiltWidth * (currentCrop.h / currentCrop.w));
  setQuiltDimensionsText(`Pattern will be ${quiltWidth}" × ${h}"`);
}

function _chooseBackgroundColorIndex(palette) {
  if (!palette || palette.length === 0) return null;
  return [...palette].sort((a, b) => {
    if (b.pixelCount !== a.pixelCount) return b.pixelCount - a.pixelCount;
    if (b.percentage !== a.percentage) return b.percentage - a.percentage;
    const aLabel = String(a.fabric?.name || a.hex || '').toLowerCase();
    const bLabel = String(b.fabric?.name || b.hex || '').toLowerCase();
    return aLabel.localeCompare(bLabel);
  })[0]?.colorIndex ?? null;
}

function _buildPaletteFromAssignments(assignments, palette, matchedPalette) {
  const total = assignments.length;
  const counts = new Map(palette.map((e) => [e.colorIndex, 0]));
  for (const ci of assignments) counts.set(ci, (counts.get(ci) || 0) + 1);
  const update = (list) =>
    list
      .map((e) => {
        const pixelCount = counts.get(e.colorIndex) || 0;
        return { ...e, pixelCount, percentage: ((pixelCount / total) * 100).toFixed(1) };
      })
      .sort((a, b) => b.pixelCount - a.pixelCount);
  return { updatedPalette: update(palette), updatedMatchedPalette: update(matchedPalette) };
}

// --- Pipeline ---

/**
 * Stage 1 — runs k-means quantization and region merging.
 * Triggered by: quiltWidth, colorSlider, minPieceSize, or a new crop.
 */
async function processQuantization() {
  if (!originalImage || !currentCrop) return;

  const { numColors, quiltWidth, minPieceSize } = getControlValues();

  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = currentCrop.w;
  srcCanvas.height = currentCrop.h;
  srcCanvas.getContext('2d').drawImage(
    originalImage, currentCrop.x, currentCrop.y, currentCrop.w, currentCrop.h,
    0, 0, currentCrop.w, currentCrop.h);

  const processingW = Math.min(currentCrop.w, Math.max(320, Math.min(1200, Math.round(quiltWidth * 24))));
  const aspectRatio = currentCrop.h / currentCrop.w;
  const processingH = Math.max(4, Math.round(processingW * aspectRatio));

  const displayScale = Math.min(400 / currentCrop.w, 1);
  const displayW = Math.floor(currentCrop.w * displayScale);
  const displayH = Math.floor(currentCrop.h * displayScale);

  originalCanvas.width = displayW;
  originalCanvas.height = displayH;
  originalCanvas.getContext('2d').drawImage(srcCanvas, 0, 0, displayW, displayH);

  const workCanvas = document.createElement('canvas');
  workCanvas.width = processingW;
  workCanvas.height = processingH;
  const workCtx = workCanvas.getContext('2d');
  workCtx.imageSmoothingEnabled = true;
  workCtx.drawImage(srcCanvas, 0, 0, processingW, processingH);

  const imageData = workCtx.getImageData(0, 0, processingW, processingH);
  const quantized = quantizeColors(imageData, numColors);
  const pxPerInch = processingW / quiltWidth;
  const minRegionPx = Math.max(1, Math.round((minPieceSize * pxPerInch) ** 2));
  const simplified = mergeSmallRegions(quantized, minRegionPx);

  const processedCanvas = document.createElement('canvas');
  processedCanvas.width = processingW;
  processedCanvas.height = processingH;
  processedCanvas.getContext('2d').putImageData(simplified.imageData, 0, 0);

  currentPatternRender = { processedCanvas, assignments: simplified.assignments, processingW, processingH, displayW, displayH, maskCache: new Map() };
  renderPatternPreview(null);

  const matchedPalette = matchPaletteToFabrics(simplified.palette);
  const backgroundColorIndex = _chooseBackgroundColorIndex(matchedPalette);

  currentSimplifiedResult = { assignments: simplified.assignments, processingW, processingH, pxPerInch, palette: simplified.palette, matchedPalette, backgroundColorIndex };

  if (pendingPaintOverlayDataUrl) {
    await restorePaintOverlayFromDataUrl(pendingPaintOverlayDataUrl);
    pendingPaintOverlayDataUrl = null;
  }

  processPattern();
}

/**
 * Stage 2 — generates the SVG Pattern from cached Simplified data.
 * Triggered by: curveComplexity, smoothness (or after processQuantization).
 */
function processPattern() {
  if (!currentSimplifiedResult) return;

  const { assignments, processingW, processingH, pxPerInch, palette, matchedPalette } =
    currentSimplifiedResult;
  const { curveComplexity, smoothness, minPieceSize } = getControlValues();

  const mergedSource = getMergedAssignments(assignments, processingW, processingH);
  const { updatedPalette, updatedMatchedPalette } = _buildPaletteFromAssignments(
    mergedSource.assignments,
    palette,
    matchedPalette
  );
  const backgroundColorIndex = _chooseBackgroundColorIndex(updatedMatchedPalette);

  // Final SVG colors should follow mapped Kona colors (including user overrides),
  // while geometry still follows the quantized assignment map.
  const svgPalette = updatedPalette.map((entry) => {
    const mapped = updatedMatchedPalette.find((candidate) => candidate.colorIndex === entry.colorIndex);
    return mapped?.fabric?.hex
      ? { ...entry, hex: mapped.fabric.hex }
      : entry;
  });

  const svgResult = generatePatternSVG(
    mergedSource.assignments,
    processingW,
    processingH,
    svgPalette,
    { backgroundColorIndex, curveComplexity, smoothness, minPieceSize, pxPerInch }
  );
  currentPatternSvgMarkup = svgResult.svg;
  document.getElementById('svgContainer').innerHTML = svgResult.svg;

  currentPalette = updatedMatchedPalette.map((entry) => ({
    ...entry,
    pieceCount: svgResult.pieceCounts.get(entry.colorIndex) || 0,
    isBackground: entry.colorIndex === backgroundColorIndex,
  }));
  currentTotalPieces = svgResult.totalPieces;

  renderPalette(currentPalette, currentTotalPieces, {
    onHighlight:   (ci) => { renderPatternPreview(ci); _highlightSVGColor(ci); },
    onUnhighlight: ()   => { renderPatternPreview(null); _highlightSVGColor(null); },
    onChangeFabric: (ci) => {
      const entry = currentPalette.find((item) => item.colorIndex === ci);
      if (!entry) return;
      openFabricPicker({
        colorIndex: ci,
        currentFabric: entry.fabric,
        sourceLabel: entry.fabric?.name || entry.hex,
      });
    },
  });
  refreshPaintColorOptions(currentSimplifiedResult.matchedPalette || currentPalette);
}

function _overrideMatchedFabric(colorIndex, fabric) {
  if (!currentSimplifiedResult?.matchedPalette || !fabric) return;

  const sourceEntry = currentSimplifiedResult.palette.find((entry) => entry.colorIndex === colorIndex);
  if (!sourceEntry?.lab) return;

  const targetLab = rgbToLab(fabric.rgb.r, fabric.rgb.g, fabric.rgb.b);
  const distance = deltaE(sourceEntry.lab, targetLab).toFixed(1);

  currentSimplifiedResult.matchedPalette = currentSimplifiedResult.matchedPalette.map((entry) => (
    entry.colorIndex === colorIndex
      ? {
          ...entry,
          fabric: {
            name: fabric.name,
            number: fabric.number,
            hex: fabric.hex,
            rgb: fabric.rgb,
            distance,
          },
        }
      : entry
  ));

  processPattern();
  persistSession();
}

// --- Preview / highlight ---

function renderPatternPreview(activeColorIndex) {
  if (!currentPatternRender) return;

  const { processedCanvas, processingW, processingH, displayW, displayH } = currentPatternRender;
  patternCanvas.width = displayW;
  patternCanvas.height = displayH;
  syncPaintOverlayCanvas(displayW, displayH);

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
  const maskCanvas = _getMaskCanvas(activeColorIndex);
  selectedCtx.globalCompositeOperation = 'destination-in';
  selectedCtx.imageSmoothingEnabled = false;
  selectedCtx.drawImage(maskCanvas, 0, 0, processingW, processingH, 0, 0, displayW, displayH);
  selectedCtx.globalCompositeOperation = 'source-over';
  patternCtx.drawImage(selectedLayer, 0, 0);
}

function _getMaskCanvas(colorIndex) {
  if (currentPatternRender.maskCache.has(colorIndex)) {
    return currentPatternRender.maskCache.get(colorIndex);
  }

  const { assignments, processingW, processingH } = currentPatternRender;
  const maskData = new Uint8ClampedArray(assignments.length * 4);
  for (let i = 0; i < assignments.length; i++) {
    if (assignments[i] !== colorIndex) continue;
    const off = i * 4;
    maskData[off] = maskData[off + 1] = maskData[off + 2] = maskData[off + 3] = 255;
  }

  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = processingW;
  maskCanvas.height = processingH;
  maskCanvas.getContext('2d').putImageData(new ImageData(maskData, processingW, processingH), 0, 0);
  currentPatternRender.maskCache.set(colorIndex, maskCanvas);
  return maskCanvas;
}

function _highlightSVGColor(activeColorIndex) {
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

// --- Buttons ---
function _setupButtons() {
  document.getElementById('resetCropBtn').addEventListener('click', () => cropTool?.resetCrop());
  document.getElementById('applyCropBtn').addEventListener('click', applyCrop);
  recropBtn.addEventListener('click', (e) => { e.stopPropagation(); showCropStep(); });

  document.getElementById('newProjectBtn').addEventListener('click', () => {
    newProjectArea.classList.add('hidden');
    cancelUploadRow.classList.remove('hidden');
    uploadArea.classList.remove('hidden');
  });

  document.getElementById('cancelUploadBtn').addEventListener('click', () => {
    uploadArea.classList.add('hidden');
    cancelUploadRow.classList.add('hidden');
    newProjectArea.classList.remove('hidden');
  });
  downloadBtn.addEventListener('click', () => {
    const { quiltWidth } = getControlValues();
    const quiltHeightInches = currentCrop
      ? Math.round(quiltWidth * (currentCrop.h / currentCrop.w))
      : null;
    exportPdf(document.getElementById('svgContainer'), currentPalette, {
      svgMarkup: currentPatternSvgMarkup,
      quiltWidthInches: quiltWidth,
      quiltHeightInches,
    });
  });
}

// --- Go ---
init();

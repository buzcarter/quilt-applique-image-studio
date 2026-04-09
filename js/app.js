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
import { exportPdf } from './pdf-export.js';
import { saveSession, loadSession } from './session.js';

// State
let originalImage = null;
let originalDataUrl = null;
let cropTool = null;
let currentCrop = null;
let currentPalette = [];

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
  processImage();
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
  // Debounce timer for expensive reprocessing
  let processTimer = null;
  const debounceProcess = () => {
    clearTimeout(processTimer);
    processTimer = setTimeout(() => {
      if (originalImage && currentCrop) {
        processImage();
        persistSession();
      }
    }, 150);
  };

  quiltWidth.addEventListener('input', () => {
    quiltWidthValue.textContent = quiltWidth.value + '"';
    updateQuiltDimensions();
    debounceProcess();
  });

  colorSlider.addEventListener('input', () => {
    colorValue.textContent = colorSlider.value;
    debounceProcess();
  });

  minPieceSize.addEventListener('input', () => {
    minPieceSizeValue.textContent = minPieceSize.value + '"';
    debounceProcess();
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
function processImage() {
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

  patternCanvas.width = displayW;
  patternCanvas.height = displayH;
  const patternCtx = patternCanvas.getContext('2d');
  patternCtx.imageSmoothingEnabled = true;
  patternCtx.clearRect(0, 0, displayW, displayH);
  patternCtx.drawImage(processedCanvas, 0, 0, processingW, processingH, 0, 0, displayW, displayH);

  // Step 6: Match to fabrics and display
  currentPalette = matchPaletteToFabrics(simplified.palette);
  displayPalette(currentPalette);
}

function displayPalette(palette) {
  document.getElementById('paletteCount').textContent = palette.length;
  const container = document.getElementById('colorSwatches');
  container.innerHTML = '';

  for (const color of palette) {
    const swatch = document.createElement('div');
    swatch.className = 'color-swatch';

    if (color.fabric) {
      swatch.innerHTML = `
        <div class="color-box" style="background-color: ${color.fabric.hex}"></div>
        <div class="color-info">
          <div class="fabric-name">${color.fabric.name}</div>
          <div class="fabric-details">
            <span class="fabric-number">${color.fabric.number}</span>
            <span class="fabric-sep">·</span>
            <span class="color-percent">${color.percentage}%</span>
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
          <div class="color-hex">${color.hex}</div>
          <div class="color-percent">${color.percentage}%</div>
        </div>
      `;
    }

    container.appendChild(swatch);
  }
}

// --- Buttons ---
function setupButtons() {
  resetCropBtn.addEventListener('click', () => {
    if (cropTool) cropTool.resetCrop();
  });

  applyCropBtn.addEventListener('click', applyCrop);
  recropBtn.addEventListener('click', () => showCropStep());

  downloadBtn.addEventListener('click', () => {
    exportPdf(patternCanvas, currentPalette);
  });
}

// --- Go ---
init();

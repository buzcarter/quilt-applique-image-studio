/**
 * Main application: orchestrates crop → process → match → display workflow.
 */
import { CropTool } from './crop-tool.js';
import { quantizeColors, downscaleForProcessing } from './image-processing.js';
import { loadFabricLibrary, matchPaletteToFabrics } from './fabric-matcher.js';
import { exportPdf } from './pdf-export.js';
import { saveSession, loadSession } from './session.js';

// State
let originalImage = null; // always retained for re-cropping
let originalDataUrl = null; // retained for session persistence
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
const detailSlider = document.getElementById('detailSlider');
const detailValue = document.getElementById('detailValue');
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
  setupSliders();
  setupButtons();
  restoreSession();
}

function restoreSession() {
  const session = loadSession();
  if (!session || !session.imageDataUrl) return;

  const img = new Image();
  img.onload = () => {
    originalImage = img;
    originalDataUrl = session.imageDataUrl;

    // Restore slider values
    if (session.numColors) {
      colorSlider.value = session.numColors;
      colorValue.textContent = session.numColors;
    }
    if (session.detail) {
      detailSlider.value = session.detail;
      detailValue.textContent = session.detail;
    }

    // Restore crop and skip straight to the pattern view
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
    detail: parseInt(detailSlider.value),
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
  persistSession();
  processImage();
}

function goBackToCrop() {
  showCropStep();
}

// --- Processing ---
function setupSliders() {
  colorSlider.addEventListener('input', (e) => {
    colorValue.textContent = e.target.value;
    if (originalImage && currentCrop) {
      processImage();
      persistSession();
    }
  });

  detailSlider.addEventListener('input', (e) => {
    detailValue.textContent = e.target.value;
    if (originalImage && currentCrop) {
      processImage();
      persistSession();
    }
  });
}

function processImage() {
  if (!originalImage || !currentCrop) return;

  const numColors = parseInt(colorSlider.value);
  const detail = parseInt(detailSlider.value);

  // Create a cropped source image on a temp canvas
  const cropCanvas = document.createElement('canvas');
  cropCanvas.width = currentCrop.w;
  cropCanvas.height = currentCrop.h;
  const cropCtx = cropCanvas.getContext('2d');
  cropCtx.drawImage(
    originalImage,
    currentCrop.x, currentCrop.y, currentCrop.w, currentCrop.h,
    0, 0, currentCrop.w, currentCrop.h
  );

  // Create an image from the cropped canvas to use as source
  const croppedImg = { width: currentCrop.w, height: currentCrop.h };

  // Display original (cropped)
  const maxWidth = 400;
  const scale = Math.min(maxWidth / currentCrop.w, 1);
  const displayW = Math.floor(currentCrop.w * scale);
  const displayH = Math.floor(currentCrop.h * scale);

  originalCanvas.width = displayW;
  originalCanvas.height = displayH;
  const origCtx = originalCanvas.getContext('2d');
  origCtx.drawImage(cropCanvas, 0, 0, displayW, displayH);

  // Downscale for processing
  const workW = Math.floor(displayW * (detail / 100));
  const workH = Math.floor(displayH * (detail / 100));

  const workCanvas = document.createElement('canvas');
  workCanvas.width = workW;
  workCanvas.height = workH;
  const workCtx = workCanvas.getContext('2d');
  workCtx.drawImage(cropCanvas, 0, 0, workW, workH);

  const imageData = workCtx.getImageData(0, 0, workW, workH);
  const quantized = quantizeColors(imageData, numColors);

  // Draw quantized pattern scaled up
  const scaledCanvas = document.createElement('canvas');
  scaledCanvas.width = workW;
  scaledCanvas.height = workH;
  scaledCanvas.getContext('2d').putImageData(quantized.imageData, 0, 0);

  patternCanvas.width = displayW;
  patternCanvas.height = displayH;
  const patternCtx = patternCanvas.getContext('2d');
  patternCtx.imageSmoothingEnabled = false;
  patternCtx.drawImage(scaledCanvas, 0, 0, workW, workH, 0, 0, displayW, displayH);

  // Match to fabrics and display
  currentPalette = matchPaletteToFabrics(quantized.palette);
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
  recropBtn.addEventListener('click', goBackToCrop);

  downloadBtn.addEventListener('click', () => {
    exportPdf(patternCanvas, currentPalette);
  });
}

// --- Go ---
init();

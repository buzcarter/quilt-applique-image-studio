/**
 * SVG contour tracer for quilting patterns.
 * Converts pixel-based color assignments into smooth SVG paths
 * using marching squares contour tracing and Schneider bezier curve fitting.
 *
 * Each color produces a single compound <path> with evenodd fill rule.
 * Hole contours (inner boundaries) are included in the compound path so
 * the fill rule cuts them out; only outer contours count toward piece totals.
 */
import { config } from './config.js';
import {
  presmoothContour,
  subsampleByArcLength,
  polygonArea,
  boundingBox,
  detectCorners,
  fitContourPath,
} from './bezier-fit.js';

/**
 * Generate SVG markup from quantized color assignments.
 * @param {Uint16Array} assignments - pixel-to-colorIndex mapping
 * @param {number} width - processing grid width
 * @param {number} height - processing grid height
 * @param {Array} palette - color entries with .hex, .colorIndex
 * @param {number|object|null} options - backgroundColorIndex or options object
 * @returns {{ svg: string, pieceCounts: Map<number, number>, totalPieces: number }}
 */
export function generatePatternSVG(assignments, width, height, palette, options = null) {
  const resolvedOptions = (options !== null && typeof options === 'object')
    ? options
    : { backgroundColorIndex: options };
  const {
    backgroundColorIndex = null,
    curveComplexity = 55,
    smoothness = 60,
    minPieceSize = 0,
    pxPerInch = 0,
  } = resolvedOptions;

  // --- Slider-derived processing parameters ---
  const smoothT = _clamp01(Number(smoothness || 0) / 100);

  const cornerThreshold = _getCornerThreshold(curveComplexity);
  const fitTolerance = _getFitTolerance(smoothness);

  // Presmooth: heavier at higher smoothness
  const presmoothPasses = 1 + Math.round(smoothT * 2);       // 1–3
  const presmoothWindow = 5 + Math.round(smoothT * 20);      // 5–25

  // Subsample: sparser at higher smoothness → fewer points for fitter
  const subsampleSpacing = 3 + smoothT * 9;                   // 3–12 px

  // --- Area & dimension thresholds from physical piece size ---
  const minArea = pxPerInch > 0
    ? Math.max(config.svg.min_area, (minPieceSize * pxPerInch) ** 2)
    : config.svg.min_area;
  const minDim = pxPerInch > 0 ? minPieceSize * pxPerInch * 0.4 : 0;

  // --- Per-color contour processing ---
  const allPaths = [];
  const pieceCounts = new Map();
  const backgroundEntry = palette.find(c => c.colorIndex === backgroundColorIndex) || null;
  const backgroundFill = backgroundEntry ? backgroundEntry.hex : '#fff';

  for (const color of palette) {
    if (color.colorIndex === backgroundColorIndex) {
      pieceCounts.set(color.colorIndex, 0);
      continue;
    }

    const contours = traceColorBoundary(assignments, width, height, color.colorIndex);
    if (!contours.length) {
      pieceCounts.set(color.colorIndex, 0);
      continue;
    }

    // Determine which winding sign corresponds to outer boundaries.
    // The largest contour (by absolute area) is always an outer boundary.
    const areas = contours.map(c => polygonArea(c));
    let outerSign = -1, maxAbsArea = 0;
    for (const a of areas) {
      if (Math.abs(a) > maxAbsArea) {
        maxAbsArea = Math.abs(a);
        outerSign = Math.sign(a) || -1;
      }
    }

    const fittedSubpaths = [];
    let pieceCount = 0;

    for (let ci = 0; ci < contours.length; ci++) {
      const contour = contours[ci];
      if (contour.length < 4) continue;

      const absArea = Math.abs(areas[ci]);
      if (absArea < minArea) continue;

      const isOuter = Math.sign(areas[ci]) === outerSign;

      // Bounding-box narrow-dimension filter (outer contours only —
      // catches thin slivers that pass the area threshold).
      if (isOuter && minDim > 0) {
        const bb = boundingBox(contour);
        if (Math.min(bb.w, bb.h) < minDim) continue;
      }

      // Smooth → subsample → corner detect → bezier fit
      const smoothed = presmoothContour(contour, presmoothWindow, presmoothPasses);
      const sampled = subsampleByArcLength(smoothed, subsampleSpacing);
      const corners = detectCorners(sampled, cornerThreshold);
      const pathD = fitContourPath(sampled, corners, fitTolerance);
      if (!pathD) continue;

      fittedSubpaths.push(pathD);
      if (isOuter) pieceCount++;
    }

    pieceCounts.set(color.colorIndex, pieceCount);

    if (fittedSubpaths.length) {
      // Combine all sub-paths (outer + holes) into one compound <path>.
      // The evenodd fill rule cuts holes automatically.
      allPaths.push({
        d: fittedSubpaths.join(' '),
        fill: color.hex,
        colorIndex: color.colorIndex,
      });
    }
  }

  // --- Assemble SVG ---
  const lines = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-0.5 -0.5 ${width} ${height}" class="pattern-svg">`,
    `<rect x="-0.5" y="-0.5" width="${width}" height="${height}" fill="${backgroundFill}"/>`,
  ];
  for (const p of allPaths) {
    lines.push(
      `<path d="${p.d}" fill="${p.fill}" fill-rule="evenodd" data-color-index="${p.colorIndex}"/>`
    );
  }
  lines.push('</svg>');

  const totalPieces = [...pieceCounts.values()].reduce((a, b) => a + b, 0);
  return { svg: lines.join('\n'), pieceCounts, totalPieces };
}

// --- Slider Mappings ---

function _clamp01(v) { return Math.max(0, Math.min(1, v)); }

/**
 * Map complexity slider (0–100) to corner detection angle threshold (radians).
 * Low complexity → high threshold (≈143°) → only sharp turns kept.
 * High complexity → low threshold (≈9°) → gentle bends become corners.
 */
function _getCornerThreshold(curveComplexity) {
  const t = _clamp01(Number(curveComplexity || 0) / 100);
  return 0.15 + (1 - t) ** 1.5 * 2.35;
}

/**
 * Map smoothness slider (0–100) to bezier fitting tolerance (pixels).
 * Low smoothness → 0.5 px → curves hug every bump.
 * High smoothness → 20 px → flowing lines for scissors.
 */
function _getFitTolerance(smoothness) {
  const t = _clamp01(Number(smoothness || 0) / 100);
  return 0.5 + t ** 1.3 * 19.5;
}

// --- Marching Squares Contour Tracing ---

// Segment lookup: cellType → [[fromEdge, toEdge], ...]
// Edges: 0=top, 1=right, 2=bottom, 3=left
const SEGS = [
  [],                   // 0:  0000
  [[3, 2]],             // 1:  0001 (BL)
  [[2, 1]],             // 2:  0010 (BR)
  [[3, 1]],             // 3:  0011 (BL+BR)
  [[0, 1]],             // 4:  0100 (TR)
  [[0, 1], [3, 2]],    // 5:  0101 (saddle: TR+BL separate)
  [[0, 2]],             // 6:  0110 (TR+BR)
  [[0, 3]],             // 7:  0111 (all but TL)
  [[0, 3]],             // 8:  1000 (TL)
  [[0, 2]],             // 9:  1001 (TL+BL)
  [[0, 3], [2, 1]],    // 10: 1010 (saddle: TL+BR separate)
  [[0, 1]],             // 11: 1011 (all but TR)
  [[3, 1]],             // 12: 1100 (TL+TR)
  [[2, 1]],             // 13: 1101 (all but BR)
  [[3, 2]],             // 14: 1110 (all but BL)
  [],                   // 15: 1111
];

function edgeMidpoint(cx, cy, edge) {
  switch (edge) {
    case 0: return [cx + 0.5, cy];       // top
    case 1: return [cx + 1, cy + 0.5];   // right
    case 2: return [cx + 0.5, cy + 1];   // bottom
    case 3: return [cx, cy + 0.5];       // left
  }
}

function traceColorBoundary(assignments, w, h, target) {
  const val = (x, y) =>
    (x >= 0 && x < w && y >= 0 && y < h && assignments[y * w + x] === target) ? 1 : 0;

  const adj = new Map();

  function addSeg(a, b) {
    const ka = a[0] + ',' + a[1];
    const kb = b[0] + ',' + b[1];
    if (!adj.has(ka)) adj.set(ka, []);
    if (!adj.has(kb)) adj.set(kb, []);
    adj.get(ka).push(kb);
    adj.get(kb).push(ka);
  }

  for (let cy = -1; cy < h; cy++) {
    for (let cx = -1; cx < w; cx++) {
      const cell = val(cx, cy) * 8 + val(cx + 1, cy) * 4 +
                   val(cx + 1, cy + 1) * 2 + val(cx, cy + 1);
      if (cell === 0 || cell === 15) continue;

      for (const [e1, e2] of SEGS[cell]) {
        addSeg(edgeMidpoint(cx, cy, e1), edgeMidpoint(cx, cy, e2));
      }
    }
  }

  const visited = new Set();
  const paths = [];

  for (const startKey of adj.keys()) {
    if (visited.has(startKey)) continue;

    const path = [];
    let prevKey = null;
    let curKey = startKey;

    do {
      visited.add(curKey);
      const comma = curKey.indexOf(',');
      path.push([+curKey.slice(0, comma), +curKey.slice(comma + 1)]);

      const neighbors = adj.get(curKey);
      let nextKey = null;
      for (const nk of neighbors) {
        if (nk !== prevKey && !visited.has(nk)) {
          nextKey = nk;
          break;
        }
      }

      prevKey = curKey;
      curKey = nextKey;
    } while (curKey && curKey !== startKey);

    if (path.length >= 3) paths.push(path);
  }

  return paths;
}

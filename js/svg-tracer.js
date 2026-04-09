/**
 * SVG contour tracer for quilting patterns.
 * Converts pixel-based color assignments into smooth SVG paths
 * using marching squares, RDP simplification, and Catmull-Rom smoothing.
 */

/**
 * Generate SVG markup from quantized color assignments.
 * @param {Uint16Array} assignments - pixel-to-colorIndex mapping
 * @param {number} width - processing grid width
 * @param {number} height - processing grid height
 * @param {Array} palette - color entries with .hex, .colorIndex
 * @param {number|object|null} options - backgroundColorIndex or export options
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
  } = resolvedOptions;
  const allPaths = [];
  const pieceCounts = new Map();
  const backgroundEntry = palette.find((color) => color.colorIndex === backgroundColorIndex) || null;
  const backgroundFill = backgroundEntry ? backgroundEntry.hex : '#fff';
  const simplifyTolerance = getSimplifyTolerance(curveComplexity);

  for (const color of palette) {
    if (color.colorIndex === backgroundColorIndex) {
      pieceCounts.set(color.colorIndex, 0);
      continue;
    }

    const contours = traceColorBoundary(assignments, width, height, color.colorIndex);
    let count = 0;
    for (const contour of contours) {
      if (contour.length < 4) continue;
      const simplified = simplifyClosedPath(contour, simplifyTolerance);
      if (simplified.length < 3) continue;
      count++;
      allPaths.push({
        d: smoothToSVGPath(simplified, smoothness),
        fill: color.hex,
        colorIndex: color.colorIndex,
      });
    }
    pieceCounts.set(color.colorIndex, count);
  }

  const lines = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-0.5 -0.5 ${width} ${height}" class="pattern-svg">`,
    `<rect x="-0.5" y="-0.5" width="${width}" height="${height}" fill="${backgroundFill}"/>`,
  ];

  for (const p of allPaths) {
    lines.push(
      `<path d="${p.d}" fill="${p.fill}" data-color-index="${p.colorIndex}"/>`
    );
  }

  lines.push('</svg>');
  return { svg: lines.join('\n'), pieceCounts, totalPieces: allPaths.length };
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function getSimplifyTolerance(curveComplexity) {
  const t = clamp01(Number(curveComplexity || 0) / 100);
  return 0.35 + ((1 - t) ** 2) * 3.15;
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

  // Build adjacency map from marching squares segments
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

  // Chain segments into closed paths
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

// --- Ramer-Douglas-Peucker Simplification ---

function simplifyClosedPath(pts, tol) {
  if (pts.length <= 4) return pts;

  // Split closed path at the point farthest from pts[0]
  let maxD = 0, splitIdx = 0;
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i][0] - pts[0][0], dy = pts[i][1] - pts[0][1];
    const d = dx * dx + dy * dy;
    if (d > maxD) { maxD = d; splitIdx = i; }
  }

  const a = rdp(pts.slice(0, splitIdx + 1), tol);
  const b = rdp(pts.slice(splitIdx).concat([pts[0]]), tol);
  return a.concat(b.slice(1, -1));
}

function rdp(pts, tol) {
  if (pts.length <= 2) return pts;

  const [ax, ay] = pts[0];
  const [bx, by] = pts[pts.length - 1];
  let maxD = 0, maxI = 0;

  for (let i = 1; i < pts.length - 1; i++) {
    const d = ptLineDist(pts[i], ax, ay, bx, by);
    if (d > maxD) { maxD = d; maxI = i; }
  }

  if (maxD > tol) {
    const left = rdp(pts.slice(0, maxI + 1), tol);
    const right = rdp(pts.slice(maxI), tol);
    return left.concat(right.slice(1));
  }
  return [pts[0], pts[pts.length - 1]];
}

function ptLineDist([px, py], ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// --- Path Smoothing (Taubin λ|μ + Catmull-Rom) ---

/**
 * One Laplacian relaxation pass. Each vertex moves factor × (neighbor avg − itself).
 * Positive factor: shrinks toward centroid. Negative: expands slightly.
 */
function laplacianPass(pts, factor) {
  const n = pts.length;
  return pts.map((p, i) => {
    const prev = pts[(i - 1 + n) % n];
    const next = pts[(i + 1) % n];
    return [
      p[0] + factor * ((prev[0] + next[0]) / 2 - p[0]),
      p[1] + factor * ((prev[1] + next[1]) / 2 - p[1]),
    ];
  });
}

/**
 * Taubin λ|μ smoothing: alternates a shrinking pass (λ) and a slight
 * expanding pass (μ) so the shape rounds without contracting to a point.
 * After enough iterations a convex polygon converges to a circle.
 */
function taubinSmooth(pts, iterations) {
  const LAMBDA = 0.5;
  const MU = -0.53; // |μ| > λ to resist shrinkage
  let current = pts;
  for (let i = 0; i < iterations; i++) {
    current = laplacianPass(current, LAMBDA);
    current = laplacianPass(current, MU);
  }
  return current;
}

/**
 * Convert a point array to a closed straight-line polygon SVG path.
 * Used as the t≈0 fallback.
 */
function polygonToSVGPath(pts) {
  const f = (v) => +v.toFixed(2);
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 1; i < pts.length; i++) {
    d += `L${f(pts[i][0])} ${f(pts[i][1])}`;
  }
  return d + 'Z';
}

/**
 * Convert points to a smooth closed SVG path.
 *
 * smoothness 0:   straight polygon, no changes.
 * smoothness 50:  moderate Taubin rounding + visible bezier softening.
 * smoothness 100: high Taubin rounding + strong Catmull-Rom tension.
 *                 A square becomes circle-like.
 */
function smoothToSVGPath(pts, smoothness = 60) {
  const n = pts.length;
  if (n < 3) return '';

  const t = clamp01(Number(smoothness || 0) / 100);
  if (t <= 0.01) {
    return polygonToSVGPath(pts);
  }

  // Stronger slider response: ease lightly so mid-range is still noticeable.
  const eased = t ** 1.2;

  // Taubin iterations: larger cap gives materially stronger high-end rounding.
  const iterations = Math.round(eased * 60);
  const smoothed = iterations > 0 ? taubinSmooth(pts, iterations) : pts;

  // Catmull-Rom tension: broaden range so smoothness visibly affects curvature.
  const tension = 0.02 + eased * 0.28;

  const f = (v) => +v.toFixed(2);
  const m = smoothed.length;
  let d = `M${f(smoothed[0][0])} ${f(smoothed[0][1])}`;

  for (let i = 0; i < m; i++) {
    const p0 = smoothed[(i - 1 + m) % m];
    const p1 = smoothed[i];
    const p2 = smoothed[(i + 1) % m];
    const p3 = smoothed[(i + 2) % m];

    const cp1x = p1[0] + (p2[0] - p0[0]) * tension;
    const cp1y = p1[1] + (p2[1] - p0[1]) * tension;
    const cp2x = p2[0] - (p3[0] - p1[0]) * tension;
    const cp2y = p2[1] - (p3[1] - p1[1]) * tension;

    d += `C${f(cp1x)} ${f(cp1y)},${f(cp2x)} ${f(cp2y)},${f(p2[0])} ${f(p2[1])}`;
  }

  return d + 'Z';
}

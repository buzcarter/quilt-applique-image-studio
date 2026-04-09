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
 * @param {number|null} backgroundColorIndex - colorIndex used as full-bleed background
 * @returns {{ svg: string, pieceCounts: Map<number, number>, totalPieces: number }}
 */
export function generatePatternSVG(assignments, width, height, palette, backgroundColorIndex = null) {
  const allPaths = [];
  const pieceCounts = new Map();
  const backgroundEntry = palette.find((color) => color.colorIndex === backgroundColorIndex) || null;
  const backgroundFill = backgroundEntry ? backgroundEntry.hex : '#fff';

  for (const color of palette) {
    if (color.colorIndex === backgroundColorIndex) {
      pieceCounts.set(color.colorIndex, 0);
      continue;
    }

    const contours = traceColorBoundary(assignments, width, height, color.colorIndex);
    let count = 0;
    for (const contour of contours) {
      if (contour.length < 4) continue;
      const simplified = simplifyClosedPath(contour, 1.0);
      if (simplified.length < 3) continue;
      count++;
      allPaths.push({
        d: smoothToSVGPath(simplified),
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
      `<path d="${p.d}" fill="${p.fill}" data-color-index="${p.colorIndex}" ` +
      `stroke="#444" stroke-width="0.5" stroke-linejoin="round"/>`
    );
  }

  lines.push('</svg>');
  return { svg: lines.join('\n'), pieceCounts, totalPieces: allPaths.length };
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

// --- Catmull-Rom → Cubic Bézier Smoothing ---

function smoothToSVGPath(pts) {
  const n = pts.length;
  if (n < 3) return '';

  const f = (v) => +v.toFixed(2);
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;

  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];

    // Catmull-Rom to cubic bézier control points
    const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
    const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
    const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
    const cp2y = p2[1] - (p3[1] - p1[1]) / 6;

    d += `C${f(cp1x)} ${f(cp1y)},${f(cp2x)} ${f(cp2y)},${f(p2[0])} ${f(p2[1])}`;
  }

  return d + 'Z';
}

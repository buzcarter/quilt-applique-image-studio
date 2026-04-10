/**
 * Bezier curve fitting for contour paths.
 * Schneider's algorithm fits cubic beziers to point sequences,
 * producing clean vector output with minimal anchor points.
 */

// --- Contour Pre-processing ---

/**
 * Multi-pass box-filter smoothing removes pixel staircase noise.
 * Multiple passes approximate Gaussian smoothing (central limit theorem).
 * @param {Array} pts - contour points
 * @param {number} windowSize - filter width (forced odd, capped to contour length)
 * @param {number} passes - number of smoothing passes (1–3 typical)
 */
export function presmoothContour(pts, windowSize = 5, passes = 1) {
  const n = pts.length;
  if (n < 4) return pts.slice();
  let w = windowSize | 1; // force odd
  w = Math.min(w, (Math.floor(n / 2) * 2) - 1); // cap at contour half-length
  if (w < 3) w = 3;
  const hw = Math.floor(w / 2);

  let current = pts;
  for (let pass = 0; pass < passes; pass++) {
    const prev = current;
    current = new Array(n);
    for (let i = 0; i < n; i++) {
      let sx = 0, sy = 0;
      for (let j = -hw; j <= hw; j++) {
        const p = prev[(i + j + n) % n];
        sx += p[0]; sy += p[1];
      }
      current[i] = [sx / w, sy / w];
    }
  }
  return current;
}

/**
 * Resample a closed contour at uniform arc-length intervals.
 * Reduces point density for cleaner bezier fitting.
 */
export function subsampleByArcLength(pts, spacing) {
  const n = pts.length;
  if (n <= 4 || spacing <= 0) return pts.slice();

  const arcLen = new Float64Array(n);
  for (let i = 1; i < n; i++) {
    arcLen[i] = arcLen[i - 1] + Math.hypot(
      pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  }
  const totalLen = arcLen[n - 1];
  if (totalLen < spacing * 3) return pts.slice();

  const numSamples = Math.max(6, Math.round(totalLen / spacing));
  const step = totalLen / numSamples;
  const result = [pts[0]];
  let segIdx = 1;

  for (let s = 1; s < numSamples; s++) {
    const target = s * step;
    while (segIdx < n - 1 && arcLen[segIdx] < target) segIdx++;
    const prevLen = arcLen[segIdx - 1];
    const segLen = arcLen[segIdx] - prevLen;
    const t = segLen > 1e-9 ? (target - prevLen) / segLen : 0;
    result.push([
      pts[segIdx - 1][0] + t * (pts[segIdx][0] - pts[segIdx - 1][0]),
      pts[segIdx - 1][1] + t * (pts[segIdx][1] - pts[segIdx - 1][1]),
    ]);
  }
  return result;
}

/** Signed polygon area via shoelace formula. */
export function polygonArea(pts) {
  let area = 0;
  for (let i = 0, n = pts.length; i < n; i++) {
    const j = (i + 1) % n;
    area += pts[i][0] * pts[j][1] - pts[j][0] * pts[i][1];
  }
  return area / 2;
}

/** Axis-aligned bounding box. */
export function boundingBox(pts) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of pts) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

// --- Corner Detection ---

/**
 * Detect corners where the turning angle exceeds a threshold.
 * Window-based measurement ignores pixel-level noise.
 * Returns sorted array of corner point indices.
 */
export function detectCorners(pts, angleThreshold) {
  const n = pts.length;
  if (n < 6) return [];
  const w = Math.max(2, Math.min(Math.round(n * 0.08), 25));

  const angles = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const prev = pts[(i - w + n) % n], curr = pts[i], next = pts[(i + w) % n];
    const dx1 = curr[0] - prev[0], dy1 = curr[1] - prev[1];
    const dx2 = next[0] - curr[0], dy2 = next[1] - curr[1];
    angles[i] = Math.abs(Math.atan2(dx1 * dy2 - dy1 * dx2, dx1 * dx2 + dy1 * dy2));
  }

  const candidates = [];
  for (let i = 0; i < n; i++) {
    if (angles[i] >= angleThreshold) candidates.push({ idx: i, angle: angles[i] });
  }
  if (!candidates.length) return [];

  candidates.sort((a, b) => b.angle - a.angle);
  const minSep = Math.max(3, w);
  const kept = [];
  for (const c of candidates) {
    const tooClose = kept.some(k => {
      const d = Math.abs(c.idx - k);
      return Math.min(d, n - d) < minSep;
    });
    if (!tooClose) kept.push(c.idx);
  }
  kept.sort((a, b) => a - b);
  return kept;
}

/** Find vertex with sharpest turn (fallback split point when no corners detected). */
function _findSharpestTurn(pts) {
  const n = pts.length;
  const w = Math.max(2, Math.min(Math.round(n * 0.08), 15));
  let best = -1, bestIdx = 0;
  for (let i = 0; i < n; i++) {
    const prev = pts[(i - w + n) % n], curr = pts[i], next = pts[(i + w) % n];
    const dx1 = curr[0] - prev[0], dy1 = curr[1] - prev[1];
    const dx2 = next[0] - curr[0], dy2 = next[1] - curr[1];
    const a = Math.abs(Math.atan2(dx1 * dy2 - dy1 * dx2, dx1 * dx2 + dy1 * dy2));
    if (a > best) { best = a; bestIdx = i; }
  }
  return bestIdx;
}

// --- Path Assembly ---

/**
 * Fit bezier curves to a closed contour split at detected corners.
 * Returns SVG path d-attribute string, or null if fitting fails.
 */
export function fitContourPath(pts, corners, tolerance) {
  if (pts.length < 3) return null;
  const splitPts = corners.length ? corners : [_findSharpestTurn(pts)];

  const allBeziers = [];
  const nc = splitPts.length;
  for (let c = 0; c < nc; c++) {
    const segPts = _extractSegment(pts, splitPts[c], splitPts[(c + 1) % nc]);
    if (segPts.length < 2) continue;
    const leftTan = _tangent(segPts, true);
    const rightTan = _tangent(segPts, false);
    allBeziers.push(..._fitCubic(segPts, leftTan, rightTan, tolerance));
  }
  if (!allBeziers.length) return null;

  const f = v => +v.toFixed(2);
  let d = `M${f(allBeziers[0][0][0])} ${f(allBeziers[0][0][1])}`;
  for (const [, cp1, cp2, end] of allBeziers) {
    d += `C${f(cp1[0])} ${f(cp1[1])},${f(cp2[0])} ${f(cp2[1])},${f(end[0])} ${f(end[1])}`;
  }
  return d + 'Z';
}

/** Extract points from closed contour between two indices (inclusive, wraps). */
function _extractSegment(pts, start, end) {
  const n = pts.length;
  const result = [pts[start]];
  let i = (start + 1) % n;
  let safety = n;
  while (i !== end && safety-- > 0) {
    result.push(pts[i]);
    i = (i + 1) % n;
  }
  result.push(pts[end]);
  return result;
}

/** Tangent direction at start or end of a point segment. */
function _tangent(pts, isStart) {
  const n = pts.length;
  const reach = Math.min(n - 1, 3);
  let dx = 0, dy = 0;
  if (isStart) {
    for (let i = 0; i < reach; i++) { dx += pts[i + 1][0] - pts[i][0]; dy += pts[i + 1][1] - pts[i][1]; }
  } else {
    for (let i = n - 1; i > n - 1 - reach; i--) { dx += pts[i - 1][0] - pts[i][0]; dy += pts[i - 1][1] - pts[i][1]; }
  }
  const len = Math.hypot(dx, dy);
  return len > 0 ? [dx / len, dy / len] : [isStart ? 1 : -1, 0];
}

// --- Schneider's Cubic Bezier Fitting ---

const MAX_FIT_DEPTH = 4;

/**
 * Recursively fit cubic bezier curve(s) to a point sequence.
 * Returns array of [P0, P1, P2, P3] control point tuples.
 */
function _fitCubic(pts, leftTan, rightTan, tolerance, depth = 0) {
  const n = pts.length;
  const tolSq = tolerance * tolerance;

  if (n === 2) {
    const d = Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]) / 3;
    return [[
      pts[0],
      [pts[0][0] + leftTan[0] * d, pts[0][1] + leftTan[1] * d],
      [pts[1][0] + rightTan[0] * d, pts[1][1] + rightTan[1] * d],
      pts[1],
    ]];
  }

  let u = _chordParams(pts);
  let bez = _solveBezier(pts, u, leftTan, rightTan);
  let [maxErr, splitIdx] = _maxError(pts, bez, u);
  if (maxErr < tolSq) return [bez];

  if (maxErr < tolSq * 16 && depth < MAX_FIT_DEPTH) {
    for (let iter = 0; iter < 4; iter++) {
      u = _reParam(pts, bez, u);
      bez = _solveBezier(pts, u, leftTan, rightTan);
      [maxErr, splitIdx] = _maxError(pts, bez, u);
      if (maxErr < tolSq) return [bez];
    }
  }

  if (depth >= MAX_FIT_DEPTH || n <= 3) return [bez];

  const cTan = _centerTan(pts, splitIdx);
  return [
    ..._fitCubic(pts.slice(0, splitIdx + 1), leftTan, cTan, tolerance, depth + 1),
    ..._fitCubic(pts.slice(splitIdx), [-cTan[0], -cTan[1]], rightTan, tolerance, depth + 1),
  ];
}

/** Chord-length parameterization. */
function _chordParams(pts) {
  const n = pts.length;
  const u = new Float64Array(n);
  for (let i = 1; i < n; i++)
    u[i] = u[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  const total = u[n - 1];
  if (total > 0) for (let i = 1; i < n; i++) u[i] /= total;
  return u;
}

/** Least-squares solve for a single cubic bezier. */
function _solveBezier(pts, u, tHat1, tHat2) {
  const n = pts.length, P0 = pts[0], P3 = pts[n - 1];
  let c00 = 0, c01 = 0, c11 = 0, x0 = 0, x1 = 0;

  for (let i = 0; i < n; i++) {
    const t = u[i], mt = 1 - t;
    const b1 = 3 * mt * mt * t, b2 = 3 * mt * t * t;
    const a1x = tHat1[0] * b1, a1y = tHat1[1] * b1;
    const a2x = tHat2[0] * b2, a2y = tHat2[1] * b2;
    c00 += a1x * a1x + a1y * a1y;
    c01 += a1x * a2x + a1y * a2y;
    c11 += a2x * a2x + a2y * a2y;

    const b0 = mt * mt * mt, b3 = t * t * t;
    const rx = pts[i][0] - (b0 + b1) * P0[0] - (b2 + b3) * P3[0];
    const ry = pts[i][1] - (b0 + b1) * P0[1] - (b2 + b3) * P3[1];
    x0 += a1x * rx + a1y * ry;
    x1 += a2x * rx + a2y * ry;
  }

  const det = c00 * c11 - c01 * c01;
  const segLen = Math.hypot(P3[0] - P0[0], P3[1] - P0[1]);
  let a1, a2;
  if (Math.abs(det) > 1e-12) {
    a1 = (c11 * x0 - c01 * x1) / det;
    a2 = (c00 * x1 - c01 * x0) / det;
  } else {
    a1 = a2 = segLen / 3;
  }
  if (a1 < 1e-6 * segLen || a2 < 1e-6 * segLen) a1 = a2 = segLen / 3;

  return [
    P0,
    [P0[0] + tHat1[0] * a1, P0[1] + tHat1[1] * a1],
    [P3[0] + tHat2[0] * a2, P3[1] + tHat2[1] * a2],
    P3,
  ];
}

/** Max squared error between data points and fitted bezier. */
function _maxError(pts, bez, u) {
  let maxD = 0, idx = Math.floor(pts.length / 2);
  for (let i = 1; i < pts.length - 1; i++) {
    const p = _evalBez(bez, u[i]);
    const d = (p[0] - pts[i][0]) ** 2 + (p[1] - pts[i][1]) ** 2;
    if (d > maxD) { maxD = d; idx = i; }
  }
  return [maxD, idx];
}

/** Newton-Raphson reparameterization. */
function _reParam(pts, bez, u) {
  const [P0, P1, P2, P3] = bez;
  return Float64Array.from(u, (t, i) => {
    if (i === 0 || i === pts.length - 1) return t;
    const q = _evalBez(bez, t);
    const mt = 1 - t;
    const q1x = 3 * (mt * mt * (P1[0] - P0[0]) + 2 * mt * t * (P2[0] - P1[0]) + t * t * (P3[0] - P2[0]));
    const q1y = 3 * (mt * mt * (P1[1] - P0[1]) + 2 * mt * t * (P2[1] - P1[1]) + t * t * (P3[1] - P2[1]));
    const q2x = 6 * (mt * (P2[0] - 2 * P1[0] + P0[0]) + t * (P3[0] - 2 * P2[0] + P1[0]));
    const q2y = 6 * (mt * (P2[1] - 2 * P1[1] + P0[1]) + t * (P3[1] - 2 * P2[1] + P1[1]));
    const dx = q[0] - pts[i][0], dy = q[1] - pts[i][1];
    const num = dx * q1x + dy * q1y;
    const den = q1x * q1x + q1y * q1y + dx * q2x + dy * q2y;
    return Math.abs(den) > 1e-12 ? Math.max(0, Math.min(1, t - num / den)) : t;
  });
}

/** Evaluate cubic bezier at parameter t. */
function _evalBez([P0, P1, P2, P3], t) {
  const mt = 1 - t, mt2 = mt * mt, t2 = t * t;
  return [
    mt2 * mt * P0[0] + 3 * mt2 * t * P1[0] + 3 * mt * t2 * P2[0] + t2 * t * P3[0],
    mt2 * mt * P0[1] + 3 * mt2 * t * P1[1] + 3 * mt * t2 * P2[1] + t2 * t * P3[1],
  ];
}

/** Tangent at split point, estimated from neighbors. */
function _centerTan(pts, idx) {
  const prev = pts[Math.max(0, idx - 1)], next = pts[Math.min(pts.length - 1, idx + 1)];
  const dx = (prev[0] - next[0]) / 2, dy = (prev[1] - next[1]) / 2;
  const len = Math.hypot(dx, dy);
  return len > 0 ? [dx / len, dy / len] : [1, 0];
}

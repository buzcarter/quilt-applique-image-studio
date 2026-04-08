/**
 * Color science utilities: RGB ↔ CIELAB conversion and Delta-E distance.
 */

// D65 illuminant reference
const REF_X = 95.047;
const REF_Y = 100.0;
const REF_Z = 108.883;

function srgbToLinear(c) {
  c /= 255;
  return c > 0.04045 ? Math.pow((c + 0.055) / 1.055, 2.4) : c / 12.92;
}

function rgbToXyz(r, g, b) {
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);
  return {
    x: (lr * 0.4124564 + lg * 0.3575761 + lb * 0.1804375) * 100,
    y: (lr * 0.2126729 + lg * 0.7151522 + lb * 0.0721750) * 100,
    z: (lr * 0.0193339 + lg * 0.1191920 + lb * 0.9503041) * 100,
  };
}

function xyzToLab(x, y, z) {
  let fx = x / REF_X;
  let fy = y / REF_Y;
  let fz = z / REF_Z;

  fx = fx > 0.008856 ? Math.cbrt(fx) : (7.787 * fx) + 16 / 116;
  fy = fy > 0.008856 ? Math.cbrt(fy) : (7.787 * fy) + 16 / 116;
  fz = fz > 0.008856 ? Math.cbrt(fz) : (7.787 * fz) + 16 / 116;

  return {
    L: (116 * fy) - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  };
}

export function rgbToLab(r, g, b) {
  const { x, y, z } = rgbToXyz(r, g, b);
  return xyzToLab(x, y, z);
}

/** CIE76 Delta-E — simple Euclidean in Lab space */
export function deltaE(lab1, lab2) {
  return Math.sqrt(
    (lab1.L - lab2.L) ** 2 +
    (lab1.a - lab2.a) ** 2 +
    (lab1.b - lab2.b) ** 2
  );
}

export function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
}

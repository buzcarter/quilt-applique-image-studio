/**
 * Fabric matching: loads fabric libraries and maps colors to real fabrics.
 */
import { rgbToLab, deltaE } from './color-science.js';

let fabricLibrary = [];
let fabricLabCache = [];

/** Load a fabric library from a JSON URL (array of {name, number, hex, rgb}) */
export async function loadFabricLibrary(url) {
  const response = await fetch(url);
  const data = await response.json();

  fabricLibrary = data;
  // Pre-compute Lab values for all fabrics
  fabricLabCache = data.map(f => ({
    ...f,
    lab: rgbToLab(f.rgb.r, f.rgb.g, f.rgb.b),
  }));

  return fabricLibrary;
}

/** Find the closest fabric match for a given Lab color */
export function findClosestFabric(lab) {
  let bestMatch = null;
  let bestDist = Infinity;

  for (const fabric of fabricLabCache) {
    const d = deltaE(lab, fabric.lab);
    if (d < bestDist) {
      bestDist = d;
      bestMatch = fabric;
    }
  }

  return { fabric: bestMatch, distance: bestDist };
}

/**
 * Map an entire palette (from quantization) to fabric matches.
 * Each palette entry gets a .fabric property with the matched fabric info.
 */
export function matchPaletteToFabrics(palette) {
  return palette.map(entry => {
    const { fabric, distance } = findClosestFabric(entry.lab);
    return {
      ...entry,
      fabric: fabric ? {
        name: fabric.name,
        number: fabric.number,
        hex: fabric.hex,
        rgb: fabric.rgb,
        distance: distance.toFixed(1),
      } : null,
    };
  });
}

export function getFabricLibrary() {
  return fabricLibrary;
}

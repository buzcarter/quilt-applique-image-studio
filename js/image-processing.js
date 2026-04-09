/**
 * Image processing: K-means quantization and color extraction.
 */
import { rgbToLab, deltaE, rgbToHex } from './color-science.js';

/**
 * K-means color quantization using perceptual (Lab) color distance.
 * Returns quantized ImageData, assignments, and palette with percentages.
 */
export function quantizeColors(imageData, numColors) {
  const { data, width, height } = imageData;
  const pixelCount = width * height;

  // Collect pixels as [r, g, b]
  const pixels = new Array(pixelCount);
  for (let i = 0; i < pixelCount; i++) {
    const off = i * 4;
    pixels[i] = [data[off], data[off + 1], data[off + 2]];
  }

  // Pre-compute Lab values for every pixel
  const pixelLabs = pixels.map(p => rgbToLab(p[0], p[1], p[2]));

  // Initialize centroids using k-means++ seeding
  const centroids = initCentroids(pixels, pixelLabs, numColors);
  let centroidLabs = centroids.map(c => rgbToLab(c[0], c[1], c[2]));

  // K-means iterations
  const assignments = new Uint16Array(pixelCount);
  for (let iter = 0; iter < 15; iter++) {
    // Assign pixels to nearest centroid
    for (let i = 0; i < pixelCount; i++) {
      let minDist = Infinity;
      let best = 0;
      for (let c = 0; c < numColors; c++) {
        const d = deltaE(pixelLabs[i], centroidLabs[c]);
        if (d < minDist) {
          minDist = d;
          best = c;
        }
      }
      assignments[i] = best;
    }

    // Recompute centroids
    const sums = Array.from({ length: numColors }, () => [0, 0, 0]);
    const counts = new Uint32Array(numColors);

    for (let i = 0; i < pixelCount; i++) {
      const c = assignments[i];
      sums[c][0] += pixels[i][0];
      sums[c][1] += pixels[i][1];
      sums[c][2] += pixels[i][2];
      counts[c]++;
    }

    for (let c = 0; c < numColors; c++) {
      if (counts[c] === 0) continue;
      centroids[c] = [
        Math.round(sums[c][0] / counts[c]),
        Math.round(sums[c][1] / counts[c]),
        Math.round(sums[c][2] / counts[c]),
      ];
      centroidLabs[c] = rgbToLab(centroids[c][0], centroids[c][1], centroids[c][2]);
    }
  }

  return buildQuantizedResult(assignments, width, height, centroids, centroidLabs);
}

/**
 * Merge isolated same-color regions smaller than the threshold into neighbors.
 */
export function mergeSmallRegions(quantized, minRegionPixels) {
  if (!minRegionPixels || minRegionPixels <= 1) {
    return quantized;
  }

  const { width, height, centroids, centroidLabs } = quantized;
  const assignments = quantized.assignments.slice();

  for (let pass = 0; pass < 4; pass++) {
    const regions = collectRegions(assignments, width, height);
    const smallRegions = regions
      .filter(region => region.size < minRegionPixels)
      .sort((left, right) => left.size - right.size);

    if (smallRegions.length === 0) {
      break;
    }

    let mergedAny = false;

    for (const region of smallRegions) {
      const targetColor = chooseMergeTarget(region, centroidLabs);
      if (targetColor === null) {
        continue;
      }

      for (const pixelIndex of region.pixels) {
        assignments[pixelIndex] = targetColor;
      }
      mergedAny = true;
    }

    if (!mergedAny) {
      break;
    }
  }

  return buildQuantizedResult(assignments, width, height, centroids, centroidLabs);
}

/** K-means++ initialization for better centroid seeding */
function initCentroids(pixels, pixelLabs, k) {
  const n = pixels.length;
  const centroids = [];
  const centroidLabs = [];

  // Pick first centroid at random
  const firstIdx = Math.floor(Math.random() * n);
  centroids.push([...pixels[firstIdx]]);
  centroidLabs.push(pixelLabs[firstIdx]);

  const distances = new Float64Array(n).fill(Infinity);

  for (let c = 1; c < k; c++) {
    const lastLab = centroidLabs[c - 1];

    // Update min distances
    let totalDist = 0;
    for (let i = 0; i < n; i++) {
      const d = deltaE(pixelLabs[i], lastLab);
      if (d < distances[i]) distances[i] = d;
      totalDist += distances[i] * distances[i];
    }

    // Weighted random selection
    let threshold = Math.random() * totalDist;
    let chosen = 0;
    for (let i = 0; i < n; i++) {
      threshold -= distances[i] * distances[i];
      if (threshold <= 0) {
        chosen = i;
        break;
      }
    }

    centroids.push([...pixels[chosen]]);
    centroidLabs.push(pixelLabs[chosen]);
  }

  return centroids;
}

/**
 * Build image data and palette from assignments.
 */
function buildQuantizedResult(assignments, width, height, centroids, centroidLabs) {
  const pixelCount = width * height;
  const colorCounts = new Uint32Array(centroids.length);
  const outData = new Uint8ClampedArray(pixelCount * 4);

  for (let i = 0; i < pixelCount; i++) {
    const colorIndex = assignments[i];
    const off = i * 4;
    const rgb = centroids[colorIndex];

    colorCounts[colorIndex]++;
    outData[off] = rgb[0];
    outData[off + 1] = rgb[1];
    outData[off + 2] = rgb[2];
    outData[off + 3] = 255;
  }

  const palette = centroids
    .map((rgb, idx) => ({
      rgb,
      hex: rgbToHex(rgb[0], rgb[1], rgb[2]),
      lab: centroidLabs[idx],
      percentage: ((colorCounts[idx] / pixelCount) * 100).toFixed(1),
      pixelCount: colorCounts[idx],
    }))
    .filter(entry => entry.pixelCount > 0)
    .sort((a, b) => b.pixelCount - a.pixelCount);

  return {
    width,
    height,
    assignments,
    centroids,
    centroidLabs,
    imageData: new ImageData(outData, width, height),
    palette,
  };
}

function collectRegions(assignments, width, height) {
  const visited = new Uint8Array(assignments.length);
  const regions = [];

  for (let start = 0; start < assignments.length; start++) {
    if (visited[start]) {
      continue;
    }

    const colorIndex = assignments[start];
    const stack = [start];
    const pixels = [];
    const borderCounts = new Map();
    visited[start] = 1;

    while (stack.length > 0) {
      const current = stack.pop();
      pixels.push(current);

      const x = current % width;
      const y = Math.floor(current / width);
      addRegionNeighbor(x - 1, y, colorIndex, assignments, visited, width, height, stack, borderCounts);
      addRegionNeighbor(x + 1, y, colorIndex, assignments, visited, width, height, stack, borderCounts);
      addRegionNeighbor(x, y - 1, colorIndex, assignments, visited, width, height, stack, borderCounts);
      addRegionNeighbor(x, y + 1, colorIndex, assignments, visited, width, height, stack, borderCounts);
    }

    regions.push({
      colorIndex,
      pixels,
      size: pixels.length,
      borderCounts,
    });
  }

  return regions;
}

function addRegionNeighbor(x, y, regionColor, assignments, visited, width, height, stack, borderCounts) {
  if (x < 0 || x >= width || y < 0 || y >= height) {
    return;
  }

  const index = y * width + x;
  const neighborColor = assignments[index];

  if (neighborColor === regionColor) {
    if (!visited[index]) {
      visited[index] = 1;
      stack.push(index);
    }
    return;
  }

  borderCounts.set(neighborColor, (borderCounts.get(neighborColor) || 0) + 1);
}

function chooseMergeTarget(region, centroidLabs) {
  let bestColor = null;
  let bestBorder = -1;
  let bestDistance = Infinity;

  for (const [neighborColor, borderLength] of region.borderCounts.entries()) {
    const distance = deltaE(centroidLabs[region.colorIndex], centroidLabs[neighborColor]);
    if (borderLength > bestBorder || (borderLength === bestBorder && distance < bestDistance)) {
      bestColor = neighborColor;
      bestBorder = borderLength;
      bestDistance = distance;
    }
  }

  return bestColor;
}

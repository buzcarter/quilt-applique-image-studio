/**
 * Image processing: K-means quantization and color extraction.
 */
import { rgbToLab, deltaE, rgbToHex } from './color-science.js';

/**
 * K-means color quantization using perceptual (Lab) color distance.
 * Returns quantized ImageData and palette with percentages.
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

  // Build output image and count pixels per color
  const colorCounts = new Uint32Array(numColors);
  const outData = new Uint8ClampedArray(data.length);

  for (let i = 0; i < pixelCount; i++) {
    const c = assignments[i];
    const off = i * 4;
    colorCounts[c]++;
    outData[off] = centroids[c][0];
    outData[off + 1] = centroids[c][1];
    outData[off + 2] = centroids[c][2];
    outData[off + 3] = 255;
  }

  const palette = centroids.map((rgb, idx) => ({
    rgb,
    hex: rgbToHex(rgb[0], rgb[1], rgb[2]),
    lab: centroidLabs[idx],
    percentage: ((colorCounts[idx] / pixelCount) * 100).toFixed(1),
  }));

  palette.sort((a, b) => b.percentage - a.percentage);

  return {
    imageData: new ImageData(outData, width, height),
    palette,
  };
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
 * Downscale image to working resolution based on detail level.
 * Returns { canvas, ctx, width, height } of the downscaled temp canvas.
 */
export function downscaleForProcessing(sourceImage, detail) {
  const maxWidth = 400;
  const scale = maxWidth / sourceImage.width;
  const displayWidth = Math.floor(sourceImage.width * scale);
  const displayHeight = Math.floor(sourceImage.height * scale);

  const workWidth = Math.floor(displayWidth * (detail / 100));
  const workHeight = Math.floor(displayHeight * (detail / 100));

  const canvas = document.createElement('canvas');
  canvas.width = workWidth;
  canvas.height = workHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(sourceImage, 0, 0, workWidth, workHeight);

  return { canvas, ctx, width: workWidth, height: workHeight, displayWidth, displayHeight };
}

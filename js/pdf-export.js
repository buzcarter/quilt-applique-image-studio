/**
 * PDF export: vector pattern + fabric shopping list.
 * Uses svg2pdf.js to embed the SVG as scalable vector paths.
 */

function getCleanExportSvg(svgContainer, svgMarkup) {
  let svgEl = null;

  if (typeof svgMarkup === 'string' && svgMarkup.trim()) {
    const parsed = new DOMParser().parseFromString(svgMarkup, 'image/svg+xml');
    svgEl = parsed.documentElement;
  } else {
    const sourceSvg = svgContainer?.querySelector('svg');
    svgEl = sourceSvg ? sourceSvg.cloneNode(true) : null;
  }

  if (!svgEl || svgEl.nodeName.toLowerCase() !== 'svg') {
    throw new Error('Pattern SVG was not found. Re-generate the pattern before exporting.');
  }

  svgEl.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  svgEl.classList.remove('pattern-svg');

  for (const path of svgEl.querySelectorAll('path.active')) {
    path.classList.remove('active');
  }

  const vb = svgEl.viewBox?.baseVal;
  if (!vb || vb.width <= 0 || vb.height <= 0) {
    const widthAttr = parseFloat(svgEl.getAttribute('width') || '0');
    const heightAttr = parseFloat(svgEl.getAttribute('height') || '0');
    if (widthAttr > 0 && heightAttr > 0) {
      svgEl.setAttribute('viewBox', `0 0 ${widthAttr} ${heightAttr}`);
    } else {
      throw new Error('Pattern SVG is missing size metadata and cannot be exported.');
    }
  }

  return svgEl;
}

function fitRect(sourceW, sourceH, maxW, maxH) {
  const scale = Math.min(maxW / sourceW, maxH / sourceH);
  return {
    width: sourceW * scale,
    height: sourceH * scale,
  };
}

function hexToRgb(hex) {
  const normalized = String(hex || '').replace('#', '').trim();
  if (normalized.length !== 6) return null;
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return null;
  return { r, g, b };
}

function collectUsedFabrics(palette) {
  const seen = new Set();
  const list = [];

  for (const entry of palette || []) {
    const fabric = entry?.fabric;
    if (!fabric) continue;

    const key = `${fabric.number || ''}|${fabric.name || ''}|${fabric.hex || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const rgb = fabric.rgb || hexToRgb(fabric.hex) || { r: 180, g: 180, b: 180 };
    list.push({
      name: fabric.name || 'Kona Color',
      number: fabric.number || 'N/A',
      rgb,
    });
  }

  return list.sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

export async function exportPdf(svgContainer, palette, options = {}) {
  const {
    svgMarkup = '',
    quiltWidthInches = null,
    quiltHeightInches = null,
  } = options;

  const { jsPDF } = window.jspdf;
  if (typeof jsPDF !== 'function') {
    throw new Error('jsPDF is unavailable. Please reload and try again.');
  }

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'letter',
  });

  if (typeof pdf.svg !== 'function') {
    throw new Error('svg2pdf.js is unavailable. PDF export requires vector SVG support.');
  }

  const svgEl = getCleanExportSvg(svgContainer, svgMarkup);
  const vb = svgEl.viewBox.baseVal;

  const margin = 15;
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();

  // Page 1: full pattern SVG within margins.
  const svgBounds = fitRect(vb.width, vb.height, pageW - margin * 2, pageH - margin * 2);
  const svgX = margin + (pageW - margin * 2 - svgBounds.width) / 2;
  const svgY = margin + (pageH - margin * 2 - svgBounds.height) / 2;
  await pdf.svg(svgEl, {
    x: svgX,
    y: svgY,
    width: svgBounds.width,
    height: svgBounds.height,
  });

  // Page 2+: Kona fabric grid.
  pdf.addPage();
  const fabrics = collectUsedFabrics(palette);
  const colorCount = fabrics.length;

  pdf.setFontSize(16);
  pdf.setFont(undefined, 'bold');
  pdf.text(`Kona Fabrics Used: ${colorCount} color${colorCount === 1 ? '' : 's'}`, margin, margin);

  pdf.setFontSize(9);
  pdf.setFont(undefined, 'normal');
  pdf.setTextColor(100);
  if (quiltWidthInches && quiltHeightInches) {
    pdf.text(`Pattern size: ${quiltWidthInches}" x ${quiltHeightInches}"`, margin, margin + 6);
  }
  pdf.setTextColor(0);

  const gridTop = margin + 12;
  const gridWidth = pageW - margin * 2;
  const colCount = 3;
  const gutter = 6;
  const cellW = (gridWidth - gutter * (colCount - 1)) / colCount;
  const cellH = 22;

  const drawFabricCell = (fabric, x, y) => {
    pdf.setDrawColor(220);
    pdf.setLineWidth(0.2);
    pdf.roundedRect(x, y, cellW, cellH, 1.5, 1.5, 'S');

    pdf.setFillColor(fabric.rgb.r, fabric.rgb.g, fabric.rgb.b);
    pdf.rect(x + 2.5, y + 2.5, 11, 11, 'F');
    pdf.setDrawColor(170);
    pdf.rect(x + 2.5, y + 2.5, 11, 11, 'S');

    pdf.setFont(undefined, 'bold');
    pdf.setFontSize(9);
    pdf.text(String(fabric.name), x + 16, y + 8);

    pdf.setFont(undefined, 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(90);
    pdf.text(`Product ID: ${fabric.number}`, x + 16, y + 14);
    pdf.setTextColor(0);
  };

  let index = 0;
  let y = gridTop;

  while (index < fabrics.length) {
    for (let col = 0; col < colCount && index < fabrics.length; col += 1) {
      const x = margin + col * (cellW + gutter);
      drawFabricCell(fabrics[index], x, y);
      index += 1;
    }
    y += cellH + gutter;

    if (y + cellH > pageH - margin && index < fabrics.length) {
      pdf.addPage();
      y = margin;
    }
  }

  // Footer
  const pageCount = pdf.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    pdf.setPage(i);
    pdf.setFontSize(8);
    pdf.setTextColor(150);
    pdf.text(`Generated by Appliqué Studio — Page ${i} of ${pageCount}`, margin, 270);
  }

  pdf.save('applique-pattern.pdf');
}

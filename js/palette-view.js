/**
 * Renders the fabric shopping list palette and swatch grid.
 *
 * Uses <template id="tpl-swatch-fabric"> and <template id="tpl-swatch-raw">
 * defined in the HTML for swatch markup.
 *
 * renderPalette(palette, totalPieces, { onHighlight, onUnhighlight })
 *   onHighlight(colorIndex) — called on mouseenter/focus of a non-background swatch
 *   onUnhighlight()         — called on mouseleave/blur
 */
import { renderTemplate } from './template-renderer.js';

export function renderPalette(palette, totalPieces, { onHighlight, onUnhighlight }) {
  document.getElementById('paletteCount').textContent = palette.length;
  document.getElementById('pieceCount').textContent = totalPieces;
  document.getElementById('patternPanelFabricCount').textContent = palette.length;
  document.getElementById('patternPanelPieceCount').textContent = totalPieces;

  const container = document.getElementById('colorSwatches');
  container.replaceChildren();

  for (const color of palette) {
    const backgroundClass = color.isBackground ? ' color-swatch--background' : '';
    const backgroundBadge = color.isBackground
      ? '<span class="swatch-role-badge">Background</span>'
      : '';

    const swatch = color.fabric
      ? renderTemplate('tpl-swatch-fabric', {
          COLOR_INDEX:      color.colorIndex,
          BACKGROUND_CLASS: backgroundClass,
          FABRIC_HEX:       color.fabric.hex,
          FABRIC_NAME:      color.fabric.name,
          BACKGROUND_BADGE: backgroundBadge,
          FABRIC_NUMBER:    color.fabric.number,
          PERCENTAGE:       color.percentage,
          PIECE_DETAILS:    color.isBackground
            ? ''
            : `<span class="fabric-sep">·</span><span class="color-pieces">${_formatPieces(color.pieceCount)}</span>`,
          IMAGE_HEX:        color.hex,
          DELTA:            color.fabric.distance,
        })
      : renderTemplate('tpl-swatch-raw', {
          COLOR_INDEX:        color.colorIndex,
          BACKGROUND_CLASS:   backgroundClass,
          HEX:                color.hex,
          BACKGROUND_BADGE:   backgroundBadge,
          PERCENTAGE_PIECES:  color.isBackground
            ? `${color.percentage}%`
            : `${color.percentage}% · ${_formatPieces(color.pieceCount)}`,
        });

    if (!color.isBackground) {
      swatch.addEventListener('mouseenter', () => onHighlight(color.colorIndex));
      swatch.addEventListener('mouseleave', () => onUnhighlight());
      swatch.addEventListener('focus',      () => onHighlight(color.colorIndex));
      swatch.addEventListener('blur',       () => onUnhighlight());
    }

    container.appendChild(swatch);
  }
}

function _formatPieces(count) {
  return `${count} ${count === 1 ? 'piece' : 'pieces'}`;
}

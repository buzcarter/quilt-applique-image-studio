# Appliqué Studio

## Project Overview

Browser-based tool that converts photos into simplified appliqué quilt patterns mapped to real-world fabric colors. Target audience is non-technical quilt guild members.

## Architecture Principles

- **Client-side only** — no backend, no build step
- **Separation of concerns** — keep JS modular: image processing, color matching, UI, and PDF export should be in separate files/modules as complexity grows. Do NOT let any single JS file exceed ~300 lines.
- **ES Modules** — use `<script type="module">` with separate `.js` files for each concern
- **No frameworks** — vanilla JS, Canvas API, minimal CDN deps (jsPDF)
- **Mobile-friendly** — responsive, touch-friendly, drag-and-drop + tap-to-upload

## Local Development

Served as a static site via Apache vhost: `http://applique-studio.log/`

## Processing Pipeline (Order of Operations)

1. **CROP** — user selects region (aspect ratio presets: free or 1:1 square). Original always retained for re-crop.
2. **QUILT SIZE** — user sets width in inches (10"–80"). Height derived from crop aspect ratio.
3. **COLOR QUANTIZATION** — reduce to N fabric colors (4–30) using k-means in CIELAB space.
4. **REGION MERGING** — connected-component analysis to absorb isolated regions smaller than minimum threshold into adjacent regions
5. **FABRIC MATCHING** — map quantized colors to nearest Kona Cotton Solid via Delta-E.
6. **SIMPLIFIED DISPLAY** — render simplified bitmap preview for user validation and paint/erase edits.
7. **PAINT MERGE (OPTIONAL)** — merge overlay paint into the simplified assignment map. Painted pixels replace simplified source pixels.
8. **PATTERN VECTORIZE** — generate SVG paths from merged assignments using contour tracing + simplification + smoothing.
9. **DISPLAY** — pattern preview + fabric shopping list.

### Pipeline split contract (must preserve)

- **Stage A (re-quantize):** Crop / Quilt Width / Number of Fabrics / Smallest Piece.
- **Stage B (re-vectorize only):** Curve Complexity / Smoothness / Paint / Erase.
- Stage B must not re-run k-means. Same Stage A input + same Stage B settings must produce deterministic output.

### Background color contract (must preserve)

- Background is the highest pixel-share color.
- Tie-break: alphabetical fabric name.
- Background is rendered as one full-coverage base layer.
- Background never creates path pieces and is excluded from piece counts.

## Organic Simplification Philosophy

The core output isn't pixelated or grid-like. Instead, the process produces **natural, fluid shapes** that resemble a topographic map:

- **Posterization** collapses the color spectrum; **minimum piece size** removes small noise
- Shapes have bulges, angles, and curves that follow the photo's contours — many fine details may be smaller than the minimum threshold, but they're part of larger organic regions, not isolated slivers
- The result looks like a stylized, simplified version of the original photo with cuttable seams, not a uniform grid
- **Adjusting minimum size controls clutter, not geometric precision** — smaller values = more contour detail (more cutting), larger values = simpler shapes (less cutting)

## Design Philosophy

This is NOT a general-purpose image editor. It has one workflow and one goal: turn a photo into a pattern to cut fabric. Every feature should be a *limiting* feature that constrains toward that goal. If a feature doesn't help someone cut fabric, it doesn't belong.

- **Dimensions in inches** (not pixels). Metric support later, US first.
- **No graphics jargon** — no vertices, splines, bezier curves, DPI, resolution in the UI
- A hidden dev/advanced mode is acceptable for development tooling
- When in doubt, constrain rather than expose options

## Fabric Color System

- Colors map to **real fabric lines** (Kona Cotton Solids is the primary/first target)
- Each fabric has: name, RGB/hex value, SKU/product code
- Fabric data lives in its own module (e.g., `fabrics/kona-solids.js`)
- Color matching uses perceptual distance (CIELAB Delta-E), not raw RGB Euclidean distance
- Typical quilt uses 6-20 distinct fabrics
- Paint tool color options are sourced from current swatches/palette entries, not arbitrary free color picking

## CSS Conventions

- Use BEM naming convention (`.block__element--modifier`) as we refactor
- Plan for Light / Dark / High Contrast themes via CSS custom properties
- Target audience is older — large touch targets, readable font sizes
- Paint/Eraser controls should remain compact, clear, and touch-friendly; mutually exclusive mode selection is preferred

## Code Style

- Vanilla JS, ES modules (may adopt TypeScript + bundler as complexity grows)
- Descriptive variable/function names
- Comments only where logic is non-obvious
- Keep `js/app.js` from growing further; split into focused modules when adding substantial features

## Export Rules

- PDF export must stay vector-safe (embed source SVG with svg2pdf), never rasterize the pattern.
- Strip transient UI classes/state before export so hover/selection states never leak into output.
- Preserve quilt dimension labeling and fabric list in export output.

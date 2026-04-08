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
4. **MINIMUM PIECE SIZE** — sets working grid resolution (inches → pixels). Each grid cell = one "minimum piece". This replaces the old abstract "detail" slider. Smaller pieces = more detail and more cutting. Larger = simpler pattern.
5. **FABRIC MATCHING** — map quantized colors to nearest Kona Cotton Solid via Delta-E.
6. **DISPLAY** — pattern preview + fabric shopping list.

### Future pipeline steps (not yet implemented):
7. **REGION MERGING** — connected-component analysis, merge tiny islands into neighbors.
8. **EDGE SMOOTHING** — contour simplification for organic cuttable shapes.
9. **SVG OUTPUT** — vector paths per fabric region. This is the real deliverable: smooth curves, not pixels.

## Design Philosophy

This is NOT a general-purpose image editor. It has one workflow and one goal: turn a photo into a pattern to cut fabric. Every feature should be a *limiting* feature that constrains toward that goal. If a feature doesn't help someone cut fabric, it doesn't belong.

- **Dimensions in inches** (not pixels). Metric support later, US first.
- **No graphics jargon** — no vertices, splines, bezier curves, DPI, resolution in the UI
- A hidden dev/advanced mode is acceptable for development tooling
- When in doubt, constrain rather than expose options

## UI/UX Guidelines

- **Audience is non-technical quilters.** Use plain language everywhere.
- Acceptable terms: "brightness", "contrast", "more reds", "fewer blues", "warmer", "cooler"
- Avoid jargon: no "saturation", "hue", "quantization", "k-means", "posterize"
- Slider labels should describe the *effect*, not the algorithm parameter
- Keep the interface minimal — progressive disclosure, don't overwhelm

## Fabric Color System

- Colors map to **real fabric lines** (Kona Cotton Solids is the primary/first target)
- Each fabric has: name, RGB/hex value, SKU/product code
- Fabric data lives in its own module (e.g., `fabrics/kona-solids.js`)
- Color matching uses perceptual distance (CIELAB Delta-E), not raw RGB Euclidean distance
- Typical quilt uses 6-20 distinct fabrics

## CSS Conventions

- Use BEM naming convention (`.block__element--modifier`) as we refactor
- Plan for Light / Dark / High Contrast themes via CSS custom properties
- Target audience is older — large touch targets, readable font sizes

## Code Style

- Vanilla JS, ES modules (may adopt TypeScript + bundler as complexity grows)
- Descriptive variable/function names
- Comments only where logic is non-obvious

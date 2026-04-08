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

## User Workflow

1. Upload photo
2. **Crop** (always first — original retained so user can re-crop anytime)
3. Adjust colors/simplification
4. Review fabric matches
5. Export

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

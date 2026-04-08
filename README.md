# Appliqué Studio

A browser-based tool that converts photos into simplified appliqué quilt patterns using real-world fabric colors.

## The Problem

Appliqué quilts require you to greatly simplify and abstract a photo down to shapes that can reasonably be cut from fabric. Fine details like grass, hair, or cloth texture aren't practical to reproduce. You need to reduce an image to a small number of solid-color regions, where each region maps to a specific purchasable fabric.

Existing tools either require technical skills (Photoshop, Illustrator), have complex install requirements (Homebrew deps), or don't understand the fabric-first workflow quilters actually need.

## The Solution

Upload a photo, pick a fabric line, adjust a few sliders, and get a pattern with a fabric shopping list. That's it.

**Target audience:** Non-technical quilt guild members working from iPhone photos.

## Current State (v0.2 — Phase 1 Complete)

- Modular ES module architecture (color-science, image-processing, fabric-matcher, crop-tool, pdf-export)
- Interactive crop tool (first step after upload, original retained for re-cropping)
- K-means quantization with CIELAB Delta-E perceptual color matching
- Colors mapped to nearest Kona Cotton Solid (fabric name, SKU, swatch)
- 6-20 fabric range, side-by-side preview, PDF export with fabric shopping list

## Roadmap

### Phase 2 — Session Persistence + Palette Display Polish

- [x] Session storage: save original image, crop, settings — reload picks up where you left off
- [x] Palette display: Kona fabric name prominent, RGB/hex and percentage smaller beneath
- [ ] Brightness / contrast sliders
- [ ] "Warmer / Cooler" color temperature slider
- [ ] "More reds / fewer reds", "More blues / fewer blues" style tint adjusters
- [ ] Before/after toggle or side-by-side comparison
- [ ] All labels in plain language (no jargon like "saturation" or "hue shift")

### Phase 3 — Region Simplification (Core Problem)

The pattern currently looks pixelated. Appliqué patterns need large, contiguous regions — not grids of tiny squares. This phase is about going from posterization to actual cuttable shapes.

- [ ] Connected-component analysis: identify and count distinct "islands" per fabric color
- [ ] Display piece count per fabric (e.g., "Ocean Blue — 3 pieces, 12% of pattern")
- [ ] Minimum region size slider: merge tiny islands into neighboring regions
- [ ] Edge smoothing / contour simplification (reduce jagged boundaries)
- [ ] Total piece count display (key metric: fewer pieces = more practical quilt)

### Phase 4 — Fabric Palette Management

- [ ] Lock a color to a specific region (hold until architecture reveals itself)
- [ ] Let user set a custom color palette (pick N fabrics from the library)
- [ ] Swap a matched fabric for a different one manually
- [ ] Add Paintbrush Studio Grunge solids as a second fabric line
- [ ] Fabric line selector dropdown

### Phase 5 — Export & Vector Output

The end goal is SVG output — actual vector paths for each fabric region, not raster images.

- [ ] SVG export (vector paths per fabric region — the real deliverable)
- [ ] Improved PDF layout with fabric names, SKUs, and yardage estimates
- [ ] PNG export of pattern only
- [ ] Save/load project state (JSON)

### Accessibility & Theming

- [ ] Light / Dark / High Contrast color schemes (easily accessible toggle — older audience)
- [ ] Migrate CSS to BEM naming convention
- [ ] Large touch targets, readable font sizes throughout
- [ ] Keyboard navigation for all controls

### Future Ideas

- **Simplify brush:** paint over busy areas (shirts, grass, hair) to flatten them into a single fabric color
- Additional fabric libraries (Moda Bella Solids, FreeSpirit, etc.)
- Pattern templates / aspect ratio presets (wall hanging, lap quilt, throw)
- Numbered regions on pattern (like paint-by-numbers, but for fabric)
- Rotate before processing
- Community palette sharing

## Tech Stack

- Vanilla JS (ES modules), may adopt TypeScript + bundler as complexity grows
- Canvas API for image processing
- jsPDF (CDN) for PDF generation

## Getting Started

Served as a static site via Apache vhost at `http://applique-studio.log/`.

Open `http://applique-studio.log/image-convertor.html` in any modern browser.

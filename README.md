# Appliqué Studio

A browser-based tool that converts photos into simplified appliqué quilt patterns using real-world fabric colors.

## The Problem

Appliqué quilts require you to greatly simplify and abstract a photo down to shapes that can reasonably be cut from fabric. Fine details like grass, hair, or cloth texture aren't practical to reproduce. You need to reduce an image to a small number of solid-color regions, where each region maps to a specific purchasable fabric.

Existing tools either require technical skills (Photoshop, Illustrator), have complex install requirements (Homebrew deps), or don't understand the fabric-first workflow quilters actually need.

## The Solution

Upload a photo, pick a fabric line, adjust a few sliders, and get a pattern with a fabric shopping list. That's it.

**Target audience:** Non-technical quilt guild members working from iPhone photos.

## Current State (v0.1 — Proof of Concept)

Single HTML file with:

- Photo upload (drag-and-drop or tap)
- K-means color quantization (3-12 colors)
- Detail level slider
- Side-by-side original vs. pattern preview
- Color swatches with hex codes and percentages
- PDF export with pattern + color shopping list

## Roadmap

### Phase 1 — Foundation (Crop + Modular Architecture + Real Fabrics)

- [ ] Add interactive crop tool as the first step after upload (retain original for re-cropping)
- [ ] Break monolith HTML into ES modules (image processing, color engine, UI, PDF export)
- [ ] Add Kona Cotton Solids fabric library (names, hex/RGB values, SKU codes)
- [ ] Replace RGB Euclidean distance with perceptual color matching (CIELAB Delta-E)
- [ ] Map quantized colors to nearest Kona fabric match
- [ ] Show fabric name + swatch in palette (not just hex codes)
- [ ] Increase color range to 6-20 (typical appliqué quilt range)

### Phase 2 — Intuitive Image Controls

- [ ] Brightness / contrast sliders
- [ ] "Warmer / Cooler" color temperature slider
- [ ] "More reds / fewer reds", "More blues / fewer blues" style tint adjusters
- [ ] Before/after toggle or side-by-side comparison
- [ ] All labels in plain language (no jargon like "saturation" or "hue shift")

### Phase 3 — Fabric Palette Management

- [ ] Let user set a custom color palette (pick N fabrics from the library)
- [ ] Lock/unlock individual colors in the palette
- [ ] Swap a matched fabric for a different one manually
- [ ] Add Paintbrush Studio Grunge solids as a second fabric line
- [ ] Fabric line selector dropdown

### Phase 4 — Pattern Refinement

- [ ] Edge smoothing / simplification (reduce jagged region boundaries)
- [ ] Minimum region size control (eliminate tiny slivers that can't be cut)
- [ ] Optional grid/ruler overlay for scaling
- [ ] Rotate before processing

### Phase 5 — Export & Sharing

- [ ] Improved PDF layout with fabric names, SKUs, and yardage estimates
- [ ] PNG export of pattern only
- [ ] SVG export (vector paths for each fabric region)
- [ ] Save/load project state (JSON)

### Future Ideas

- Additional fabric libraries (Moda Bella Solids, FreeSpirit, etc.)
- Pattern templates / aspect ratio presets (wall hanging, lap quilt, throw)
- Numbered regions on pattern (like paint-by-numbers, but for fabric)
- Community palette sharing
- Side-by-side fabric photo previews (show actual fabric texture)

## Tech Stack

- Vanilla JS (ES modules)
- Canvas API for image processing
- jsPDF (CDN) for PDF generation
- No build step — open `index.html` in a browser

## Getting Started

Served as a static site via Apache vhost at `http://applique-studio.log/`.

Open `http://applique-studio.log/image-convertor.html` in any modern browser.

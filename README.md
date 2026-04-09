# Appliqué Studio

A browser-based tool that converts photos into simplified appliqué quilt patterns using real-world fabric colors.

## The Problem

Appliqué quilts require you to greatly simplify and abstract a photo down to shapes that can reasonably be cut from fabric. Fine details like grass, hair, or cloth texture aren't practical to reproduce. You need to reduce an image to a small number of solid-color regions, where each region maps to a specific purchasable fabric.

Existing tools either require technical skills (Photoshop, Illustrator), have complex install requirements (Homebrew deps), or don't understand the fabric-first workflow quilters actually need.

## The Solution

Upload a photo, pick a fabric line, adjust a few sliders, and get a pattern with a fabric shopping list. That's it.

**Target audience:** Non-technical quilt guild members working from iPhone photos.
## How It Works

Appliqué Studio turns your photo into a quilt pattern in 4 simple steps:

1. **Choose Your Photo** — Upload or capture a photo you love
2. **Frame Your Design** — Crop the area you want, pick your final size (width in inches)
3. **Pick Your Complexity** — Adjust how many fabrics and how detailed the shapes should be
4. **Get Your Pattern** — Preview your design and download a shopping list of real fabrics to order

## The Art of Simplification

Your quilt won't look pixelated or blocky. Instead, it looks like a **stylized map** with flowing, curved seams:

- Colors are simplified to match real Kona Cotton fabrics (you pick how many)
- Small noise and stray pixels are cleaned up automatically
- Shapes follow your photo's contours naturally—rounded, curved, with organic edges
- Tiny details merge into larger shapes for simpler cutting

**Your control:** The "Complexity" slider adjusts how much detail remains. Lower = simpler patterns (faster cutting), Higher = more contoured shapes (more realistic to the original).

## Who This Is For

- Quilters (beginner to experienced) who want to turn beloved photos into appliqué patterns
- Non-technical makers—no design or software skills needed
- Anyone who wants to skip the manual tracing and get straight to cutting fabric

## Design Philosophy

> "We don't want to re-invent Photoshop, Inkscape, Illustrator, GIMP — for one, huge learning curve, for another — we can't, waaaaay out of our league. We should instead look for *limiting* features because unlike those general-purpose apps ours has ONE workflow and one goal: a pattern to cut fabric."

This means:

- **Dimensions in inches**, not pixels. (Metric support later, US first.)
- **No graphics jargon** in the UI — no vertices, splines, bezier curves, DPI, resolution.
- **Every feature must answer:** "Does this help someone cut fabric?"
- When in doubt, **constrain** rather than expose options.
- A hidden dev/advanced mode is fine for development and power users, but the default experience is quilter-first.

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

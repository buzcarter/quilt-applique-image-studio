# Appliqué Studio

A browser-based tool that converts photos into simplified appliqué quilt patterns using real-world fabric colors.

## The Problem

Appliqué quilts require you to greatly simplify and abstract a photo down to shapes that can reasonably be cut from fabric. Fine details like grass, hair, or cloth texture aren't practical to reproduce. You need to reduce an image to a small number of solid-color regions, where each region maps to a specific purchasable fabric.

Existing tools either require technical skills (Photoshop, Illustrator), have complex install requirements (Homebrew deps), or don't understand the fabric-first workflow quilters actually need.

## The Solution

Upload a photo, pick a fabric line, adjust a few sliders, and get a pattern with a fabric shopping list. That's it.

**Target audience:** Non-technical quilt guild members working from iPhone photos.
## How It Works

Appliqué Studio turns your photo into a quilt pattern in 5 simple steps:

1. **Choose Your Photo** — Upload or capture a photo you love
2. **Frame Your Design** — Crop the area you want, pick your final size (width in inches)
3. **Build Simplified Base** — Set Number of Fabrics and Smallest Piece to create a clean base map
4. **Shape The Pattern** — Adjust Curve Complexity and Smoothness, and optionally Paint/Erase cleanup areas
5. **Get Your Pattern** — Preview the vector pattern and download a PDF with real fabrics to order

## The Art of Simplification

Your quilt won't look pixelated or blocky. Instead, it looks like a **stylized map** with flowing, curved seams:

- Colors are simplified to match real Kona Cotton fabrics (you pick how many)
- Small noise and stray pixels are cleaned up automatically
- Shapes follow your photo's contours naturally—rounded, curved, with organic edges
- Tiny details merge into larger shapes for simpler cutting
- Optional paint cleanup can manually flatten busy spots directly on the Simplified map

**Your control:** Number of Fabrics + Smallest Piece define the Simplified map. Curve Complexity + Smoothness only affect vector seam shaping on top of that map.

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

## Current Product Status (April 2026)

### Implemented

- Crop-first workflow with re-crop support
- Deterministic two-stage processing pipeline:
	- Simplified stage: Number of Fabrics, Quilt Width, Smallest Piece
	- Pattern stage: Curve Complexity, Smoothness
- Region merging for minimum piece size cleanup
- Automatic background assignment:
	- Highest pixel-share color becomes Background
	- Tie-break is alphabetical fabric name
	- Background is rendered as one full-size base layer, never as pieces
- Fabric matching to Kona Cotton Solids using CIELAB Delta-E
- Pattern vector generation from traced contours with simplification and smoothing
- Paint and Erase tools on Simplified with brush size and swatch-driven paint color
- Paint overlay merge into source assignments before Pattern generation:
	- Painted pixels replace Simplified source pixels
	- Erased pixels reveal underlying Simplified source
- Pattern and shopping list piece counts with background labeling
- Vector-safe PDF export (source SVG embedded through svg2pdf, not rasterized)

### Important behavior contracts

- Moving Smoothness or Curve Complexity does not re-run k-means.
- Moving Number of Fabrics, Smallest Piece, Quilt Width, or changing crop re-runs quantization.
- Background color is excluded from piece counting and path generation.
- Pattern SVG paths are fill-only (no path strokes).

## Next Priorities

- Save/load editable paint overlay in session/project state
- Add explicit SVG export file download (in addition to PDF embedding)
- Add alternate fabric libraries and a fabric-line picker
- Continue CSS refactor toward BEM + theme tokens
- Break `js/app.js` into smaller modules to keep concerns isolated

## Tech Stack

- Vanilla JS (ES modules), may adopt TypeScript + bundler as complexity grows
- Canvas API for image processing
- jsPDF (CDN) for PDF generation

## Getting Started

Served as a static site via Apache vhost at `http://applique-studio.log/`.

Open `http://applique-studio.log/` (or `http://applique-studio.log/index.html`) in any modern browser.

--

[Orchid Line Interface Icons Collection](https://www.svgrepo.com/collection/orchid-line-interface-icons)

Includes `images/icons/github.svg` from that collection.
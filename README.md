# Quilt Pattern Generator - Project Context

## What This Is
A single-file HTML app that converts photos into simplified n-color applique patterns for quilting. Built for non-technical quilt guild members who need an easy way to turn iPhone photos into fabric patterns.

## User Story
Buz needed a simple tool for older quilt guild ladies to:
- Upload a photo
- Reduce it to 3-12 colors (for fabric selection)
- See which colors make up what percentage (for fabric purchasing)
- Download a PDF with the pattern + color guide

## Why This Exists
VectorDrop app failed (required Homebrew dependencies, not user-friendly). Needed something zero-install that works in a browser.

## Technical Implementation
- **Single HTML file** (`quilt-pattern-generator.html`) - no build process, no dependencies except CDN jsPDF
- **K-means clustering** for color quantization (10 iterations)
- **Two sliders:**
  - Color count (3-12 colors)
  - Detail level (50-200, affects pattern resolution before quantization)
- **Live preview:** Original photo vs. simplified pattern side-by-side
- **Color swatches:** Shows hex codes + percentage of pattern each color occupies
- **PDF export:** Pattern image + color shopping list with percentages

## Current State
Working v1 delivered. File lives in Buz's Downloads folder.

## If Buz Wants Modifications
Common requests might be:
- UI tweaks (colors, layout, button text)
- Different PDF formatting
- Add features (grid overlay, stitch count, rotate/crop)
- Adjust k-means parameters (more iterations, different distance metrics)
- Export formats (PNG, SVG)

## File Location
The HTML file should be on Buz's Mac somewhere (probably Downloads). If modifications are needed, Desktop Claude can edit it in place rather than regenerating the whole thing.

## Key Design Decisions
- **No backend** - everything client-side in browser
- **Drag-and-drop first** - phone users can tap to upload
- **Minimal UI** - two sliders, that's it
- **Posterization approach** - not vectorization (simpler, faster, more predictable for fabric patterns)
- **Percentage data** - quilters need to know how much fabric to buy, not just colors

## Tech Stack
- Vanilla JS (no frameworks)
- Canvas API for image processing
- jsPDF (CDN) for PDF generation
- CSS Grid for responsive layout

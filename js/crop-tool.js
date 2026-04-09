/**
 * Interactive crop tool with drag handles.
 * Draws a crop overlay on a canvas and lets user drag edges/corners.
 */

const HANDLE_SIZE = 10;
const OVERLAY_COLOR = 'rgba(0, 0, 0, 0.5)';
const BORDER_COLOR = '#fff';
const HANDLE_COLOR = '#2c5f4f';

export class CropTool {
  /**
   * @param {HTMLCanvasElement} canvas - The canvas element to draw on
   * @param {HTMLImageElement} image - The source image
   * @param {Function} onCropChange - Called with crop rect when user finishes dragging
   */
  constructor(canvas, image, onCropChange) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.image = image;
    this.onCropChange = onCropChange;

    // Display dimensions (fit to canvas)
    this.displayScale = 1;
    this.offsetX = 0;
    this.offsetY = 0;

    // Crop rect in image coordinates (full image initially)
    this.crop = { x: 0, y: 0, w: image.naturalWidth, h: image.naturalHeight };
    this.aspectRatio = null; // null = free, number = w/h ratio (e.g. 1 for square)

    this.dragging = null; // which handle/region is being dragged
    this.dragStart = { x: 0, y: 0 };
    this.cropStart = null;

    this._onMouseDown = this._onMouseDown.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onMouseUp = this._onMouseUp.bind(this);
    this._onTouchStart = this._onTouchStart.bind(this);
    this._onTouchMove = this._onTouchMove.bind(this);
    this._onTouchEnd = this._onTouchEnd.bind(this);

    this._setupCanvas();
    this._attachEvents();
    this.draw();
  }

  _setupCanvas() {
    const maxW = this.canvas.parentElement.clientWidth || 600;
    const maxH = 500;
    const imgW = this.image.naturalWidth;
    const imgH = this.image.naturalHeight;

    this.displayScale = Math.min(maxW / imgW, maxH / imgH, 1);
    const dw = Math.floor(imgW * this.displayScale);
    const dh = Math.floor(imgH * this.displayScale);

    this.canvas.width = dw;
    this.canvas.height = dh;
    this.canvas.style.cursor = 'crosshair';
  }

  _attachEvents() {
    this.canvas.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('mouseup', this._onMouseUp);
    this.canvas.addEventListener('touchstart', this._onTouchStart, { passive: false });
    window.addEventListener('touchmove', this._onTouchMove, { passive: false });
    window.addEventListener('touchend', this._onTouchEnd);
  }

  destroy() {
    this.canvas.removeEventListener('mousedown', this._onMouseDown);
    window.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('mouseup', this._onMouseUp);
    this.canvas.removeEventListener('touchstart', this._onTouchStart);
    window.removeEventListener('touchmove', this._onTouchMove);
    window.removeEventListener('touchend', this._onTouchEnd);
  }

  /** Convert canvas pixel coords to image coords */
  _toImageCoords(cx, cy) {
    return {
      x: cx / this.displayScale,
      y: cy / this.displayScale,
    };
  }

  /** Convert image coords to canvas pixel coords */
  _toCanvasCoords(ix, iy) {
    return {
      x: ix * this.displayScale,
      y: iy * this.displayScale,
    };
  }

  /** Determine which handle (if any) is near the given canvas point */
  _hitTest(cx, cy) {
    const { x, y, w, h } = this.crop;
    const tl = this._toCanvasCoords(x, y);
    const br = this._toCanvasCoords(x + w, y + h);
    const hs = HANDLE_SIZE;

    // Corners
    if (Math.abs(cx - tl.x) < hs && Math.abs(cy - tl.y) < hs) return 'tl';
    if (Math.abs(cx - br.x) < hs && Math.abs(cy - tl.y) < hs) return 'tr';
    if (Math.abs(cx - tl.x) < hs && Math.abs(cy - br.y) < hs) return 'bl';
    if (Math.abs(cx - br.x) < hs && Math.abs(cy - br.y) < hs) return 'br';

    // Edges
    if (Math.abs(cx - tl.x) < hs && cy > tl.y && cy < br.y) return 'l';
    if (Math.abs(cx - br.x) < hs && cy > tl.y && cy < br.y) return 'r';
    if (Math.abs(cy - tl.y) < hs && cx > tl.x && cx < br.x) return 't';
    if (Math.abs(cy - br.y) < hs && cx > tl.x && cx < br.x) return 'b';

    // Inside crop region = move
    if (cx > tl.x && cx < br.x && cy > tl.y && cy < br.y) return 'move';

    return null;
  }

  _getCanvasXY(e) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }

  _onMouseDown(e) {
    const pos = this._getCanvasXY(e);
    this._startDrag(pos.x, pos.y);
  }

  _onMouseMove(e) {
    if (!this.dragging) {
      const pos = this._getCanvasXY(e);
      this._updateCursor(pos.x, pos.y);
      return;
    }
    const pos = this._getCanvasXY(e);
    this._doDrag(pos.x, pos.y);
  }

  _onMouseUp() {
    this._endDrag();
  }

  _onTouchStart(e) {
    e.preventDefault();
    const touch = e.touches[0];
    const pos = this._getCanvasXY(touch);
    this._startDrag(pos.x, pos.y);
  }

  _onTouchMove(e) {
    e.preventDefault();
    if (!this.dragging) return;
    const touch = e.touches[0];
    const pos = this._getCanvasXY(touch);
    this._doDrag(pos.x, pos.y);
  }

  _onTouchEnd() {
    this._endDrag();
  }

  _startDrag(cx, cy) {
    const hit = this._hitTest(cx, cy);
    if (!hit) return;
    this.dragging = hit;
    this.dragStart = { x: cx, y: cy };
    this.cropStart = { ...this.crop };
  }

  _doDrag(cx, cy) {
    if (!this.dragging || !this.cropStart) return;

    const img = this._toImageCoords(cx, cy);
    const startImg = this._toImageCoords(this.dragStart.x, this.dragStart.y);
    const dx = img.x - startImg.x;
    const dy = img.y - startImg.y;
    const cs = this.cropStart;
    const imgW = this.image.naturalWidth;
    const imgH = this.image.naturalHeight;
    const minSize = 20;

    let { x, y, w, h } = cs;

    switch (this.dragging) {
      case 'move':
        x = Math.max(0, Math.min(cs.x + dx, imgW - cs.w));
        y = Math.max(0, Math.min(cs.y + dy, imgH - cs.h));
        w = cs.w;
        h = cs.h;
        break;
      case 'tl':
        x = Math.max(0, Math.min(cs.x + dx, cs.x + cs.w - minSize));
        y = Math.max(0, Math.min(cs.y + dy, cs.y + cs.h - minSize));
        w = cs.w - (x - cs.x);
        h = cs.h - (y - cs.y);
        break;
      case 'tr':
        y = Math.max(0, Math.min(cs.y + dy, cs.y + cs.h - minSize));
        w = Math.max(minSize, Math.min(cs.w + dx, imgW - cs.x));
        h = cs.h - (y - cs.y);
        break;
      case 'bl':
        x = Math.max(0, Math.min(cs.x + dx, cs.x + cs.w - minSize));
        w = cs.w - (x - cs.x);
        h = Math.max(minSize, Math.min(cs.h + dy, imgH - cs.y));
        break;
      case 'br':
        w = Math.max(minSize, Math.min(cs.w + dx, imgW - cs.x));
        h = Math.max(minSize, Math.min(cs.h + dy, imgH - cs.y));
        break;
      case 'l':
        x = Math.max(0, Math.min(cs.x + dx, cs.x + cs.w - minSize));
        w = cs.w - (x - cs.x);
        break;
      case 'r':
        w = Math.max(minSize, Math.min(cs.w + dx, imgW - cs.x));
        break;
      case 't':
        y = Math.max(0, Math.min(cs.y + dy, cs.y + cs.h - minSize));
        h = cs.h - (y - cs.y);
        break;
      case 'b':
        h = Math.max(minSize, Math.min(cs.h + dy, imgH - cs.y));
        break;
    }

    // Enforce aspect ratio constraint
    if (this.aspectRatio && this.dragging !== 'move') {
      h = w / this.aspectRatio;
      // Keep within image bounds
      if (y + h > imgH) {
        h = imgH - y;
        w = h * this.aspectRatio;
      }
      if (x + w > imgW) {
        w = imgW - x;
        h = w / this.aspectRatio;
      }
    }

    this.crop = { x, y, w, h };
    this.draw();
  }

  _endDrag() {
    if (this.dragging) {
      this.dragging = null;
      this.cropStart = null;
      if (this.onCropChange) {
        this.onCropChange(this.getCrop());
      }
    }
  }

  _updateCursor(cx, cy) {
    const hit = this._hitTest(cx, cy);
    const cursors = {
      tl: 'nwse-resize', br: 'nwse-resize',
      tr: 'nesw-resize', bl: 'nesw-resize',
      l: 'ew-resize', r: 'ew-resize',
      t: 'ns-resize', b: 'ns-resize',
      move: 'move',
    };
    this.canvas.style.cursor = cursors[hit] || 'crosshair';
  }

  /** Draw the image with crop overlay */
  draw() {
    const ctx = this.ctx;
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    const s = this.displayScale;

    // Draw full image
    ctx.clearRect(0, 0, cw, ch);
    ctx.drawImage(this.image, 0, 0, cw, ch);

    // Dim outside crop area
    const cx = this.crop.x * s;
    const cy = this.crop.y * s;
    const cropW = this.crop.w * s;
    const cropH = this.crop.h * s;

    ctx.fillStyle = OVERLAY_COLOR;
    // Top
    ctx.fillRect(0, 0, cw, cy);
    // Bottom
    ctx.fillRect(0, cy + cropH, cw, ch - cy - cropH);
    // Left
    ctx.fillRect(0, cy, cx, cropH);
    // Right
    ctx.fillRect(cx + cropW, cy, cw - cx - cropW, cropH);

    // Border
    ctx.strokeStyle = BORDER_COLOR;
    ctx.lineWidth = 2;
    ctx.strokeRect(cx, cy, cropW, cropH);

    // Rule of thirds guides
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(cx + (cropW * i) / 3, cy);
      ctx.lineTo(cx + (cropW * i) / 3, cy + cropH);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx, cy + (cropH * i) / 3);
      ctx.lineTo(cx + cropW, cy + (cropH * i) / 3);
      ctx.stroke();
    }

    // Corner handles
    ctx.fillStyle = HANDLE_COLOR;
    const hs = HANDLE_SIZE;
    const handles = [
      [cx, cy], [cx + cropW, cy],
      [cx, cy + cropH], [cx + cropW, cy + cropH],
    ];
    for (const [hx, hy] of handles) {
      ctx.fillRect(hx - hs / 2, hy - hs / 2, hs, hs);
    }

    // Edge midpoint handles
    const edgeMids = [
      [cx + cropW / 2, cy],
      [cx + cropW / 2, cy + cropH],
      [cx, cy + cropH / 2],
      [cx + cropW, cy + cropH / 2],
    ];
    for (const [hx, hy] of edgeMids) {
      ctx.fillRect(hx - hs / 2, hy - hs / 2, hs, hs);
    }
  }

  /** Get crop in original image coordinates (integers) */
  getCrop() {
    return {
      x: Math.round(this.crop.x),
      y: Math.round(this.crop.y),
      w: Math.round(this.crop.w),
      h: Math.round(this.crop.h),
    };
  }

  /** Reset crop to full image (respects current aspect ratio constraint) */
  resetCrop() {
    if (this.aspectRatio) {
      const imgW = this.image.naturalWidth;
      const imgH = this.image.naturalHeight;
      // Fit the largest constrained rect inside the image
      let w = imgW;
      let h = w / this.aspectRatio;
      if (h > imgH) {
        h = imgH;
        w = h * this.aspectRatio;
      }
      this.crop = {
        x: (imgW - w) / 2,
        y: (imgH - h) / 2,
        w, h,
      };
    } else {
      this.crop = { x: 0, y: 0, w: this.image.naturalWidth, h: this.image.naturalHeight };
    }
    this.draw();
    if (this.onCropChange) {
      this.onCropChange(this.getCrop());
    }
  }

  /**
   * Set aspect ratio constraint.
   * @param {number|null} ratio - width/height ratio (1 = square), null = free
   */
  setAspectRatio(ratio) {
    this.aspectRatio = ratio;
    if (ratio) {
      // Constrain current crop to new ratio (shrink to fit)
      const currentRatio = this.crop.w / this.crop.h;
      if (currentRatio > ratio) {
        // Too wide, reduce width
        const newW = this.crop.h * ratio;
        this.crop.x += (this.crop.w - newW) / 2;
        this.crop.w = newW;
      } else {
        // Too tall, reduce height
        const newH = this.crop.w / ratio;
        this.crop.y += (this.crop.h - newH) / 2;
        this.crop.h = newH;
      }
    }
    this.draw();
    if (this.onCropChange) {
      this.onCropChange(this.getCrop());
    }
  }
}

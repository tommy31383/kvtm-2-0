// AtlasView — renders the atlas sheet image + region rects on a PixiJS canvas
// in "Atlas mode". Supports mouse drag to CREATE regions, click to SELECT, and
// drag corners to RESIZE selected regions.
//
// Coordinate system: Pixi canvas pixels = atlas page pixels (no scaling until
// user zooms via mouse wheel — Phase 3).

import { Application, Container, Sprite, Texture, Graphics, FederatedPointerEvent, Rectangle } from 'pixi.js';
import type { Atlas, AtlasRegion } from '../core/types.js';

export type AtlasTool = 'draw' | 'select';

export interface AtlasViewEvents {
  onRegionCreated?: (r: AtlasRegion) => void;
  onRegionSelected?: (name: string | null) => void;
  onRegionEdited?: (name: string, patch: Partial<AtlasRegion>) => void;
}

export class AtlasView {
  readonly root: Container;
  private atlas: Atlas;
  private sheetSprite?: Sprite;
  private rectsLayer: Container;
  private overlay: Graphics;       // for in-progress drag preview
  private events: AtlasViewEvents;
  private tool: AtlasTool = 'draw';
  private selectedName: string | null = null;

  // Drag state
  private dragStart: { x: number; y: number } | null = null;
  private dragMode: 'create' | 'move' | 'resize' | null = null;
  private dragTarget: AtlasRegion | null = null;
  private dragOffset = { x: 0, y: 0 };
  // Resize: which corner (dx,dy ∈ {-1, +1}) + the rect's original bounds
  private resizeCorner: { dx: number; dy: number } | null = null;
  private resizeStartRect: { x: number; y: number; w: number; h: number } | null = null;
  // Hit-radius for corner handle (in source-pixel coords)
  private static readonly HANDLE_RADIUS = 6;

  constructor(_app: Application, atlas: Atlas, events: AtlasViewEvents = {}) {
    this.atlas = atlas;
    this.events = events;
    this.root = new Container();
    this.root.label = 'atlas-view';
    this.rectsLayer = new Container();
    this.rectsLayer.label = 'atlas-rects';
    this.overlay = new Graphics();
    this.overlay.label = 'atlas-overlay';
    this.root.addChild(this.rectsLayer, this.overlay);

    // Enable pointer events on root
    this.root.eventMode = 'static';
    this.root.hitArea = new Rectangle(-10000, -10000, 20000, 20000);
    this.root.on('pointerdown', this.onPointerDown);
    this.root.on('pointermove', this.onPointerMove);
    this.root.on('pointerup', this.onPointerUp);
    this.root.on('pointerupoutside', this.onPointerUp);
    // Hover cursor updates (resize handle vs move vs draw)
    this.root.on('globalpointermove', this.onPointerHover);
  }

  private onPointerHover = (ev: FederatedPointerEvent) => {
    if (this.dragStart) return;  // dragging — let drag logic own cursor
    const p = ev.getLocalPosition(this.root);
    const canvas = (this.root as any).renderer?.canvas as HTMLCanvasElement | undefined;
    const targetCanvas = canvas ?? document.querySelector('#canvas-host canvas') as HTMLCanvasElement | null;
    if (!targetCanvas) return;

    // Check resize handle of selected
    if (this.selectedName) {
      const sel = this.atlas.pages[0]?.regions.find(r => r.name === this.selectedName);
      if (sel) {
        const corner = this.hitCorner(p.x, p.y, sel);
        if (corner) {
          // NW/SE → diagonal,  NE/SW → other diagonal
          targetCanvas.style.cursor = (corner.dx * corner.dy > 0) ? 'nwse-resize' : 'nesw-resize';
          return;
        }
      }
    }
    // Hover over a region → move; tool=draw on empty → crosshair
    const r = this.hitTest(p.x, p.y);
    if (r) targetCanvas.style.cursor = 'move';
    else if (this.tool === 'draw') targetCanvas.style.cursor = 'crosshair';
    else targetCanvas.style.cursor = 'default';
  };

  /** Swap the sheet texture (when user loads a new image). */
  setSheet(tex: Texture | undefined) {
    if (this.sheetSprite) {
      this.sheetSprite.destroy();
      this.sheetSprite = undefined;
    }
    if (tex) {
      this.sheetSprite = new Sprite(tex);
      this.sheetSprite.x = 0;
      this.sheetSprite.y = 0;
      this.root.addChildAt(this.sheetSprite, 0);
      // Update hit area to match sheet bounds
      this.root.hitArea = new Rectangle(0, 0, tex.width, tex.height);
    }
    this.redrawRects();
  }

  /** Replace the atlas data (when project changes). */
  setAtlas(atlas: Atlas) {
    this.atlas = atlas;
    this.redrawRects();
  }

  setTool(tool: AtlasTool) { this.tool = tool; }

  selectRegion(name: string | null) {
    this.selectedName = name;
    this.redrawRects();
    this.events.onRegionSelected?.(name);
  }

  /** Draw all atlas regions as colored rectangles + labels.
   *  Rotated regions (rotate=true / 90°) occupy h×w in the atlas, not w×h —
   *  Spine packers rotate sprites 90° to fit tighter. We swap dimensions for
   *  display so rect matches the actual area in the sheet. */
  private redrawRects() {
    this.rectsLayer.removeChildren();
    if (!this.atlas.pages.length) return;
    const page = this.atlas.pages[0];
    for (const r of page.regions) {
      const isSelected = r.name === this.selectedName;
      // Effective atlas-space dimensions accounting for rotation
      const aw = r.rotate ? r.height : r.width;
      const ah = r.rotate ? r.width  : r.height;

      const g = new Graphics();
      g.rect(r.x, r.y, aw, ah);
      g.stroke({
        color: isSelected ? 0xFFD700 : (r.rotate ? 0xa855f7 : 0x60a5fa),  // purple if rotated
        width: isSelected ? 2 : 1,
        alpha: isSelected ? 1.0 : 0.7,
      });
      if (isSelected) {
        g.rect(r.x, r.y, aw, ah).fill({ color: 0xFFD700, alpha: 0.08 });
        // Corner handles
        const hs = 4;
        [[r.x, r.y], [r.x + aw, r.y], [r.x, r.y + ah], [r.x + aw, r.y + ah]]
          .forEach(([cx, cy]) => {
            g.rect(cx - hs, cy - hs, hs * 2, hs * 2).fill({ color: 0xFFD700 });
          });
      }
      this.rectsLayer.addChild(g);
    }
  }

  // ── Pointer interaction ─────────────────────────────────────
  private onPointerDown = (ev: FederatedPointerEvent) => {
    const p = ev.getLocalPosition(this.root);
    this.dragStart = { x: p.x, y: p.y };

    // Always check corner of CURRENTLY-SELECTED region first (regardless of
    // current tool) — corner drag = resize.
    if (this.selectedName) {
      const sel = this.atlas.pages[0]?.regions.find(r => r.name === this.selectedName);
      if (sel) {
        const corner = this.hitCorner(p.x, p.y, sel);
        if (corner) {
          this.dragMode = 'resize';
          this.dragTarget = sel;
          this.resizeCorner = corner;
          const aw = sel.rotate ? sel.height : sel.width;
          const ah = sel.rotate ? sel.width  : sel.height;
          this.resizeStartRect = { x: sel.x, y: sel.y, w: aw, h: ah };
          return;
        }
      }
    }

    if (this.tool === 'draw') {
      // Start a NEW region drag
      this.dragMode = 'create';
      this.dragTarget = null;
    } else {
      // Select mode: find region under cursor
      const r = this.hitTest(p.x, p.y);
      if (r) {
        this.selectRegion(r.name);
        this.dragMode = 'move';
        this.dragTarget = r;
        this.dragOffset = { x: p.x - r.x, y: p.y - r.y };
      } else {
        this.selectRegion(null);
        this.dragMode = null;
      }
    }
  };

  /** Returns which corner of region is under cursor, else null. */
  private hitCorner(px: number, py: number, r: AtlasRegion): { dx: number; dy: number } | null {
    const aw = r.rotate ? r.height : r.width;
    const ah = r.rotate ? r.width  : r.height;
    const HR = AtlasView.HANDLE_RADIUS;
    const corners = [
      { dx: -1, dy: -1, x: r.x,        y: r.y        },
      { dx:  1, dy: -1, x: r.x + aw,   y: r.y        },
      { dx: -1, dy:  1, x: r.x,        y: r.y + ah   },
      { dx:  1, dy:  1, x: r.x + aw,   y: r.y + ah   },
    ];
    for (const c of corners) {
      if (Math.abs(px - c.x) < HR && Math.abs(py - c.y) < HR) {
        return { dx: c.dx, dy: c.dy };
      }
    }
    return null;
  }

  private onPointerMove = (ev: FederatedPointerEvent) => {
    if (!this.dragStart) return;
    const p = ev.getLocalPosition(this.root);

    if (this.dragMode === 'create') {
      // Live preview overlay
      this.overlay.clear();
      const x = Math.min(this.dragStart.x, p.x);
      const y = Math.min(this.dragStart.y, p.y);
      const w = Math.abs(p.x - this.dragStart.x);
      const h = Math.abs(p.y - this.dragStart.y);
      this.overlay.rect(x, y, w, h).stroke({ color: 0x10b981, width: 2, alpha: 0.9 });
      this.overlay.rect(x, y, w, h).fill({ color: 0x10b981, alpha: 0.15 });
    } else if (this.dragMode === 'move' && this.dragTarget) {
      this.dragTarget.x = Math.round(p.x - this.dragOffset.x);
      this.dragTarget.y = Math.round(p.y - this.dragOffset.y);
      this.events.onRegionEdited?.(this.dragTarget.name, { x: this.dragTarget.x, y: this.dragTarget.y });
      this.redrawRects();
    } else if (this.dragMode === 'resize' && this.dragTarget && this.resizeCorner && this.resizeStartRect) {
      const sr = this.resizeStartRect;
      const c = this.resizeCorner;
      // dx is movement of left/right edge, dy of top/bottom edge based on corner
      const ddx = p.x - this.dragStart!.x;
      const ddy = p.y - this.dragStart!.y;
      let nx = sr.x, ny = sr.y, nw = sr.w, nh = sr.h;
      if (c.dx < 0) { nx = sr.x + ddx; nw = sr.w - ddx; }
      else          {                  nw = sr.w + ddx; }
      if (c.dy < 0) { ny = sr.y + ddy; nh = sr.h - ddy; }
      else          {                  nh = sr.h + ddy; }
      // Min size 4×4
      if (nw < 4) { nw = 4; nx = c.dx < 0 ? sr.x + sr.w - 4 : sr.x; }
      if (nh < 4) { nh = 4; ny = c.dy < 0 ? sr.y + sr.h - 4 : sr.y; }
      // Write back. For rotated regions, atlas-space dimensions are swapped:
      // aw → height, ah → width.
      this.dragTarget.x = Math.round(nx);
      this.dragTarget.y = Math.round(ny);
      if (this.dragTarget.rotate) {
        this.dragTarget.height = Math.round(nw);
        this.dragTarget.width  = Math.round(nh);
      } else {
        this.dragTarget.width  = Math.round(nw);
        this.dragTarget.height = Math.round(nh);
      }
      this.events.onRegionEdited?.(this.dragTarget.name, {
        x: this.dragTarget.x, y: this.dragTarget.y,
        width: this.dragTarget.width, height: this.dragTarget.height,
      });
      this.redrawRects();
    }
  };

  private onPointerUp = (ev: FederatedPointerEvent) => {
    if (!this.dragStart) return;
    const p = ev.getLocalPosition(this.root);
    this.overlay.clear();

    if (this.dragMode === 'create') {
      const x = Math.min(this.dragStart.x, p.x);
      const y = Math.min(this.dragStart.y, p.y);
      const w = Math.abs(p.x - this.dragStart.x);
      const h = Math.abs(p.y - this.dragStart.y);
      // Only create if rect has meaningful size
      if (w >= 4 && h >= 4) {
        const page = this.atlas.pages[0];
        const baseName = `region_${page?.regions.length ?? 0}`;
        const newRegion: AtlasRegion = {
          name: baseName,
          x: Math.round(x),
          y: Math.round(y),
          width: Math.round(w),
          height: Math.round(h),
        };
        this.events.onRegionCreated?.(newRegion);
        this.selectRegion(baseName);
      }
    }

    this.dragStart = null;
    this.dragMode = null;
    this.dragTarget = null;
    this.resizeCorner = null;
    this.resizeStartRect = null;
  };

  /** Move selected region by (dx, dy) source-pixels (arrow keys). */
  nudgeSelected(dx: number, dy: number) {
    if (!this.selectedName) return;
    const r = this.atlas.pages[0]?.regions.find(r => r.name === this.selectedName);
    if (!r) return;
    r.x += dx;
    r.y += dy;
    this.events.onRegionEdited?.(r.name, { x: r.x, y: r.y });
    this.redrawRects();
  }

  /** Delete the currently selected region. Returns the deleted name or null. */
  deleteSelected(): string | null {
    if (!this.selectedName) return null;
    const page = this.atlas.pages[0];
    if (!page) return null;
    const idx = page.regions.findIndex(r => r.name === this.selectedName);
    if (idx < 0) return null;
    const deletedName = page.regions[idx].name;
    page.regions.splice(idx, 1);
    this.selectedName = null;
    this.redrawRects();
    return deletedName;
  }

  private hitTest(px: number, py: number): AtlasRegion | null {
    if (!this.atlas.pages.length) return null;
    const page = this.atlas.pages[0];
    for (let i = page.regions.length - 1; i >= 0; i--) {
      const r = page.regions[i];
      const aw = r.rotate ? r.height : r.width;
      const ah = r.rotate ? r.width  : r.height;
      if (px >= r.x && px <= r.x + aw && py >= r.y && py <= r.y + ah) {
        return r;
      }
    }
    return null;
  }

  destroy() {
    this.root.destroy({ children: true });
  }
}

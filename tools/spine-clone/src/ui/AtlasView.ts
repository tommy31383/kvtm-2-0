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
  }

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

  /** Draw all atlas regions as colored rectangles + labels. */
  private redrawRects() {
    this.rectsLayer.removeChildren();
    if (!this.atlas.pages.length) return;
    const page = this.atlas.pages[0];
    for (const r of page.regions) {
      const isSelected = r.name === this.selectedName;
      const g = new Graphics();
      g.rect(r.x, r.y, r.width, r.height);
      g.stroke({
        color: isSelected ? 0xFFD700 : 0x60a5fa,
        width: isSelected ? 2 : 1,
        alpha: isSelected ? 1.0 : 0.7,
      });
      if (isSelected) {
        g.rect(r.x, r.y, r.width, r.height).fill({ color: 0xFFD700, alpha: 0.08 });
        // Corner handles
        const hs = 4;
        [[r.x, r.y], [r.x + r.width, r.y], [r.x, r.y + r.height], [r.x + r.width, r.y + r.height]]
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

    if (this.tool === 'draw') {
      // Start a NEW region drag
      this.dragMode = 'create';
      this.dragTarget = null;
    } else {
      // Select mode: find region under cursor
      const r = this.hitTest(p.x, p.y);
      if (r) {
        this.selectRegion(r.name);
        // TODO: corner detection for resize mode (Phase 3)
        this.dragMode = 'move';
        this.dragTarget = r;
        this.dragOffset = { x: p.x - r.x, y: p.y - r.y };
      } else {
        this.selectRegion(null);
        this.dragMode = null;
      }
    }
  };

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
  };

  private hitTest(px: number, py: number): AtlasRegion | null {
    if (!this.atlas.pages.length) return null;
    const page = this.atlas.pages[0];
    // Reverse iterate so topmost (last drawn) wins
    for (let i = page.regions.length - 1; i >= 0; i--) {
      const r = page.regions[i];
      if (px >= r.x && px <= r.x + r.width && py >= r.y && py <= r.y + r.height) {
        return r;
      }
    }
    return null;
  }

  destroy() {
    this.root.destroy({ children: true });
  }
}

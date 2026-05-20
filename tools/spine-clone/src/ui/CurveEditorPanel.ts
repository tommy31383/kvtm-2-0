// CurveEditorPanel — visual bezier curve editor for keyframe easing.
//
// Edits the `curve` field of a single selected keyframe via SetKeyframeCurveCommand.
// Curve formats supported:
//   undefined / 'linear' → identity diagonal
//   'stepped'             → hold previous value (drawn as step)
//   [cx1, cy1, cx2, cy2]  → cubic bezier with 2 draggable control points
//
// Layout: square canvas (200×200) on left + control buttons on right.

import type { DocumentStore } from '../store/DocumentStore.js';
import type { CurveType } from '../core/types.js';
import type { TimelineRef } from '../store/commands/timelineRef.js';
import { resolveKeys, findKeyIndex } from '../store/commands/timelineRef.js';

const SIZE = 200;
const PAD = 14;
const KEY_R = 6;

export const CURVE_PRESETS: Record<string, CurveType> = {
  linear:        'linear',
  stepped:       'stepped',
  easeIn:        [0.42, 0,    1,    1],
  easeOut:       [0,    0,    0.58, 1],
  easeInOut:     [0.42, 0,    0.58, 1],
  easeInQuad:    [0.55, 0.085, 0.68, 0.53],
  easeOutQuad:   [0.25, 0.46, 0.45, 0.94],
  easeInOutQuad: [0.455, 0.03, 0.515, 0.955],
  easeInCubic:   [0.55, 0.055, 0.675, 0.19],
  easeOutCubic:  [0.215, 0.61, 0.355, 1],
  easeInOutCubic:[0.645, 0.045, 0.355, 1],
  elastic:       [0.5, -0.5, 0.5, 1.5],
  bounce:        [0.68, -0.55, 0.265, 1.55],
};

interface ActiveKey {
  ref: TimelineRef;
  time: number;
}

export class CurveEditorPanel {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private wrap: HTMLDivElement;
  private canvasWrap: HTMLDivElement;
  private controls: HTMLDivElement;
  private presetGrid: HTMLDivElement;

  private active: ActiveKey | null = null;
  private dragging: 0 | 1 | null = null;     // which control point is being dragged
  private dpr = window.devicePixelRatio || 1;

  constructor(host: HTMLElement, private store: DocumentStore) {
    this.wrap = host as HTMLDivElement;
    this.wrap.classList.remove('active');

    this.canvasWrap = document.createElement('div');
    this.canvasWrap.className = 'curve-editor-canvas-wrap';
    this.canvas = document.createElement('canvas');
    this.canvas.width = SIZE * this.dpr;
    this.canvas.height = SIZE * this.dpr;
    this.canvas.style.width = SIZE + 'px';
    this.canvas.style.height = SIZE + 'px';
    this.canvasWrap.appendChild(this.canvas);
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('canvas 2d unavailable');
    this.ctx = ctx;
    this.wrap.appendChild(this.canvasWrap);

    this.controls = document.createElement('div');
    this.controls.className = 'curve-editor-controls';
    this.wrap.appendChild(this.controls);

    const title = document.createElement('h4');
    title.textContent = 'Curve Editor';
    this.controls.appendChild(title);

    const info = document.createElement('div');
    info.className = 'row';
    info.id = 'curve-editor-info';
    info.style.color = '#6b7280';
    info.textContent = 'No keyframe selected';
    this.controls.appendChild(info);

    const presetTitle = document.createElement('h4');
    presetTitle.textContent = 'Presets';
    this.controls.appendChild(presetTitle);

    this.presetGrid = document.createElement('div');
    this.presetGrid.className = 'curve-preset-grid';
    this.controls.appendChild(this.presetGrid);

    for (const name of Object.keys(CURVE_PRESETS)) {
      const btn = document.createElement('button');
      btn.textContent = name;
      btn.dataset.preset = name;
      btn.onclick = () => this.applyPreset(name);
      this.presetGrid.appendChild(btn);
    }

    this.setupEvents();
    this.draw();
  }

  /** Switch the editor to operate on a specific keyframe (or null to clear). */
  setActive(key: ActiveKey | null): void {
    this.active = key;
    if (key) {
      this.wrap.classList.add('active');
      const info = this.controls.querySelector('#curve-editor-info') as HTMLDivElement;
      const label = key.ref.kind === 'bone' ? `${key.ref.bone}.${key.ref.channel}` : `${key.ref.slot}.${key.ref.channel}`;
      info.textContent = `${label} @ ${key.time.toFixed(3)}s`;
      info.style.color = '#e8e4d8';
    } else {
      this.wrap.classList.remove('active');
    }
    this.refreshPresetHighlight();
    this.draw();
  }

  private getCurve(): CurveType | undefined {
    if (!this.active) return undefined;
    const keys = resolveKeys(this.store.skeleton, this.active.ref);
    if (!keys) return undefined;
    const idx = findKeyIndex(keys, this.active.time);
    if (idx === -1) return undefined;
    return keys[idx].curve;
  }

  private refreshPresetHighlight(): void {
    const cur = this.getCurve();
    const curName = this.matchPreset(cur);
    for (const btn of Array.from(this.presetGrid.querySelectorAll('button'))) {
      const b = btn as HTMLButtonElement;
      b.classList.toggle('active', b.dataset.preset === curName);
    }
  }

  private matchPreset(curve: CurveType | undefined): string | null {
    if (curve === undefined || curve === 'linear') return 'linear';
    if (curve === 'stepped') return 'stepped';
    if (!Array.isArray(curve)) return null;
    for (const [name, preset] of Object.entries(CURVE_PRESETS)) {
      if (!Array.isArray(preset)) continue;
      let ok = true;
      for (let i = 0; i < 4; i++) {
        if (Math.abs((preset as number[])[i] - curve[i]) > 1e-3) { ok = false; break; }
      }
      if (ok) return name;
    }
    return null;
  }

  private applyPreset(name: string): void {
    if (!this.active) return;
    const preset = CURVE_PRESETS[name];
    const value: CurveType | undefined = preset === 'linear' ? undefined : preset;
    this.store.setKeyframeCurve(this.active.ref, this.active.time, value);
    this.refreshPresetHighlight();
    this.draw();
  }

  // ── Mouse drag on bezier handles ────────────────────────────
  private setupEvents(): void {
    this.canvas.addEventListener('mousedown', e => {
      if (!this.active) return;
      const curve = this.getCurve();
      if (!Array.isArray(curve)) return;
      const rect = this.canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const p1 = this.curveToScreen(curve[0], curve[1]);
      const p2 = this.curveToScreen(curve[2], curve[3]);
      if (Math.hypot(mx - p1.x, my - p1.y) < KEY_R + 4) this.dragging = 0;
      else if (Math.hypot(mx - p2.x, my - p2.y) < KEY_R + 4) this.dragging = 1;
    });
    this.canvas.addEventListener('mousemove', e => {
      if (this.dragging === null || !this.active) return;
      const rect = this.canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const cur = this.getCurve();
      const arr: [number, number, number, number] = Array.isArray(cur)
        ? [cur[0], cur[1], cur[2], cur[3]]
        : [0.42, 0, 0.58, 1];
      const p = this.screenToCurve(mx, my);
      if (this.dragging === 0) { arr[0] = p.x; arr[1] = p.y; }
      else { arr[2] = p.x; arr[3] = p.y; }
      this.store.setKeyframeCurve(this.active.ref, this.active.time, arr);
      this.refreshPresetHighlight();
      this.draw();
    });
    window.addEventListener('mouseup', () => { this.dragging = null; });
  }

  // ── Coord conversion: bezier (0..1) → canvas pixels ─────────
  private curveToScreen(cx: number, cy: number): { x: number; y: number } {
    return {
      x: PAD + cx * (SIZE - 2 * PAD),
      y: (SIZE - PAD) - cy * (SIZE - 2 * PAD),
    };
  }
  private screenToCurve(x: number, y: number): { x: number; y: number } {
    return {
      x: Math.max(0, Math.min(1, (x - PAD) / (SIZE - 2 * PAD))),
      // Don't clamp Y — elastic/bounce go outside [0,1]
      y: ((SIZE - PAD) - y) / (SIZE - 2 * PAD),
    };
  }

  // ── Draw ────────────────────────────────────────────────────
  private draw(): void {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, SIZE, SIZE);

    // Background
    ctx.fillStyle = '#0c0f15';
    ctx.fillRect(0, 0, SIZE, SIZE);

    // Grid
    ctx.strokeStyle = '#1a1f2b';
    ctx.lineWidth = 1;
    for (let i = 1; i < 10; i++) {
      const t = i / 10;
      ctx.beginPath();
      const x = PAD + t * (SIZE - 2 * PAD);
      ctx.moveTo(x, PAD); ctx.lineTo(x, SIZE - PAD);
      ctx.stroke();
      ctx.beginPath();
      const y = PAD + t * (SIZE - 2 * PAD);
      ctx.moveTo(PAD, y); ctx.lineTo(SIZE - PAD, y);
      ctx.stroke();
    }
    // Axis box
    ctx.strokeStyle = '#2a3040';
    ctx.strokeRect(PAD + 0.5, PAD + 0.5, SIZE - 2 * PAD, SIZE - 2 * PAD);

    // Reference identity line
    ctx.strokeStyle = '#1a1f2b';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(PAD, SIZE - PAD);
    ctx.lineTo(SIZE - PAD, PAD);
    ctx.stroke();
    ctx.setLineDash([]);

    const curve = this.getCurve();
    if (curve === undefined || curve === 'linear') {
      // Identity diagonal
      ctx.strokeStyle = '#60a5fa';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(PAD, SIZE - PAD);
      ctx.lineTo(SIZE - PAD, PAD);
      ctx.stroke();
    } else if (curve === 'stepped') {
      ctx.strokeStyle = '#9ca3af';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(PAD, SIZE - PAD);
      ctx.lineTo(SIZE - PAD, SIZE - PAD);
      ctx.lineTo(SIZE - PAD, PAD);
      ctx.stroke();
    } else {
      // Bezier — sample 64 points
      const [cx1, cy1, cx2, cy2] = curve;
      const p0 = this.curveToScreen(0, 0);
      const p3 = this.curveToScreen(1, 1);
      const p1 = this.curveToScreen(cx1, cy1);
      const p2 = this.curveToScreen(cx2, cy2);

      // Tangent lines
      ctx.strokeStyle = '#6b7280';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y);
      ctx.moveTo(p3.x, p3.y); ctx.lineTo(p2.x, p2.y);
      ctx.stroke();

      // Curve
      ctx.strokeStyle = '#60a5fa';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      for (let i = 1; i <= 64; i++) {
        const t = i / 64;
        const omt = 1 - t;
        const bx = omt * omt * omt * 0 + 3 * omt * omt * t * cx1 + 3 * omt * t * t * cx2 + t * t * t * 1;
        const by = omt * omt * omt * 0 + 3 * omt * omt * t * cy1 + 3 * omt * t * t * cy2 + t * t * t * 1;
        const sp = this.curveToScreen(bx, by);
        ctx.lineTo(sp.x, sp.y);
      }
      ctx.stroke();

      // Control points
      for (const [cx, cy] of [[cx1, cy1], [cx2, cy2]] as const) {
        const p = this.curveToScreen(cx, cy);
        ctx.fillStyle = '#FFD700';
        ctx.beginPath();
        ctx.arc(p.x, p.y, KEY_R, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (!this.active) {
      ctx.fillStyle = 'rgba(12, 15, 21, 0.7)';
      ctx.fillRect(0, 0, SIZE, SIZE);
      ctx.fillStyle = '#6b7280';
      ctx.font = '11px ui-sans-serif, system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('Select a keyframe', SIZE / 2, SIZE / 2);
      ctx.textAlign = 'left';
    }
  }
}

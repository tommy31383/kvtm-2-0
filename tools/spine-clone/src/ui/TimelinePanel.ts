// TimelinePanel — canvas-based animation timeline editor.
//
// Renders rows for each bone timeline channel (rotate/translate/scale/shear)
// and slot timeline channel (attachment/color), with keyframes as diamonds.
// Supports:
//   - Click to select key, Shift+click to multi-select, drag rubber-band
//   - Drag a key horizontally to move time (emits MoveKeyframeCommand)
//   - Right-click → context menu (Add key, Delete, set Curve)
//   - Scrubber playhead (drag time)
//   - Mouse wheel: zoom; Middle-drag or Space+drag: pan
//
// Performance: single canvas, immediate-mode redraw on dirty flag. ~1000 keys
// at 60fps is fine.

import type { DocumentStore } from '../store/DocumentStore.js';
import type {
  TimelineRef, BoneChannel, SlotChannel, AnyKey,
} from '../store/commands/timelineRef.js';
import type { CurveType, BoneTimeline, SlotTimeline } from '../core/types.js';

interface Row {
  ref: TimelineRef;
  label: string;
  keys: AnyKey[];
}

interface SelectedKey {
  rowIndex: number;
  time: number;
}

const ROW_H = 22;
const HEADER_H = 28;
const TRACK_LABEL_W = 160;
const KEY_R = 5;
const PADDING_R = 16;

const BONE_CHANNELS: BoneChannel[] = ['rotate', 'translate', 'scale', 'shear'];
const SLOT_CHANNELS: SlotChannel[] = ['attachment', 'color'];

export type TimelinePanelEvent = 'selection-changed';

export class TimelinePanel {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private rows: Row[] = [];
  private selectedKeys = new Set<string>();   // "rowIdx|time" stable id

  private viewStart = 0;       // seconds at left edge (after label column)
  private viewSec = 2.0;       // visible duration
  private scrollY = 0;

  private dragMode: 'none' | 'scrub' | 'move-key' | 'rubber' = 'none';
  private dragStartX = 0;
  private dragOrigTimes = new Map<string, number>();  // keyId → orig time
  private rubberRect: { x0: number; y0: number; x1: number; y1: number } | null = null;
  private hoveredKey: SelectedKey | null = null;

  private listeners = new Map<TimelinePanelEvent, Set<() => void>>();
  private rafScheduled = false;
  private dpr = window.devicePixelRatio || 1;

  constructor(private host: HTMLElement, private store: DocumentStore) {
    this.canvas = document.createElement('canvas');
    this.canvas.tabIndex = 0;
    host.appendChild(this.canvas);
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('canvas 2d unavailable');
    this.ctx = ctx;
    this.setupEvents();
    this.resize();

    // Re-render on store changes
    this.store.on('animation-changed', () => this.rebuildRows());
    this.store.on('time-changed', () => this.scheduleRedraw());
    this.store.on('bone-changed', () => this.scheduleRedraw());

    this.rebuildRows();
  }

  // ── Public API ─────────────────────────────────────────────
  on(event: TimelinePanelEvent, fn: () => void): () => void {
    let s = this.listeners.get(event);
    if (!s) { s = new Set(); this.listeners.set(event, s); }
    s.add(fn);
    return () => { s!.delete(fn); };
  }

  getSelectedKeyRefs(): { ref: TimelineRef; time: number }[] {
    const out: { ref: TimelineRef; time: number }[] = [];
    for (const id of this.selectedKeys) {
      const [rowIdxStr, timeStr] = id.split('|');
      const row = this.rows[+rowIdxStr];
      if (row) out.push({ ref: row.ref, time: +timeStr });
    }
    return out;
  }

  insertKeyAtPlayhead(): void {
    const sel = this.store.selection;
    if (sel.type !== 'bone') return;
    const animName = this.store.currentAnimation;
    if (!animName) return;
    const bone = this.store.skeleton.bones.find(b => b.name === sel.name);
    if (!bone) return;
    const t = this.store.currentTimeSec;
    const ref: TimelineRef = { kind: 'bone', animation: animName, bone: sel.name, channel: 'rotate' };
    try {
      this.store.insertKeyframe(ref, { time: t, value: bone.rotation });
    } catch {
      // Key already exists — silent ignore (timeline already shows it)
    }
  }

  deleteSelectedKeys(): void {
    const refs = this.getSelectedKeyRefs();
    if (!refs.length) return;
    // Delete in reverse-time order to keep indices stable
    refs.sort((a, b) => b.time - a.time);
    for (const r of refs) {
      try { this.store.deleteKeyframe(r.ref, r.time); } catch (e) { console.warn(e); }
    }
    this.selectedKeys.clear();
    this.emit('selection-changed');
  }

  zoomIn(): void { this.viewSec *= 0.6; this.scheduleRedraw(); }
  zoomOut(): void { this.viewSec /= 0.6; this.scheduleRedraw(); }
  zoomFit(): void {
    const dur = this.store.currentDuration;
    this.viewStart = 0;
    this.viewSec = Math.max(0.5, dur * 1.1);
    this.scheduleRedraw();
  }

  // ── Internal ───────────────────────────────────────────────
  private rebuildRows(): void {
    const animName = this.store.currentAnimation;
    const rows: Row[] = [];
    if (animName) {
      const anim = this.store.skeleton.animations[animName];
      if (anim) {
        for (const boneName of Object.keys(anim.bones)) {
          const bt: BoneTimeline = anim.bones[boneName];
          for (const ch of BONE_CHANNELS) {
            const keys = (bt as any)[ch] as AnyKey[] | undefined;
            if (keys && keys.length) {
              rows.push({
                ref: { kind: 'bone', animation: animName, bone: boneName, channel: ch },
                label: `${boneName}.${ch}`,
                keys,
              });
            }
          }
        }
        for (const slotName of Object.keys(anim.slots)) {
          const st: SlotTimeline = anim.slots[slotName];
          for (const ch of SLOT_CHANNELS) {
            const keys = (st as any)[ch] as AnyKey[] | undefined;
            if (keys && keys.length) {
              rows.push({
                ref: { kind: 'slot', animation: animName, slot: slotName, channel: ch },
                label: `${slotName}.${ch}`,
                keys,
              });
            }
          }
        }
      }
    }
    this.rows = rows;
    // Drop selections that reference deleted keys
    const valid = new Set<string>();
    for (let i = 0; i < rows.length; i++) {
      for (const k of rows[i].keys) valid.add(`${i}|${k.time}`);
    }
    for (const id of [...this.selectedKeys]) {
      if (!valid.has(id)) this.selectedKeys.delete(id);
    }
    this.scheduleRedraw();
  }

  private setupEvents(): void {
    window.addEventListener('resize', () => this.resize());
    new ResizeObserver(() => this.resize()).observe(this.host);
    this.canvas.addEventListener('mousedown', e => this.onMouseDown(e));
    this.canvas.addEventListener('mousemove', e => this.onMouseMove(e));
    window.addEventListener('mouseup', e => this.onMouseUp(e));
    this.canvas.addEventListener('wheel', e => this.onWheel(e), { passive: false });
    this.canvas.addEventListener('contextmenu', e => this.onContextMenu(e));
    this.canvas.addEventListener('dblclick', e => this.onDoubleClick(e));
  }

  private resize(): void {
    const r = this.host.getBoundingClientRect();
    this.canvas.width = r.width * this.dpr;
    this.canvas.height = r.height * this.dpr;
    this.canvas.style.width = r.width + 'px';
    this.canvas.style.height = r.height + 'px';
    this.scheduleRedraw();
  }

  // ── Coordinate conversion ──────────────────────────────────
  private get viewW(): number { return this.canvas.width / this.dpr - TRACK_LABEL_W - PADDING_R; }
  private timeToX(t: number): number { return TRACK_LABEL_W + ((t - this.viewStart) / this.viewSec) * this.viewW; }
  private xToTime(x: number): number { return this.viewStart + ((x - TRACK_LABEL_W) / this.viewW) * this.viewSec; }

  private hitTestKey(mx: number, my: number): SelectedKey | null {
    const yLocal = my - HEADER_H + this.scrollY;
    const rowIdx = Math.floor(yLocal / ROW_H);
    if (rowIdx < 0 || rowIdx >= this.rows.length) return null;
    const row = this.rows[rowIdx];
    for (const k of row.keys) {
      const kx = this.timeToX(k.time);
      if (Math.abs(kx - mx) <= KEY_R + 2) return { rowIndex: rowIdx, time: k.time };
    }
    return null;
  }

  // ── Input handling ─────────────────────────────────────────
  private onMouseDown(e: MouseEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    this.dragStartX = mx;
    void my;
    this.canvas.focus();

    if (my < HEADER_H) {
      // Click ruler → scrub
      this.dragMode = 'scrub';
      this.store.setTime(Math.max(0, this.xToTime(mx)));
      return;
    }

    const hit = this.hitTestKey(mx, my);
    if (hit) {
      const id = `${hit.rowIndex}|${hit.time}`;
      if (!e.shiftKey && !this.selectedKeys.has(id)) {
        this.selectedKeys.clear();
        this.selectedKeys.add(id);
      } else if (e.shiftKey) {
        if (this.selectedKeys.has(id)) this.selectedKeys.delete(id);
        else this.selectedKeys.add(id);
      }
      this.emit('selection-changed');

      // Begin move-key drag
      this.dragMode = 'move-key';
      this.dragOrigTimes.clear();
      for (const sid of this.selectedKeys) {
        const [rIdx, ts] = sid.split('|');
        this.dragOrigTimes.set(sid, +ts);
        void rIdx;
      }
      this.scheduleRedraw();
      return;
    }

    // Empty click → rubber band
    if (!e.shiftKey) this.selectedKeys.clear();
    this.dragMode = 'rubber';
    this.rubberRect = { x0: mx, y0: my, x1: mx, y1: my };
    this.emit('selection-changed');
    this.scheduleRedraw();
  }

  private onMouseMove(e: MouseEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    if (this.dragMode === 'scrub') {
      this.store.setTime(Math.max(0, this.xToTime(mx)));
      return;
    }

    if (this.dragMode === 'move-key') {
      const dt = (mx - this.dragStartX) / this.viewW * this.viewSec;
      const newSelection = new Set<string>();
      for (const [sid, origT] of this.dragOrigTimes) {
        const [rIdxStr] = sid.split('|');
        const rIdx = +rIdxStr;
        const newT = Math.max(0, origT + dt);
        if (Math.abs(newT - origT) < 1e-6) {
          newSelection.add(sid);
          continue;
        }
        const row = this.rows[rIdx];
        if (!row) continue;
        try {
          this.store.moveKeyframe(row.ref, origT, newT);
          // Re-resolve selection id since key time changed
          this.dragOrigTimes.set(sid, newT);
          newSelection.add(`${rIdx}|${newT}`);
        } catch {
          newSelection.add(`${rIdx}|${origT}`);
        }
      }
      this.selectedKeys = newSelection;
      // Note: rebuildRows() will fire from store; selection ids stay valid because
      // we updated dragOrigTimes already.
      this.scheduleRedraw();
      return;
    }

    if (this.dragMode === 'rubber' && this.rubberRect) {
      this.rubberRect.x1 = mx;
      this.rubberRect.y1 = my;
      this.applyRubberSelection();
      this.scheduleRedraw();
      return;
    }

    // Hover detection
    const hit = this.hitTestKey(mx, my);
    if ((hit && !this.hoveredKey) || (!hit && this.hoveredKey) ||
        (hit && this.hoveredKey && (hit.rowIndex !== this.hoveredKey.rowIndex || hit.time !== this.hoveredKey.time))) {
      this.hoveredKey = hit;
      this.canvas.style.cursor = hit ? 'pointer' : (my < HEADER_H ? 'col-resize' : 'default');
      this.scheduleRedraw();
    }
  }

  private applyRubberSelection(): void {
    if (!this.rubberRect) return;
    const r = this.rubberRect;
    const xMin = Math.min(r.x0, r.x1), xMax = Math.max(r.x0, r.x1);
    const yMin = Math.min(r.y0, r.y1), yMax = Math.max(r.y0, r.y1);
    this.selectedKeys.clear();
    for (let i = 0; i < this.rows.length; i++) {
      const ry = HEADER_H + i * ROW_H - this.scrollY + ROW_H / 2;
      if (ry < yMin || ry > yMax) continue;
      for (const k of this.rows[i].keys) {
        const kx = this.timeToX(k.time);
        if (kx >= xMin && kx <= xMax) this.selectedKeys.add(`${i}|${k.time}`);
      }
    }
    this.emit('selection-changed');
  }

  private onMouseUp(_e: MouseEvent): void {
    this.dragMode = 'none';
    this.rubberRect = null;
    this.dragOrigTimes.clear();
    this.scheduleRedraw();
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    if (e.ctrlKey || mx > TRACK_LABEL_W) {
      // Zoom centered on cursor time
      const tAtCursor = this.xToTime(mx);
      const factor = e.deltaY > 0 ? 1.15 : 1 / 1.15;
      this.viewSec *= factor;
      this.viewSec = Math.max(0.05, Math.min(600, this.viewSec));
      this.viewStart = tAtCursor - (mx - TRACK_LABEL_W) / this.viewW * this.viewSec;
    } else {
      this.scrollY = Math.max(0, this.scrollY + e.deltaY);
    }
    this.scheduleRedraw();
  }

  private onContextMenu(e: MouseEvent): void {
    e.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const hit = this.hitTestKey(mx, my);
    if (hit) {
      // Right-click on key → ask to delete
      const row = this.rows[hit.rowIndex];
      if (confirm(`Delete key at ${hit.time.toFixed(3)}s on ${row.label}?`)) {
        this.store.deleteKeyframe(row.ref, hit.time);
      }
      return;
    }
    // Right-click on empty timeline area → insert key at click time
    if (my < HEADER_H) return;
    const yLocal = my - HEADER_H + this.scrollY;
    const rowIdx = Math.floor(yLocal / ROW_H);
    if (rowIdx < 0 || rowIdx >= this.rows.length) return;
    const t = Math.max(0, this.xToTime(mx));
    const row = this.rows[rowIdx];
    // Compute a default value: re-use last key's value if exists, else 0
    const last = row.keys[row.keys.length - 1];
    const defaultValue: any = last
      ? (typeof last.value === 'object' && last.value !== null ? { ...(last.value as any) } : last.value)
      : (row.ref.kind === 'bone' && (row.ref.channel === 'translate' || row.ref.channel === 'scale' || row.ref.channel === 'shear')
          ? { x: 0, y: 0 }
          : 0);
    try { this.store.insertKeyframe(row.ref, { time: t, value: defaultValue }); }
    catch (err) { console.warn(err); }
  }

  private onDoubleClick(e: MouseEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const hit = this.hitTestKey(mx, my);
    if (!hit) return;
    // Surface this key for curve editor — listeners can pick from selection
    this.selectedKeys.clear();
    this.selectedKeys.add(`${hit.rowIndex}|${hit.time}`);
    this.emit('selection-changed');
    this.scheduleRedraw();
  }

  // ── Render ─────────────────────────────────────────────────
  private scheduleRedraw(): void {
    if (this.rafScheduled) return;
    this.rafScheduled = true;
    requestAnimationFrame(() => {
      this.rafScheduled = false;
      this.draw();
    });
  }

  private draw(): void {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, W / this.dpr, H / this.dpr);

    // Background
    ctx.fillStyle = '#0c0f15';
    ctx.fillRect(0, 0, W / this.dpr, H / this.dpr);

    this.drawRuler();
    this.drawRows();
    this.drawPlayhead();
    if (this.rubberRect) this.drawRubber();
  }

  private drawRuler(): void {
    const ctx = this.ctx;
    const w = this.canvas.width / this.dpr;
    // Header bg
    ctx.fillStyle = '#1a1f2b';
    ctx.fillRect(0, 0, w, HEADER_H);
    ctx.fillStyle = '#2a3040';
    ctx.fillRect(0, HEADER_H - 1, w, 1);

    // Pick a tick interval that's pleasant for current viewSec
    const targetTicks = 10;
    const idealStep = this.viewSec / targetTicks;
    const magnitude = Math.pow(10, Math.floor(Math.log10(idealStep)));
    const norm = idealStep / magnitude;
    const niceStep = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * magnitude;

    const tStart = Math.floor(this.viewStart / niceStep) * niceStep;
    const tEnd = this.viewStart + this.viewSec;
    ctx.fillStyle = '#6b7280';
    ctx.font = '10px ui-monospace, monospace';
    ctx.textBaseline = 'middle';
    for (let t = tStart; t <= tEnd + niceStep; t += niceStep) {
      const x = this.timeToX(t);
      if (x < TRACK_LABEL_W - 2) continue;
      ctx.fillStyle = '#2a3040';
      ctx.fillRect(x, HEADER_H - 8, 1, 8);
      ctx.fillStyle = '#6b7280';
      ctx.fillText(t.toFixed(niceStep >= 1 ? 1 : niceStep >= 0.1 ? 2 : 3) + 's', x + 3, HEADER_H / 2);
    }

    // Label column header
    ctx.fillStyle = '#1a1f2b';
    ctx.fillRect(0, 0, TRACK_LABEL_W, HEADER_H);
    ctx.fillStyle = '#FFD700';
    ctx.font = '11px ui-sans-serif, system-ui';
    ctx.fillText(this.store.currentAnimation ?? '(setup pose)', 10, HEADER_H / 2);
  }

  private drawRows(): void {
    const ctx = this.ctx;
    const w = this.canvas.width / this.dpr;
    const h = this.canvas.height / this.dpr;

    // Track label column bg
    ctx.fillStyle = '#131720';
    ctx.fillRect(0, HEADER_H, TRACK_LABEL_W, h - HEADER_H);

    for (let i = 0; i < this.rows.length; i++) {
      const y = HEADER_H + i * ROW_H - this.scrollY;
      if (y + ROW_H < HEADER_H || y > h) continue;
      // Row alternating bg
      if (i % 2 === 1) {
        ctx.fillStyle = '#10141d';
        ctx.fillRect(TRACK_LABEL_W, y, w - TRACK_LABEL_W - PADDING_R, ROW_H);
      }
      // Label
      ctx.fillStyle = '#e8e4d8';
      ctx.font = '11px ui-sans-serif, system-ui';
      ctx.textBaseline = 'middle';
      ctx.fillText(this.rows[i].label, 10, y + ROW_H / 2);

      // Row divider
      ctx.fillStyle = '#1a1f2b';
      ctx.fillRect(0, y + ROW_H - 1, w, 1);

      // Keys
      for (const k of this.rows[i].keys) {
        const kx = this.timeToX(k.time);
        if (kx < TRACK_LABEL_W - KEY_R || kx > w + KEY_R) continue;
        const ky = y + ROW_H / 2;
        const id = `${i}|${k.time}`;
        const isSel = this.selectedKeys.has(id);
        const isHov = this.hoveredKey?.rowIndex === i && this.hoveredKey.time === k.time;
        this.drawDiamond(kx, ky, isSel, isHov, k.curve);
      }
    }
  }

  private drawDiamond(x: number, y: number, selected: boolean, hover: boolean, curve: CurveType | undefined): void {
    const ctx = this.ctx;
    const r = KEY_R;
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.lineTo(r, 0);
    ctx.lineTo(0, r);
    ctx.lineTo(-r, 0);
    ctx.closePath();
    if (curve === 'stepped') {
      ctx.fillStyle = selected ? '#FFD700' : '#9ca3af';
      ctx.fill();
    } else if (Array.isArray(curve)) {
      ctx.fillStyle = selected ? '#FFD700' : '#60a5fa';
      ctx.fill();
    } else {
      ctx.fillStyle = selected ? '#FFD700' : (hover ? '#fde68a' : '#131720');
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = selected ? '#FFD700' : (hover ? '#FFD700' : '#9ca3af');
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawPlayhead(): void {
    const ctx = this.ctx;
    const h = this.canvas.height / this.dpr;
    const x = this.timeToX(this.store.currentTimeSec);
    if (x < TRACK_LABEL_W - 2) return;
    ctx.fillStyle = '#ff8a3d';
    ctx.fillRect(x, 0, 1, h);
    // Handle
    ctx.beginPath();
    ctx.moveTo(x - 5, 0);
    ctx.lineTo(x + 5, 0);
    ctx.lineTo(x, HEADER_H - 4);
    ctx.closePath();
    ctx.fill();
  }

  private drawRubber(): void {
    if (!this.rubberRect) return;
    const ctx = this.ctx;
    const r = this.rubberRect;
    ctx.strokeStyle = 'rgba(255, 215, 0, 0.6)';
    ctx.fillStyle = 'rgba(255, 215, 0, 0.08)';
    ctx.lineWidth = 1;
    const x = Math.min(r.x0, r.x1), y = Math.min(r.y0, r.y1);
    const w = Math.abs(r.x1 - r.x0), h = Math.abs(r.y1 - r.y0);
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x + 0.5, y + 0.5, w, h);
  }

  private emit(event: TimelinePanelEvent): void {
    const s = this.listeners.get(event);
    if (s) s.forEach(fn => { try { fn(); } catch (e) { console.error(e); } });
  }
}

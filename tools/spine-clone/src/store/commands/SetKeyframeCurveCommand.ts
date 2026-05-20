// SetKeyframeCurveCommand — change the easing curve on a keyframe.
// Coalesces when user drags bezier handles (many micro-changes per frame).

import type { Command } from './Command.js';
import type { DocumentStore } from '../DocumentStore.js';
import type { CurveType } from '../../core/types.js';
import {
  resolveKeys, findKeyIndex, refKey,
  type TimelineRef,
} from './timelineRef.js';

export class SetKeyframeCurveCommand implements Command {
  readonly label: string;
  readonly createdAt = performance.now();
  private prevCurve: CurveType | undefined;
  private captured = false;

  constructor(
    readonly ref: TimelineRef,
    readonly time: number,
    readonly newCurve: CurveType | undefined,
  ) {
    this.label = `Set curve @ ${time.toFixed(3)}s`;
  }

  do(store: DocumentStore): void {
    const keys = resolveKeys(store.skeleton, this.ref);
    if (!keys) throw new Error('timeline not found');
    const idx = findKeyIndex(keys, this.time);
    if (idx === -1) throw new Error(`no key at t=${this.time}`);
    if (!this.captured) {
      this.prevCurve = cloneCurve(keys[idx].curve);
      this.captured = true;
    }
    keys[idx].curve = cloneCurve(this.newCurve);
    store._emitAnimationChanged();
  }

  undo(store: DocumentStore): void {
    const keys = resolveKeys(store.skeleton, this.ref);
    if (!keys) throw new Error('timeline not found');
    const idx = findKeyIndex(keys, this.time);
    if (idx === -1) throw new Error(`no key at t=${this.time}`);
    keys[idx].curve = cloneCurve(this.prevCurve);
    store._emitAnimationChanged();
  }

  coalesceWith(prev: Command): Command | null {
    if (!(prev instanceof SetKeyframeCurveCommand)) return null;
    if (refKey(prev.ref) !== refKey(this.ref)) return null;
    if (Math.abs(prev.time - this.time) > 1e-6) return null;
    const merged = new SetKeyframeCurveCommand(this.ref, this.time, this.newCurve);
    merged.prevCurve = cloneCurve(prev.prevCurve);
    merged.captured = true;
    return merged;
  }
}

function cloneCurve(c: CurveType | undefined): CurveType | undefined {
  if (c === undefined) return undefined;
  if (Array.isArray(c)) return [c[0], c[1], c[2], c[3]];
  return c;
}

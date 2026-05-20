// SetKeyframeValueCommand — change the `value` of an existing keyframe.
// Coalesces consecutive value edits of the same key — e.g. live-drag of a
// rotation slider while a key is selected.

import type { Command } from './Command.js';
import type { DocumentStore } from '../DocumentStore.js';
import {
  resolveKeys, findKeyIndex, refKey,
  type TimelineRef, type TimelineValue,
} from './timelineRef.js';

export class SetKeyframeValueCommand implements Command {
  readonly label: string;
  readonly createdAt = performance.now();
  private prevValue: TimelineValue | undefined;
  private captured = false;

  constructor(
    readonly ref: TimelineRef,
    readonly time: number,
    readonly newValue: TimelineValue,
  ) {
    this.label = `Set key value @ ${time.toFixed(3)}s`;
  }

  do(store: DocumentStore): void {
    const keys = resolveKeys(store.skeleton, this.ref);
    if (!keys) throw new Error('timeline not found');
    const idx = findKeyIndex(keys, this.time);
    if (idx === -1) throw new Error(`no key at t=${this.time}`);
    if (!this.captured) {
      this.prevValue = cloneValue(keys[idx].value);
      this.captured = true;
    }
    keys[idx].value = cloneValue(this.newValue);
    store._emitAnimationChanged();
  }

  undo(store: DocumentStore): void {
    const keys = resolveKeys(store.skeleton, this.ref);
    if (!keys) throw new Error('timeline not found');
    const idx = findKeyIndex(keys, this.time);
    if (idx === -1) throw new Error(`no key at t=${this.time}`);
    keys[idx].value = cloneValue(this.prevValue!);
    store._emitAnimationChanged();
  }

  coalesceWith(prev: Command): Command | null {
    if (!(prev instanceof SetKeyframeValueCommand)) return null;
    if (refKey(prev.ref) !== refKey(this.ref)) return null;
    if (Math.abs(prev.time - this.time) > 1e-6) return null;
    const merged = new SetKeyframeValueCommand(this.ref, this.time, this.newValue);
    merged.prevValue = cloneValue(prev.prevValue!);
    merged.captured = true;
    return merged;
  }
}

function cloneValue(v: TimelineValue): TimelineValue {
  if (v === null || v === undefined) return v as TimelineValue;
  if (typeof v === 'object') return { x: v.x, y: v.y };
  return v;
}

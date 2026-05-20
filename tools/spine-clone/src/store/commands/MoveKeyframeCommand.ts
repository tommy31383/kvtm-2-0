// MoveKeyframeCommand — change a key's time while preserving sorted order.
// Coalesces consecutive moves of the SAME key (matched by original time) within
// the history's coalesce window — a drag gesture collapses to 1 undo unit.

import type { Command } from './Command.js';
import type { DocumentStore } from '../DocumentStore.js';
import {
  resolveKeys, findKeyIndex, recomputeDuration, getAnimation, refKey,
  type TimelineRef,
} from './timelineRef.js';

export class MoveKeyframeCommand implements Command {
  readonly label: string;
  readonly createdAt = performance.now();

  constructor(
    readonly ref: TimelineRef,
    readonly fromTime: number,
    readonly toTime: number,
  ) {
    this.label = `Move key ${fromTime.toFixed(3)}s → ${toTime.toFixed(3)}s`;
  }

  do(store: DocumentStore): void {
    this.move(store, this.fromTime, this.toTime);
  }

  undo(store: DocumentStore): void {
    this.move(store, this.toTime, this.fromTime);
  }

  private move(store: DocumentStore, from: number, to: number): void {
    const keys = resolveKeys(store.skeleton, this.ref);
    if (!keys) throw new Error('timeline not found');
    const idx = findKeyIndex(keys, from);
    if (idx === -1) throw new Error(`no key at t=${from}`);
    if (findKeyIndex(keys, to) !== -1 && Math.abs(from - to) > 1e-6) {
      throw new Error(`target time t=${to} already has a key`);
    }
    const key = keys[idx];
    keys.splice(idx, 1);
    key.time = to;
    // Insert sorted
    let i = 0;
    while (i < keys.length && keys[i].time < to) i++;
    keys.splice(i, 0, key);
    const anim = getAnimation(store.skeleton, this.ref.animation)!;
    recomputeDuration(anim);
    store._emitAnimationChanged();
  }

  coalesceWith(prev: Command): Command | null {
    if (!(prev instanceof MoveKeyframeCommand)) return null;
    if (refKey(prev.ref) !== refKey(this.ref)) return null;
    // Prev moved A → B; this moves B → C. Merge into A → C.
    if (Math.abs(prev.toTime - this.fromTime) > 1e-6) return null;
    return new MoveKeyframeCommand(this.ref, prev.fromTime, this.toTime);
  }
}

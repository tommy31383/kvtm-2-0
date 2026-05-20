// DeleteKeyframeCommand — removes one keyframe by ref + time.
// Restores the EXACT key object on undo (including curve), not a reconstruction.

import type { Command } from './Command.js';
import type { DocumentStore } from '../DocumentStore.js';
import {
  resolveKeys, findKeyIndex, recomputeDuration, getAnimation, cloneKey,
  type TimelineRef, type AnyKey,
} from './timelineRef.js';

export class DeleteKeyframeCommand implements Command {
  readonly label: string;
  readonly createdAt = performance.now();
  private removed: AnyKey | undefined;
  private removedIndex = -1;

  constructor(readonly ref: TimelineRef, readonly time: number) {
    const ch = ref.kind === 'bone' ? `${ref.bone}.${ref.channel}` : `${ref.slot}.${ref.channel}`;
    this.label = `Delete key ${ch} @ ${time.toFixed(3)}s`;
  }

  do(store: DocumentStore): void {
    const keys = resolveKeys(store.skeleton, this.ref);
    if (!keys) throw new Error('timeline not found');
    const idx = findKeyIndex(keys, this.time);
    if (idx === -1) throw new Error(`no key at t=${this.time}`);
    this.removed = cloneKey(keys[idx]);
    this.removedIndex = idx;
    keys.splice(idx, 1);
    const anim = getAnimation(store.skeleton, this.ref.animation)!;
    recomputeDuration(anim);
    store._emitAnimationChanged();
  }

  undo(store: DocumentStore): void {
    const keys = resolveKeys(store.skeleton, this.ref, true)!;
    keys.splice(this.removedIndex, 0, cloneKey(this.removed!));
    const anim = getAnimation(store.skeleton, this.ref.animation)!;
    recomputeDuration(anim);
    store._emitAnimationChanged();
  }
}

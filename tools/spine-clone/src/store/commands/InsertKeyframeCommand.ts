// InsertKeyframeCommand — adds one keyframe to a timeline at a given time.
// If a key already exists at that time (within epsilon), do() throws.
//
// Does NOT coalesce — insertions are discrete user actions.

import type { Command } from './Command.js';
import type { DocumentStore } from '../DocumentStore.js';
import {
  resolveKeys, findKeyIndex, insertSorted, recomputeDuration, getAnimation,
  type TimelineRef, type AnyKey,
} from './timelineRef.js';

export class InsertKeyframeCommand implements Command {
  readonly label: string;
  readonly createdAt = performance.now();
  private insertedIndex = -1;

  constructor(readonly ref: TimelineRef, readonly key: AnyKey) {
    const ch = ref.kind === 'bone' ? `${ref.bone}.${ref.channel}` : `${ref.slot}.${ref.channel}`;
    this.label = `Insert key ${ch} @ ${key.time.toFixed(3)}s`;
  }

  do(store: DocumentStore): void {
    const keys = resolveKeys(store.skeleton, this.ref, true)!;
    if (findKeyIndex(keys, this.key.time) !== -1) {
      throw new Error(`keyframe already exists at t=${this.key.time}`);
    }
    this.insertedIndex = insertSorted(keys, this.key);
    const anim = getAnimation(store.skeleton, this.ref.animation)!;
    recomputeDuration(anim);
    store._emitAnimationChanged();
  }

  undo(store: DocumentStore): void {
    const keys = resolveKeys(store.skeleton, this.ref)!;
    keys.splice(this.insertedIndex, 1);
    const anim = getAnimation(store.skeleton, this.ref.animation)!;
    recomputeDuration(anim);
    store._emitAnimationChanged();
  }
}

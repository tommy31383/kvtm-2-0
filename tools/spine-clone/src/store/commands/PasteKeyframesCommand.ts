// PasteKeyframesCommand — insert a batch of keyframes at relative offsets from
// a base time. Used by clipboard paste. If a key collides with an existing key
// at the same time, the EXISTING key is replaced (snapshotted for undo).

import type { Command } from './Command.js';
import type { DocumentStore } from '../DocumentStore.js';
import {
  resolveKeys, findKeyIndex, recomputeDuration, getAnimation, cloneKey,
  type TimelineRef, type AnyKey,
} from './timelineRef.js';

export interface PasteEntry {
  ref: TimelineRef;
  key: AnyKey;       // key.time interpreted relative to baseTime
}

interface UndoSlot {
  ref: TimelineRef;
  insertedTime: number;     // final absolute time after paste
  replacedKey: AnyKey | null;  // null if no collision, else original key
}

export class PasteKeyframesCommand implements Command {
  readonly label: string;
  readonly createdAt = performance.now();
  private undoSlots: UndoSlot[] = [];

  constructor(readonly entries: PasteEntry[], readonly baseTime: number) {
    this.label = `Paste ${entries.length} keys @ ${baseTime.toFixed(3)}s`;
  }

  do(store: DocumentStore): void {
    this.undoSlots = [];
    const animsAffected = new Set<string>();

    for (const entry of this.entries) {
      const keys = resolveKeys(store.skeleton, entry.ref, true)!;
      const absTime = this.baseTime + entry.key.time;
      const newKey = cloneKey(entry.key);
      newKey.time = absTime;

      const collide = findKeyIndex(keys, absTime);
      if (collide !== -1) {
        this.undoSlots.push({
          ref: entry.ref,
          insertedTime: absTime,
          replacedKey: cloneKey(keys[collide]),
        });
        keys[collide] = newKey;
      } else {
        this.undoSlots.push({ ref: entry.ref, insertedTime: absTime, replacedKey: null });
        let i = 0;
        while (i < keys.length && keys[i].time < absTime) i++;
        keys.splice(i, 0, newKey);
      }
      animsAffected.add(entry.ref.animation);
    }

    for (const animName of animsAffected) {
      const anim = getAnimation(store.skeleton, animName);
      if (anim) recomputeDuration(anim);
    }
    store._emitAnimationChanged();
  }

  undo(store: DocumentStore): void {
    const animsAffected = new Set<string>();
    // Reverse order so indices remain stable
    for (let i = this.undoSlots.length - 1; i >= 0; i--) {
      const slot = this.undoSlots[i];
      const keys = resolveKeys(store.skeleton, slot.ref);
      if (!keys) continue;
      const idx = findKeyIndex(keys, slot.insertedTime);
      if (idx === -1) continue;
      if (slot.replacedKey) {
        keys[idx] = cloneKey(slot.replacedKey);
      } else {
        keys.splice(idx, 1);
      }
      animsAffected.add(slot.ref.animation);
    }
    for (const animName of animsAffected) {
      const anim = getAnimation(store.skeleton, animName);
      if (anim) recomputeDuration(anim);
    }
    store._emitAnimationChanged();
  }
}

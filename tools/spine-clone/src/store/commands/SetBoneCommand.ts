// SetBoneCommand — undoable bone TRS edit.
//
// Snapshots only the fields being patched (not the whole bone) → memory-cheap
// for 200-deep history. Coalesces with the previous SetBoneCommand if it targets
// the SAME bone with the SAME field set within the history's coalesce window —
// e.g. dragging a rotation handle emits 60 commands but collapses to 1 undo.

import type { Command } from './Command.js';
import type { Bone } from '../../core/types.js';
import type { DocumentStore } from '../DocumentStore.js';

export class SetBoneCommand implements Command {
  readonly label: string;
  readonly createdAt = performance.now();
  private prevValues: Partial<Bone> = {};
  private captured = false;

  constructor(
    readonly boneName: string,
    readonly patch: Partial<Bone>,
  ) {
    const fields = Object.keys(patch).join(',');
    this.label = `Set ${boneName}.${fields}`;
  }

  do(store: DocumentStore): void {
    const bone = store.skeleton.bones.find(b => b.name === this.boneName);
    if (!bone) throw new Error(`bone not found: ${this.boneName}`);

    // Capture prev state once — first do(). Subsequent redo() must replay the
    // SAME prev state for symmetric undo.
    if (!this.captured) {
      for (const k of Object.keys(this.patch)) {
        (this.prevValues as any)[k] = (bone as any)[k];
      }
      this.captured = true;
    }
    store._applyBonePatch(this.boneName, this.patch);
  }

  undo(store: DocumentStore): void {
    store._applyBonePatch(this.boneName, this.prevValues);
  }

  coalesceWith(prev: Command): Command | null {
    if (!(prev instanceof SetBoneCommand)) return null;
    if (prev.boneName !== this.boneName) return null;
    const prevFields = Object.keys(prev.patch).sort().join(',');
    const thisFields = Object.keys(this.patch).sort().join(',');
    if (prevFields !== thisFields) return null;

    // Merge: keep prev's snapshot (original state before gesture started),
    // adopt this's patch (final value of gesture).
    const merged = new SetBoneCommand(this.boneName, this.patch);
    merged.prevValues = { ...prev.prevValues };
    merged.captured = true;
    return merged;
  }
}

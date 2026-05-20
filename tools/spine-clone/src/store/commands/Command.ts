// Command pattern interface — every mutation that should be undoable
// implements this. Direct store mutation (via _apply*) bypasses history and is
// only called from inside command.do()/undo().
//
// Coalesce: same logical user gesture (drag, type-while-edit) emits N commands
// within a short window; CommandHistory merges them into one undo unit.

import type { DocumentStore } from '../DocumentStore.js';

export interface Command {
  /** Human-readable label for the undo menu. e.g. "Set arm.rotation". */
  readonly label: string;

  /** Performance.now() timestamp at construction — used for coalesce window. */
  readonly createdAt: number;

  /** Apply mutation. Called once on initial execute and once per redo. */
  do(store: DocumentStore): void;

  /** Revert mutation. Must restore the exact state captured during do(). */
  undo(store: DocumentStore): void;

  /**
   * Optional merge with the immediately previous command in the undo stack.
   * Return a single Command that does the combined effect, or null if not
   * coalescable. Called by CommandHistory.execute() when the prev command is
   * within the coalesce window.
   */
  coalesceWith?(prev: Command): Command | null;
}

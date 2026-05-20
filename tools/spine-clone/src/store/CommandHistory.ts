// Undo/redo stack for Command instances.
//
// Design:
// - execute(cmd) runs cmd.do(), pushes onto undo stack, clears redo stack
// - undo() pops undo → runs cmd.undo() → pushes to redo
// - redo() pops redo → runs cmd.do() → pushes back to undo
// - Coalesce: if new cmd arrives within window AND cmd.coalesceWith(prev) !=
//   null, replace top of undo with merged. Prevents 60-frame drag → 60 undos.
// - Limit: oldest commands evicted past limit (default 200). Trade memory for
//   bounded growth in long sessions.

import type { Command } from './commands/Command.js';
import type { DocumentStore } from './DocumentStore.js';

export interface HistoryOptions {
  /** Max commands kept in undo stack. Default 200. */
  limit?: number;
  /** Coalesce window in ms. Default 500. */
  coalesceWindowMs?: number;
}

export type HistoryEvent = 'changed';
type Listener = () => void;

export class CommandHistory {
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];
  private readonly limit: number;
  private readonly coalesceWindowMs: number;
  private listeners = new Set<Listener>();

  constructor(opts: HistoryOptions = {}) {
    this.limit = opts.limit ?? 200;
    this.coalesceWindowMs = opts.coalesceWindowMs ?? 500;
  }

  execute(store: DocumentStore, cmd: Command): void {
    cmd.do(store);
    this.redoStack = [];

    const prev = this.undoStack[this.undoStack.length - 1];
    if (
      prev &&
      cmd.createdAt - prev.createdAt < this.coalesceWindowMs &&
      cmd.coalesceWith
    ) {
      const merged = cmd.coalesceWith(prev);
      if (merged) {
        this.undoStack[this.undoStack.length - 1] = merged;
        this.emit();
        return;
      }
    }

    this.undoStack.push(cmd);
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.emit();
  }

  undo(store: DocumentStore): boolean {
    const cmd = this.undoStack.pop();
    if (!cmd) return false;
    cmd.undo(store);
    this.redoStack.push(cmd);
    this.emit();
    return true;
  }

  redo(store: DocumentStore): boolean {
    const cmd = this.redoStack.pop();
    if (!cmd) return false;
    cmd.do(store);
    this.undoStack.push(cmd);
    this.emit();
    return true;
  }

  clear(): void {
    if (this.undoStack.length === 0 && this.redoStack.length === 0) return;
    this.undoStack = [];
    this.redoStack = [];
    this.emit();
  }

  get canUndo(): boolean { return this.undoStack.length > 0; }
  get canRedo(): boolean { return this.redoStack.length > 0; }
  get undoLabel(): string | undefined { return this.undoStack[this.undoStack.length - 1]?.label; }
  get redoLabel(): string | undefined { return this.redoStack[this.redoStack.length - 1]?.label; }
  get undoSize(): number { return this.undoStack.length; }
  get redoSize(): number { return this.redoStack.length; }

  on(_event: HistoryEvent, fn: Listener): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  private emit(): void {
    this.listeners.forEach(fn => {
      try { fn(); } catch (err) { console.error('[history] listener error:', err); }
    });
  }
}

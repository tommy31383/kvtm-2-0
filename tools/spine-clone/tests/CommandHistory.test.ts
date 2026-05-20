import { describe, it, expect, vi } from 'vitest';
import { DocumentStore } from '../src/store/DocumentStore.js';
import { CommandHistory } from '../src/store/CommandHistory.js';
import { SetBoneCommand } from '../src/store/commands/SetBoneCommand.js';
import { makeEmptySkeleton } from '../src/core/types.js';
import type { Command } from '../src/store/commands/Command.js';

function makeStore() {
  const skel = makeEmptySkeleton('test');
  skel.bones.push({ name: 'arm', parent: 'root', length: 10, x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 });
  return new DocumentStore({ skeleton: skel, atlas: { pages: [] } });
}

describe('CommandHistory — basic flow', () => {
  it('execute → undo → redo', () => {
    const s = makeStore();
    const h = new CommandHistory();
    h.execute(s, new SetBoneCommand('arm', { rotation: 45 }));
    expect(s.skeleton.bones.find(b => b.name === 'arm')!.rotation).toBe(45);
    expect(h.canUndo).toBe(true);
    expect(h.canRedo).toBe(false);

    h.undo(s);
    expect(s.skeleton.bones.find(b => b.name === 'arm')!.rotation).toBe(0);
    expect(h.canUndo).toBe(false);
    expect(h.canRedo).toBe(true);

    h.redo(s);
    expect(s.skeleton.bones.find(b => b.name === 'arm')!.rotation).toBe(45);
  });

  it('new command clears redo stack', () => {
    const s = makeStore();
    const h = new CommandHistory();
    h.execute(s, new SetBoneCommand('arm', { rotation: 10 }));
    h.undo(s);
    expect(h.canRedo).toBe(true);
    h.execute(s, new SetBoneCommand('arm', { x: 5 }));
    expect(h.canRedo).toBe(false);
  });

  it('undo on empty returns false', () => {
    const s = makeStore();
    const h = new CommandHistory();
    expect(h.undo(s)).toBe(false);
    expect(h.redo(s)).toBe(false);
  });

  it('respects limit — oldest evicted', () => {
    const s = makeStore();
    const h = new CommandHistory({ limit: 3 });
    h.execute(s, new SetBoneCommand('arm', { rotation: 1 }));
    h.execute(s, new SetBoneCommand('arm', { x: 1 }));
    h.execute(s, new SetBoneCommand('arm', { y: 1 }));
    h.execute(s, new SetBoneCommand('arm', { scaleX: 2 }));
    expect(h.undoSize).toBe(3);
  });
});

describe('CommandHistory — coalesce', () => {
  it('merges consecutive commands within window', () => {
    const s = makeStore();
    const h = new CommandHistory({ coalesceWindowMs: 10000 });
    h.execute(s, new SetBoneCommand('arm', { rotation: 10 }));
    h.execute(s, new SetBoneCommand('arm', { rotation: 20 }));
    h.execute(s, new SetBoneCommand('arm', { rotation: 30 }));
    expect(h.undoSize).toBe(1);
    h.undo(s);
    expect(s.skeleton.bones.find(b => b.name === 'arm')!.rotation).toBe(0);
  });

  it('does NOT coalesce past the window', async () => {
    const s = makeStore();
    const h = new CommandHistory({ coalesceWindowMs: 1 });
    h.execute(s, new SetBoneCommand('arm', { rotation: 10 }));
    await new Promise(r => setTimeout(r, 20));
    h.execute(s, new SetBoneCommand('arm', { rotation: 20 }));
    expect(h.undoSize).toBe(2);
  });
});

describe('CommandHistory — events', () => {
  it('fires changed on execute/undo/redo/clear', () => {
    const s = makeStore();
    const h = new CommandHistory();
    const fn = vi.fn();
    h.on('changed', fn);
    h.execute(s, new SetBoneCommand('arm', { rotation: 1 }));
    h.undo(s);
    h.redo(s);
    h.clear();
    expect(fn.mock.calls.length).toBe(4);
  });
});

describe('DocumentStore — undo/redo integration', () => {
  it('setBone is undoable via store.undo()', () => {
    const s = makeStore();
    s.setBone('arm', { rotation: 45 });
    expect(s.skeleton.bones.find(b => b.name === 'arm')!.rotation).toBe(45);
    s.undo();
    expect(s.skeleton.bones.find(b => b.name === 'arm')!.rotation).toBe(0);
    s.redo();
    expect(s.skeleton.bones.find(b => b.name === 'arm')!.rotation).toBe(45);
  });

  it('setProject clears history', () => {
    const s = makeStore();
    s.setBone('arm', { rotation: 45 });
    expect(s.history.canUndo).toBe(true);
    s.setProject(makeEmptySkeleton('new'), { pages: [] });
    expect(s.history.canUndo).toBe(false);
  });

  it('non-coalescing rapid drag still produces correct final state', () => {
    const s = makeStore();
    for (let i = 1; i <= 30; i++) s.setBone('arm', { rotation: i });
    expect(s.skeleton.bones.find(b => b.name === 'arm')!.rotation).toBe(30);
    // Drag coalesces to 1 undo unit → single undo returns to start
    s.undo();
    expect(s.skeleton.bones.find(b => b.name === 'arm')!.rotation).toBe(0);
  });
});

// Sanity: custom non-coalescing command works
class NoopCommand implements Command {
  readonly label = 'noop';
  readonly createdAt = performance.now();
  do(): void {}
  undo(): void {}
}

describe('CommandHistory — non-coalescing command', () => {
  it('command without coalesceWith never merges', () => {
    const s = makeStore();
    const h = new CommandHistory({ coalesceWindowMs: 999999 });
    h.execute(s, new NoopCommand());
    h.execute(s, new NoopCommand());
    h.execute(s, new NoopCommand());
    expect(h.undoSize).toBe(3);
  });
});

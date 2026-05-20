import { describe, it, expect } from 'vitest';
import { DocumentStore } from '../../src/store/DocumentStore.js';
import { SetBoneCommand } from '../../src/store/commands/SetBoneCommand.js';
import { makeEmptySkeleton } from '../../src/core/types.js';

function makeStore() {
  const skel = makeEmptySkeleton('test');
  skel.bones.push({ name: 'arm', parent: 'root', length: 10, x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 });
  return new DocumentStore({ skeleton: skel, atlas: { pages: [] } });
}

describe('SetBoneCommand — do/undo', () => {
  it('do() applies patch, undo() restores', () => {
    const s = makeStore();
    const cmd = new SetBoneCommand('arm', { rotation: 45 });
    cmd.do(s);
    expect(s.skeleton.bones.find(b => b.name === 'arm')!.rotation).toBe(45);
    cmd.undo(s);
    expect(s.skeleton.bones.find(b => b.name === 'arm')!.rotation).toBe(0);
  });

  it('snapshots only patched fields, not whole bone', () => {
    const s = makeStore();
    const cmd = new SetBoneCommand('arm', { rotation: 45, x: 10 });
    cmd.do(s);
    // Mutate a non-patched field outside the command — undo must not touch it
    s.skeleton.bones.find(b => b.name === 'arm')!.scaleX = 2;
    cmd.undo(s);
    const arm = s.skeleton.bones.find(b => b.name === 'arm')!;
    expect(arm.rotation).toBe(0);
    expect(arm.x).toBe(0);
    expect(arm.scaleX).toBe(2);  // preserved
  });

  it('redo after undo restores patch (symmetric)', () => {
    const s = makeStore();
    const cmd = new SetBoneCommand('arm', { rotation: 45 });
    cmd.do(s);
    cmd.undo(s);
    cmd.do(s);
    expect(s.skeleton.bones.find(b => b.name === 'arm')!.rotation).toBe(45);
  });

  it('throws on unknown bone', () => {
    const s = makeStore();
    const cmd = new SetBoneCommand('ghost', { rotation: 1 });
    expect(() => cmd.do(s)).toThrow();
  });
});

describe('SetBoneCommand — coalesce', () => {
  it('coalesces same bone + same fields', () => {
    const a = new SetBoneCommand('arm', { rotation: 10 });
    const b = new SetBoneCommand('arm', { rotation: 30 });
    const merged = b.coalesceWith(a) as SetBoneCommand;
    expect(merged).not.toBeNull();
    expect(merged.boneName).toBe('arm');
    expect(merged.patch.rotation).toBe(30);
  });

  it('merged undo restores to ORIGINAL value (not intermediate)', () => {
    const s = makeStore();
    const a = new SetBoneCommand('arm', { rotation: 10 });
    a.do(s);
    const b = new SetBoneCommand('arm', { rotation: 30 });
    b.do(s);
    const merged = b.coalesceWith(a) as SetBoneCommand;
    merged.undo(s);
    expect(s.skeleton.bones.find(bo => bo.name === 'arm')!.rotation).toBe(0);
  });

  it('does NOT coalesce different bones', () => {
    const a = new SetBoneCommand('arm', { rotation: 10 });
    const b = new SetBoneCommand('root', { rotation: 30 });
    expect(b.coalesceWith(a)).toBeNull();
  });

  it('does NOT coalesce different field sets', () => {
    const a = new SetBoneCommand('arm', { rotation: 10 });
    const b = new SetBoneCommand('arm', { x: 5 });
    expect(b.coalesceWith(a)).toBeNull();
  });
});

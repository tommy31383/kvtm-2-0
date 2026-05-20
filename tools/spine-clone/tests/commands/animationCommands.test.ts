import { describe, it, expect } from 'vitest';
import { DocumentStore } from '../../src/store/DocumentStore.js';
import { makeEmptySkeleton } from '../../src/core/types.js';

function makeStore() {
  const skel = makeEmptySkeleton('t');
  return new DocumentStore({ skeleton: skel, atlas: { pages: [] } });
}

describe('CreateAnimationCommand', () => {
  it('creates empty animation + undo deletes', () => {
    const s = makeStore();
    s.createAnimation('walk');
    expect(s.skeleton.animations.walk).toBeDefined();
    expect(s.skeleton.animations.walk.duration).toBe(0);
    s.undo();
    expect(s.skeleton.animations.walk).toBeUndefined();
  });

  it('throws on duplicate name', () => {
    const s = makeStore();
    s.createAnimation('walk');
    expect(() => s.createAnimation('walk')).toThrow();
  });
});

describe('DeleteAnimationCommand', () => {
  it('removes + undo restores with full content', () => {
    const s = makeStore();
    s.createAnimation('walk');
    s.setCurrentAnimation('walk');
    s.insertKeyframe(
      { kind: 'bone', animation: 'walk', bone: 'root', channel: 'rotate' },
      { time: 0.5, value: 45 },
    );
    s.deleteAnimation('walk');
    expect(s.skeleton.animations.walk).toBeUndefined();
    expect(s.currentAnimation).toBeUndefined();  // cleared because was current
    s.undo();
    expect(s.skeleton.animations.walk).toBeDefined();
    expect(s.skeleton.animations.walk.bones.root!.rotate!.length).toBe(1);
    expect(s.currentAnimation).toBe('walk');  // restored
  });

  it('throws when not found', () => {
    const s = makeStore();
    expect(() => s.deleteAnimation('ghost')).toThrow();
  });
});

describe('RenameAnimationCommand', () => {
  it('renames + updates current animation reference + undo restores', () => {
    const s = makeStore();
    s.createAnimation('walk');
    s.setCurrentAnimation('walk');
    s.renameAnimation('walk', 'run');
    expect(s.skeleton.animations.run).toBeDefined();
    expect(s.skeleton.animations.walk).toBeUndefined();
    expect(s.currentAnimation).toBe('run');
    s.undo();
    expect(s.skeleton.animations.walk).toBeDefined();
    expect(s.currentAnimation).toBe('walk');
  });

  it('throws on collision with existing name', () => {
    const s = makeStore();
    s.createAnimation('walk');
    s.createAnimation('run');
    expect(() => s.renameAnimation('walk', 'run')).toThrow();
  });
});

describe('Integration — complex undo sequence', () => {
  it('5-step sequence undo/redo preserves state', () => {
    const s = makeStore();
    s.createAnimation('walk');
    s.setCurrentAnimation('walk');
    const ref = { kind: 'bone' as const, animation: 'walk', bone: 'root', channel: 'rotate' as const };
    s.insertKeyframe(ref, { time: 0, value: 0 });
    s.insertKeyframe(ref, { time: 1, value: 90 });
    s.setKeyframeValue(ref, 1, 180);
    s.moveKeyframe(ref, 1, 2);

    // State: walk anim with keys at [0, 2], values [0, 180]
    expect(s.skeleton.animations.walk.bones.root!.rotate).toEqual([
      { time: 0, value: 0 },
      { time: 2, value: 180 },
    ]);

    // Undo back to empty
    s.undo();  // move 2→1
    s.undo();  // value 180→90
    s.undo();  // delete key @1
    s.undo();  // delete key @0
    s.undo();  // delete anim
    expect(s.skeleton.animations.walk).toBeUndefined();

    // Redo all the way back
    s.redo(); s.redo(); s.redo(); s.redo(); s.redo();
    expect(s.skeleton.animations.walk.bones.root!.rotate).toEqual([
      { time: 0, value: 0 },
      { time: 2, value: 180 },
    ]);
  });
});

import { describe, it, expect } from 'vitest';
import {
  evaluateLocalTransform, evaluatePose, localToMatrix, multiplyMatrix,
  decomposeMatrix, identityMatrix,
} from '../src/core/pose.js';
import type { Skeleton, Animation, Bone } from '../src/core/types.js';

const rootBone: Bone = {
  name: 'root', length: 0, x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1,
};
const childBone: Bone = {
  name: 'arm', parent: 'root', length: 50, x: 10, y: 0,
  rotation: 0, scaleX: 1, scaleY: 1,
};

describe('localToMatrix + identityMatrix', () => {
  it('identity has no transform', () => {
    const m = identityMatrix();
    expect(m).toEqual({ a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 });
  });
  it('zero rotation + unit scale yields identity', () => {
    const m = localToMatrix({ x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 });
    expect(m.a).toBeCloseTo(1);
    expect(m.b).toBeCloseTo(0);
    expect(m.tx).toBe(0);
  });
  it('translation only', () => {
    const m = localToMatrix({ x: 100, y: 50, rotation: 0, scaleX: 1, scaleY: 1 });
    expect(m.tx).toBe(100);
    expect(m.ty).toBe(50);
  });
  it('90deg rotation', () => {
    const m = localToMatrix({ x: 0, y: 0, rotation: 90, scaleX: 1, scaleY: 1 });
    expect(m.a).toBeCloseTo(0);
    expect(m.b).toBeCloseTo(1);
    expect(m.c).toBeCloseTo(-1);
    expect(m.d).toBeCloseTo(0);
  });
});

describe('multiplyMatrix', () => {
  it('identity is neutral', () => {
    const a = localToMatrix({ x: 30, y: 40, rotation: 45, scaleX: 2, scaleY: 2 });
    const result = multiplyMatrix(identityMatrix(), a);
    expect(result.a).toBeCloseTo(a.a);
    expect(result.tx).toBeCloseTo(a.tx);
  });
  it('parent translation + child translation', () => {
    const parent = localToMatrix({ x: 100, y: 0, rotation: 0, scaleX: 1, scaleY: 1 });
    const child  = localToMatrix({ x: 50, y: 0, rotation: 0, scaleX: 1, scaleY: 1 });
    const world = multiplyMatrix(parent, child);
    expect(world.tx).toBe(150);
    expect(world.ty).toBe(0);
  });
  it('parent rotation transforms child translation', () => {
    // Parent rotated 90deg, child translated (10, 0) → world (0, 10)
    const parent = localToMatrix({ x: 0, y: 0, rotation: 90, scaleX: 1, scaleY: 1 });
    const child  = localToMatrix({ x: 10, y: 0, rotation: 0, scaleX: 1, scaleY: 1 });
    const world = multiplyMatrix(parent, child);
    expect(world.tx).toBeCloseTo(0);
    expect(world.ty).toBeCloseTo(10);
  });
});

describe('decomposeMatrix', () => {
  it('round-trip: compose then decompose', () => {
    const orig = { x: 30, y: -10, rotation: 60, scaleX: 1.5, scaleY: 1.5 };
    const m = localToMatrix(orig);
    const back = decomposeMatrix(m);
    expect(back.x).toBeCloseTo(orig.x);
    expect(back.y).toBeCloseTo(orig.y);
    expect(back.rotation).toBeCloseTo(orig.rotation);
    expect(back.scaleX).toBeCloseTo(orig.scaleX);
    expect(back.scaleY).toBeCloseTo(orig.scaleY);
  });
});

describe('evaluateLocalTransform (Spine→Pixi: Y-flip, rot-negate)', () => {
  it('returns setup pose when no animation (X preserved, Y negated)', () => {
    const lt = evaluateLocalTransform(childBone, undefined, 0);
    expect(lt.x).toBe(10);
    expect(lt.y).toBeCloseTo(0);
    expect(lt.rotation).toBeCloseTo(0);
  });
  it('applies translate timeline as offset (Y output is negated)', () => {
    const anim: Animation = {
      name: 'walk', duration: 1,
      bones: {
        arm: { translate: [{ time: 0, value: { x: 5, y: 10 } }, { time: 1, value: { x: 5, y: 10 } }] }
      },
      slots: {},
    };
    const lt = evaluateLocalTransform(childBone, anim, 0.5);
    expect(lt.x).toBe(15);  // 10 + 5 (X passthrough)
    expect(lt.y).toBe(-10); // 0 + 10 = 10, negated for Y-down
  });
  it('rotate negated (Spine CCW → Pixi CW)', () => {
    const anim: Animation = {
      name: 'spin', duration: 1,
      bones: {
        arm: { rotate: [{ time: 0, value: 0 }, { time: 1, value: 90 }] }
      },
      slots: {},
    };
    const lt = evaluateLocalTransform(childBone, anim, 0.5);
    // halfway = 45° in Spine CCW, output negated = -45° in Pixi CW
    expect(lt.rotation).toBeCloseTo(-45);
  });
});

describe('evaluatePose', () => {
  const skeleton: Skeleton = {
    name: 't', version: '0.1.0',
    bones: [rootBone, childBone],
    slots: [{ name: 'hand', bone: 'arm', attachment: 'fist' }],
    skins: [{ name: 'default', attachments: { hand: { fist: { type: 'region', name: 'fist', x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, width: 32, height: 32 } } } }],
    animations: {},
  };

  it('produces world transforms for all bones', () => {
    const pose = evaluatePose(skeleton, undefined, 0);
    expect(pose.bones.root).toBeDefined();
    expect(pose.bones.arm).toBeDefined();
    expect(pose.bones.arm.tx).toBe(10);
  });
  it('child inherits parent transform', () => {
    const moved: Skeleton = {
      ...skeleton,
      bones: [
        { ...rootBone, x: 100 },
        childBone,
      ],
    };
    const pose = evaluatePose(moved, undefined, 0);
    // root world tx = 100, child world tx = 100 + 10 = 110
    expect(pose.bones.root.tx).toBe(100);
    expect(pose.bones.arm.tx).toBe(110);
  });
  it('applies slot attachment timeline', () => {
    const withAnim: Skeleton = {
      ...skeleton,
      animations: {
        wave: {
          name: 'wave', duration: 1,
          bones: {},
          slots: {
            hand: { attachment: [
              { time: 0, value: 'fist', curve: 'stepped' },
              { time: 0.5, value: 'open', curve: 'stepped' },
            ] }
          },
        }
      },
    };
    const before = evaluatePose(withAnim, 'wave', 0.25);
    const after  = evaluatePose(withAnim, 'wave', 0.75);
    expect(before.slotAttachments.hand).toBe('fist');
    expect(after.slotAttachments.hand).toBe('open');
  });
});

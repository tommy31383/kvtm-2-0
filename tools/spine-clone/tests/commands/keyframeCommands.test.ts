import { describe, it, expect } from 'vitest';
import { DocumentStore } from '../../src/store/DocumentStore.js';
import { makeEmptySkeleton } from '../../src/core/types.js';
import { InsertKeyframeCommand } from '../../src/store/commands/InsertKeyframeCommand.js';
import { DeleteKeyframeCommand } from '../../src/store/commands/DeleteKeyframeCommand.js';
import { MoveKeyframeCommand } from '../../src/store/commands/MoveKeyframeCommand.js';
import { SetKeyframeValueCommand } from '../../src/store/commands/SetKeyframeValueCommand.js';
import { SetKeyframeCurveCommand } from '../../src/store/commands/SetKeyframeCurveCommand.js';
import { PasteKeyframesCommand } from '../../src/store/commands/PasteKeyframesCommand.js';
import type { TimelineRef } from '../../src/store/commands/timelineRef.js';

function makeStore() {
  const skel = makeEmptySkeleton('t');
  skel.bones.push({ name: 'arm', parent: 'root', length: 10, x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 });
  skel.animations.idle = { name: 'idle', duration: 0, bones: {}, slots: {} };
  return new DocumentStore({ skeleton: skel, atlas: { pages: [] } });
}

const REF: TimelineRef = { kind: 'bone', animation: 'idle', bone: 'arm', channel: 'rotate' };

describe('InsertKeyframeCommand', () => {
  it('inserts + undo removes', () => {
    const s = makeStore();
    const cmd = new InsertKeyframeCommand(REF, { time: 1.0, value: 45 });
    cmd.do(s);
    expect(s.skeleton.animations.idle.bones.arm!.rotate!.length).toBe(1);
    expect(s.skeleton.animations.idle.duration).toBe(1.0);
    cmd.undo(s);
    expect(s.skeleton.animations.idle.bones.arm!.rotate!.length).toBe(0);
  });

  it('keeps array sorted by time', () => {
    const s = makeStore();
    s.insertKeyframe(REF, { time: 2.0, value: 90 });
    s.insertKeyframe(REF, { time: 0.5, value: 10 });
    s.insertKeyframe(REF, { time: 1.5, value: 50 });
    const times = s.skeleton.animations.idle.bones.arm!.rotate!.map(k => k.time);
    expect(times).toEqual([0.5, 1.5, 2.0]);
  });

  it('throws on duplicate time', () => {
    const s = makeStore();
    s.insertKeyframe(REF, { time: 1.0, value: 1 });
    expect(() => s.insertKeyframe(REF, { time: 1.0, value: 2 })).toThrow();
  });
});

describe('DeleteKeyframeCommand', () => {
  it('removes + undo restores exact key including curve', () => {
    const s = makeStore();
    s.insertKeyframe(REF, { time: 0.5, value: 30, curve: 'stepped' });
    s.deleteKeyframe(REF, 0.5);
    expect(s.skeleton.animations.idle.bones.arm!.rotate!.length).toBe(0);
    s.undo();
    const k = s.skeleton.animations.idle.bones.arm!.rotate![0];
    expect(k.time).toBe(0.5);
    expect(k.value).toBe(30);
    expect(k.curve).toBe('stepped');
  });

  it('throws when no key at given time', () => {
    const s = makeStore();
    expect(() => s.deleteKeyframe(REF, 99)).toThrow();
  });
});

describe('MoveKeyframeCommand', () => {
  it('moves time + preserves sort + undo restores', () => {
    const s = makeStore();
    s.insertKeyframe(REF, { time: 0.5, value: 10 });
    s.insertKeyframe(REF, { time: 1.0, value: 20 });
    s.insertKeyframe(REF, { time: 1.5, value: 30 });
    s.moveKeyframe(REF, 0.5, 2.0);  // move first to last
    let times = s.skeleton.animations.idle.bones.arm!.rotate!.map(k => k.time);
    expect(times).toEqual([1.0, 1.5, 2.0]);
    s.undo();
    times = s.skeleton.animations.idle.bones.arm!.rotate!.map(k => k.time);
    expect(times).toEqual([0.5, 1.0, 1.5]);
  });

  it('coalesces drag gesture into single undo unit', () => {
    const s = makeStore();
    s.insertKeyframe(REF, { time: 0.5, value: 10 });
    // simulate drag — 5 micro moves
    s.moveKeyframe(REF, 0.5, 0.6);
    s.moveKeyframe(REF, 0.6, 0.7);
    s.moveKeyframe(REF, 0.7, 0.8);
    s.moveKeyframe(REF, 0.8, 0.9);
    s.moveKeyframe(REF, 0.9, 1.0);
    expect(s.skeleton.animations.idle.bones.arm!.rotate![0].time).toBe(1.0);
    s.undo();  // single undo
    expect(s.skeleton.animations.idle.bones.arm!.rotate![0].time).toBe(0.5);
  });

  it('throws when target time already occupied', () => {
    const s = makeStore();
    s.insertKeyframe(REF, { time: 0.5, value: 10 });
    s.insertKeyframe(REF, { time: 1.0, value: 20 });
    expect(() => s.moveKeyframe(REF, 0.5, 1.0)).toThrow();
  });
});

describe('SetKeyframeValueCommand', () => {
  it('updates value + undo restores', () => {
    const s = makeStore();
    s.insertKeyframe(REF, { time: 0.5, value: 10 });
    s.setKeyframeValue(REF, 0.5, 99);
    expect(s.skeleton.animations.idle.bones.arm!.rotate![0].value).toBe(99);
    s.undo();
    expect(s.skeleton.animations.idle.bones.arm!.rotate![0].value).toBe(10);
  });

  it('coalesces consecutive edits → single undo restores original', () => {
    const s = makeStore();
    s.insertKeyframe(REF, { time: 0.5, value: 10 });
    for (let v = 11; v <= 50; v++) s.setKeyframeValue(REF, 0.5, v);
    expect(s.skeleton.animations.idle.bones.arm!.rotate![0].value).toBe(50);
    s.undo();
    expect(s.skeleton.animations.idle.bones.arm!.rotate![0].value).toBe(10);
  });

  it('clones XY values (does not share reference)', () => {
    const s = makeStore();
    const ref2: TimelineRef = { kind: 'bone', animation: 'idle', bone: 'arm', channel: 'translate' };
    s.insertKeyframe(ref2, { time: 0, value: { x: 1, y: 2 } });
    const xy = { x: 5, y: 8 };
    s.setKeyframeValue(ref2, 0, xy);
    xy.x = 999;  // mutate outside
    const stored = s.skeleton.animations.idle.bones.arm!.translate![0].value as { x: number; y: number };
    expect(stored.x).toBe(5);  // not 999
  });
});

describe('SetKeyframeCurveCommand', () => {
  it('updates curve + undo restores', () => {
    const s = makeStore();
    s.insertKeyframe(REF, { time: 0.5, value: 10 });  // default linear
    s.setKeyframeCurve(REF, 0.5, [0.25, 0.1, 0.25, 1]);
    expect(s.skeleton.animations.idle.bones.arm!.rotate![0].curve).toEqual([0.25, 0.1, 0.25, 1]);
    s.undo();
    expect(s.skeleton.animations.idle.bones.arm!.rotate![0].curve).toBeUndefined();
  });

  it('can set then unset curve', () => {
    const s = makeStore();
    s.insertKeyframe(REF, { time: 0.5, value: 10, curve: 'stepped' });
    s.setKeyframeCurve(REF, 0.5, undefined);
    expect(s.skeleton.animations.idle.bones.arm!.rotate![0].curve).toBeUndefined();
  });
});

describe('PasteKeyframesCommand', () => {
  it('pastes batch at base time', () => {
    const s = makeStore();
    const entries = [
      { ref: REF, key: { time: 0, value: 0 } },
      { ref: REF, key: { time: 0.5, value: 45 } },
      { ref: REF, key: { time: 1.0, value: 90 } },
    ];
    s.pasteKeyframes(entries, 2.0);
    const times = s.skeleton.animations.idle.bones.arm!.rotate!.map(k => k.time);
    expect(times).toEqual([2.0, 2.5, 3.0]);
  });

  it('replaces existing key at collision + undo restores original', () => {
    const s = makeStore();
    s.insertKeyframe(REF, { time: 1.0, value: 999 });
    s.pasteKeyframes([{ ref: REF, key: { time: 0, value: 42 } }], 1.0);
    expect(s.skeleton.animations.idle.bones.arm!.rotate![0].value).toBe(42);
    s.undo();
    expect(s.skeleton.animations.idle.bones.arm!.rotate![0].value).toBe(999);
  });
});

import { describe, it, expect } from 'vitest';
import { parseSpineJson } from '../src/io/spineImport.js';
import { exportToSpineJson } from '../src/io/spineExport.js';

const sampleJson = JSON.stringify({
  skeleton: { hash: 'abc', spine: '4.2.00', images: './images/' },
  bones: [
    { name: 'root' },
    { name: 'arm', parent: 'root', length: 50, x: 10, y: 0, rotation: 5, scaleX: 0.9 },
  ],
  slots: [
    { name: 'hand', bone: 'arm', attachment: 'fist', color: 'ffffffff' },
  ],
  skins: [{
    name: 'default',
    attachments: {
      hand: {
        fist: {
          x: 0, y: 0, width: 32, height: 32,
        },
        open: {
          type: 'region',
          path: 'open_hand',
          x: 2, y: -3, rotation: 10, scaleX: 1.1, scaleY: 0.9, width: 30, height: 30,
        },
      },
    },
  }],
  animations: {
    wave: {
      bones: {
        arm: {
          rotate: [
            { angle: 0 },
            { time: 0.5, angle: 30, curve: [0.42, 0, 0.58, 1] },
            { time: 1, angle: 0 },
          ],
          translate: [
            { x: 0, y: 0 },
            { time: 0.5, x: 5, y: 2 },
          ],
        },
      },
      slots: {
        hand: {
          attachment: [
            { name: 'fist' },
            { time: 0.5, name: 'open' },
          ],
        },
      },
    },
  },
});

describe('parseSpineJson', () => {
  const sk = parseSpineJson(sampleJson);

  it('infers skeleton name from images path', () => {
    expect(sk.name).toBe('images');
  });

  it('preserves spine version + hash', () => {
    expect(sk.version).toBe('4.2.00');
    expect(sk.hash).toBe('abc');
  });

  it('parses bones with defaults applied', () => {
    expect(sk.bones).toHaveLength(2);
    const root = sk.bones[0];
    expect(root.name).toBe('root');
    expect(root.x).toBe(0);
    expect(root.scaleX).toBe(1);  // default
    const arm = sk.bones[1];
    expect(arm.parent).toBe('root');
    expect(arm.x).toBe(10);
    expect(arm.rotation).toBe(5);
    expect(arm.scaleX).toBe(0.9);
  });

  it('parses slots + attachment ref', () => {
    expect(sk.slots).toHaveLength(1);
    expect(sk.slots[0].name).toBe('hand');
    expect(sk.slots[0].bone).toBe('arm');
    expect(sk.slots[0].attachment).toBe('fist');
  });

  it('parses default skin + attachments', () => {
    expect(sk.skins).toHaveLength(1);
    expect(sk.skins[0].name).toBe('default');
    const atts = sk.skins[0].attachments.hand;
    expect(Object.keys(atts).sort()).toEqual(['fist', 'open']);
    const fist = atts.fist as any;
    expect(fist.type).toBe('region');
    expect(fist.width).toBe(32);
    const open = atts.open as any;
    expect(open.path).toBe('open_hand');
    expect(open.rotation).toBe(10);
  });

  it('parses animation with bone rotate timeline', () => {
    const anim = sk.animations.wave;
    expect(anim).toBeDefined();
    const rot = anim.bones.arm.rotate!;
    expect(rot).toHaveLength(3);
    expect(rot[0]).toMatchObject({ time: 0, value: 0 });
    expect(rot[1]).toMatchObject({ time: 0.5, value: 30 });
    expect(rot[1].curve).toEqual([0.42, 0, 0.58, 1]);
  });

  it('parses bone translate timeline as {x,y}', () => {
    const tr = sk.animations.wave.bones.arm.translate!;
    expect(tr).toHaveLength(2);
    expect(tr[1].value).toEqual({ x: 5, y: 2 });
  });

  it('parses slot attachment timeline as stepped name', () => {
    const att = sk.animations.wave.slots.hand.attachment!;
    expect(att).toHaveLength(2);
    expect(att[0]).toMatchObject({ time: 0, value: 'fist', curve: 'stepped' });
    expect(att[1]).toMatchObject({ time: 0.5, value: 'open' });
  });

  it('computes animation duration from max key time', () => {
    expect(sk.animations.wave.duration).toBe(1);
  });

  it('throws on invalid JSON (missing bones)', () => {
    expect(() => parseSpineJson('{"foo":1}')).toThrow();
  });
});

describe('Spine JSON round-trip (export → import)', () => {
  const sk = parseSpineJson(sampleJson);
  const re = parseSpineJson(exportToSpineJson(sk));

  it('preserves bone count + names', () => {
    expect(re.bones.map(b => b.name)).toEqual(sk.bones.map(b => b.name));
  });

  it('preserves slot bone reference', () => {
    expect(re.slots[0].bone).toBe(sk.slots[0].bone);
  });

  it('preserves animation duration', () => {
    expect(re.animations.wave.duration).toBeCloseTo(sk.animations.wave.duration);
  });

  it('preserves bezier curve values', () => {
    const orig = sk.animations.wave.bones.arm.rotate![1].curve;
    const back = re.animations.wave.bones.arm.rotate![1].curve;
    expect(back).toEqual(orig);
  });
});

import { describe, it, expect } from 'vitest';
import { importKvtmBloom } from '../src/io/kvtmImport.js';
import type { KvtmBloomData } from '../src/io/kvtmImport.js';

const sample: KvtmBloomData = {
  modules: {
    m0: { x: 0, y: 0, w: 50, h: 50, dx: 1, dy: -2 },
    m1: { x: 50, y: 0, w: 60, h: 50 },
    m2: { x: 110, y: 0, w: 70, h: 50, dx: 3 },
  },
  anims: {
    bloom: [
      { m: 'm0', d: 100 }, { m: 'm1', d: 100 }, { m: 'm2', d: 100 },
    ],
    bud: [{ m: 'm0', d: 90 }],
    flower: [{ m: 'm2', d: 90 }],
  },
};

describe('importKvtmBloom', () => {
  const { skeleton, atlas } = importKvtmBloom(sample, 'sheet.png', 256, 128);

  it('creates one atlas page with regions for each module', () => {
    expect(atlas.pages).toHaveLength(1);
    expect(atlas.pages[0].name).toBe('sheet.png');
    expect(atlas.pages[0].width).toBe(256);
    expect(atlas.pages[0].regions).toHaveLength(3);
  });
  it('atlas regions preserve module rect coords', () => {
    const r = atlas.pages[0].regions.find(r => r.name === 'm0')!;
    expect(r.x).toBe(0);
    expect(r.y).toBe(0);
    expect(r.width).toBe(50);
    expect(r.height).toBe(50);
  });

  it('skeleton has root + flower slot', () => {
    expect(skeleton.bones).toHaveLength(1);
    expect(skeleton.bones[0].name).toBe('root');
    expect(skeleton.slots).toHaveLength(1);
    expect(skeleton.slots[0].name).toBe('flower');
    expect(skeleton.slots[0].bone).toBe('root');
  });

  it('creates one RegionAttachment per module with dx/dy as offset', () => {
    const atts = skeleton.skins[0].attachments.flower;
    expect(Object.keys(atts)).toHaveLength(3);
    const m0 = atts.m0 as any;
    expect(m0.type).toBe('region');
    expect(m0.x).toBe(1);
    expect(m0.y).toBe(-2);
    expect(m0.width).toBe(50);
  });
  it('module without dx/dy gets x=0, y=0', () => {
    const m1 = skeleton.skins[0].attachments.flower.m1 as any;
    expect(m1.x).toBe(0);
    expect(m1.y).toBe(0);
  });

  it('creates one animation per kvtm anim name', () => {
    expect(Object.keys(skeleton.animations).sort()).toEqual(['bloom', 'bud', 'flower']);
  });
  it('bloom animation has 3 stepped attachment keys totaling 0.3s', () => {
    const anim = skeleton.animations.bloom;
    expect(anim.duration).toBeCloseTo(0.3);
    const keys = anim.slots.flower.attachment!;
    expect(keys).toHaveLength(3);
    expect(keys[0]).toMatchObject({ time: 0,   value: 'm0', curve: 'stepped' });
    expect(keys[1]).toMatchObject({ time: 0.1, value: 'm1' });
    expect(keys[2]).toMatchObject({ time: 0.2, value: 'm2' });
  });
  it('all attachment keys are stepped (Spine convention)', () => {
    const keys = skeleton.animations.bloom.slots.flower.attachment!;
    keys.forEach(k => expect(k.curve).toBe('stepped'));
  });
});

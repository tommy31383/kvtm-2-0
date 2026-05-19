import { describe, it, expect } from 'vitest';
import { exportToSpineJson } from '../src/io/spineExport.js';
import { serializeProject, parseProject } from '../src/io/customFormat.js';
import type { Skeleton, Atlas, RegionAttachment } from '../src/core/types.js';

// Build a small generic skeleton for testing the exporters.
function makeSampleSkeleton(): { skeleton: Skeleton; atlas: Atlas } {
  const skeleton: Skeleton = {
    name: 'sample',
    version: '0.1.0',
    bones: [{ name: 'root', length: 0, x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 }],
    slots: [{ name: 'flower', bone: 'root' }],
    skins: [{
      name: 'default',
      attachments: {
        flower: {
          m0: { type: 'region', name: 'm0', path: 'm0', x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, width: 50, height: 50 } as RegionAttachment,
          m1: { type: 'region', name: 'm1', path: 'm1', x: 2, y: -3, rotation: 0, scaleX: 1, scaleY: 1, width: 60, height: 50 } as RegionAttachment,
        },
      },
    }],
    animations: {
      bloom: {
        name: 'bloom',
        duration: 0.2,
        bones: {},
        slots: {
          flower: {
            attachment: [
              { time: 0,   value: 'm0', curve: 'stepped' },
              { time: 0.1, value: 'm1', curve: 'stepped' },
            ],
          },
        },
      },
    },
  };
  const atlas: Atlas = {
    pages: [{
      name: 'sheet.png',
      width: 256,
      height: 128,
      format: 'RGBA8888',
      filter: ['Linear', 'Linear'],
      regions: [
        { name: 'm0', x: 0,  y: 0, width: 50, height: 50 },
        { name: 'm1', x: 50, y: 0, width: 60, height: 50 },
      ],
    }],
  };
  return { skeleton, atlas };
}

describe('exportToSpineJson', () => {
  const { skeleton } = makeSampleSkeleton();
  const json = exportToSpineJson(skeleton);
  const parsed = JSON.parse(json);

  it('emits skeleton header with spine version', () => {
    expect(parsed.skeleton.spine).toBe('4.2');
  });

  it('emits bones array with root', () => {
    expect(parsed.bones).toHaveLength(1);
    expect(parsed.bones[0].name).toBe('root');
  });

  it('omits default fields (zero x/y, unit scale) per spine convention', () => {
    const bone = parsed.bones[0];
    expect(bone.x).toBeUndefined();
    expect(bone.scaleX).toBeUndefined();
  });

  it('emits slots with bone reference', () => {
    expect(parsed.slots).toHaveLength(1);
    expect(parsed.slots[0]).toMatchObject({ name: 'flower', bone: 'root' });
  });

  it('emits default skin with attachments per slot', () => {
    expect(parsed.skins).toHaveLength(1);
    expect(parsed.skins[0].name).toBe('default');
    expect(parsed.skins[0].attachments.flower).toBeDefined();
    expect(Object.keys(parsed.skins[0].attachments.flower)).toHaveLength(2);
  });

  it('attachment with dx/dy emits x/y offset', () => {
    const m1 = parsed.skins[0].attachments.flower.m1;
    expect(m1.x).toBe(2);
    expect(m1.y).toBe(-3);
  });

  it('attachment without offset omits x/y (default 0)', () => {
    const m0 = parsed.skins[0].attachments.flower.m0;
    expect(m0.x).toBeUndefined();
    expect(m0.y).toBeUndefined();
  });

  it('animation slot attachment timeline emits stepped curve + name', () => {
    const anim = parsed.animations.bloom;
    expect(anim.slots.flower.attachment).toHaveLength(2);
    expect(anim.slots.flower.attachment[0]).toMatchObject({ name: 'm0', curve: 'stepped' });
    expect(anim.slots.flower.attachment[1]).toMatchObject({ time: 0.1, name: 'm1', curve: 'stepped' });
  });

  it('roundtrip: spine json is valid JSON and re-parseable', () => {
    expect(() => JSON.parse(json)).not.toThrow();
  });
});

describe('exportToSpineJson — bone keyframes', () => {
  const skeleton: Skeleton = {
    name: 't', version: '0.1.0',
    bones: [
      { name: 'root', length: 0, x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
      { name: 'arm', parent: 'root', length: 50, x: 10, y: 0, rotation: 5, scaleX: 1, scaleY: 1 },
    ],
    slots: [],
    skins: [{ name: 'default', attachments: {} }],
    animations: {
      wave: {
        name: 'wave', duration: 1,
        bones: {
          arm: {
            rotate: [
              { time: 0, value: 0 },
              { time: 0.5, value: 30, curve: [0.42, 0, 0.58, 1] },
              { time: 1, value: 0 },
            ],
            translate: [
              { time: 0, value: { x: 0, y: 0 } },
              { time: 0.5, value: { x: 5, y: 3 } },
            ],
          },
        },
        slots: {},
      },
    },
  };

  const parsed = JSON.parse(exportToSpineJson(skeleton));

  it('rotate timeline uses `angle` not `value`', () => {
    const rot = parsed.animations.wave.bones.arm.rotate;
    expect(rot[1].angle).toBe(30);
    expect(rot[1].value).toBeUndefined();
  });

  it('translate timeline expands {x,y} to x/y fields', () => {
    const tr = parsed.animations.wave.bones.arm.translate;
    expect(tr[1].x).toBe(5);
    expect(tr[1].y).toBe(3);
  });

  it('bezier curve preserved as array', () => {
    const rot = parsed.animations.wave.bones.arm.rotate;
    expect(rot[1].curve).toEqual([0.42, 0, 0.58, 1]);
  });

  it('linear curve (default) is omitted', () => {
    const tr = parsed.animations.wave.bones.arm.translate;
    expect(tr[0].curve).toBeUndefined();
  });

  it('bone with rotation preserves it', () => {
    const arm = parsed.bones.find((b: any) => b.name === 'arm');
    expect(arm.rotation).toBe(5);
    expect(arm.x).toBe(10);
  });
});

describe('customFormat', () => {
  const { skeleton, atlas } = makeSampleSkeleton();

  it('serialize then parse round-trips', () => {
    const json = serializeProject(skeleton, atlas);
    const back = parseProject(json);
    expect(back.skeleton.name).toBe(skeleton.name);
    expect(back.atlas.pages[0].regions).toHaveLength(2);
  });

  it('emits schema marker', () => {
    const json = serializeProject(skeleton, atlas);
    const obj = JSON.parse(json);
    expect(obj.schema).toBe('spine-clone-project');
    expect(obj.schemaVersion).toBeDefined();
  });

  it('rejects non-project JSON', () => {
    expect(() => parseProject('{"foo":1}')).toThrow();
  });

  it('rejects malformed JSON', () => {
    expect(() => parseProject('not json{')).toThrow();
  });
});

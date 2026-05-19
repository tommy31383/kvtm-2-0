import { describe, it, expect } from 'vitest';
import { parseAtlas } from '../src/io/atlasParser.js';

const sample = `../plant_02_apple.png
size: 512,128
format: RGBA8888
filter: Linear,Linear
repeat: none
cuc_new_021
  rotate: false
  xy: 112, 13
  size: 17, 12
  orig: 17, 12
  offset: 0, 0
  index: -1
tao_001
  rotate: false
  xy: 417, 91
  size: 64, 35
  orig: 64, 35
  offset: 0, 0
  index: -1
tao_003
  rotate: true
  xy: 417, 47
  size: 42, 53
  orig: 42, 53
  offset: 0, 0
  index: -1
`;

describe('parseAtlas', () => {
  const atlas = parseAtlas(sample);

  it('extracts page header with image filename', () => {
    expect(atlas.pages).toHaveLength(1);
    expect(atlas.pages[0].name).toBe('../plant_02_apple.png');
  });

  it('parses page size + format + filter', () => {
    expect(atlas.pages[0].width).toBe(512);
    expect(atlas.pages[0].height).toBe(128);
    expect(atlas.pages[0].format).toBe('RGBA8888');
    expect(atlas.pages[0].filter).toEqual(['Linear', 'Linear']);
  });

  it('parses 3 regions with name + xy + size', () => {
    expect(atlas.pages[0].regions).toHaveLength(3);
    const cuc = atlas.pages[0].regions.find(r => r.name === 'cuc_new_021')!;
    expect(cuc.x).toBe(112);
    expect(cuc.y).toBe(13);
    expect(cuc.width).toBe(17);
    expect(cuc.height).toBe(12);
  });

  it('parses rotate flag', () => {
    const t1 = atlas.pages[0].regions.find(r => r.name === 'tao_001')!;
    const t3 = atlas.pages[0].regions.find(r => r.name === 'tao_003')!;
    expect(t1.rotate).toBe(false);
    expect(t3.rotate).toBe(true);
  });

  it('parses orig + offset (trimmed sprite metadata)', () => {
    const tao = atlas.pages[0].regions.find(r => r.name === 'tao_001')!;
    expect(tao.originalWidth).toBe(64);
    expect(tao.originalHeight).toBe(35);
    expect(tao.offsetX).toBe(0);
    expect(tao.offsetY).toBe(0);
  });

  it('handles empty input', () => {
    const empty = parseAtlas('');
    expect(empty.pages).toEqual([]);
  });

  it('handles trailing whitespace + blank lines', () => {
    const padded = sample + '\n\n\n  \n';
    const a = parseAtlas(padded);
    expect(a.pages[0].regions).toHaveLength(3);
  });
});

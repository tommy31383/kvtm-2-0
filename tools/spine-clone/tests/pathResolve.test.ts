// Test path resolution logic — inline copy of resolveRelativePath so we can
// unit-test it without pulling in the whole Editor module (which imports Pixi
// + DOM stuff that doesn't run in vitest's node env).
//
// IF YOU EDIT Editor.ts resolveRelativePath(), KEEP THIS COPY IN SYNC.

import { describe, it, expect } from 'vitest';

function resolveRelativePath(basePath: string, relPath: string): string {
  const baseNorm = basePath.replace(/\\/g, '/');
  const relNorm  = relPath.replace(/\\/g, '/');
  if (/^[a-z]:\//i.test(relNorm) || relNorm.startsWith('/')) {
    return relNorm.replace(/\//g, basePath.includes('\\') ? '\\' : '/');
  }
  const baseDir = baseNorm.substring(0, baseNorm.lastIndexOf('/'));
  const parts = (baseDir + '/' + relNorm).split('/');
  const result: string[] = [];
  for (const p of parts) {
    if (p === '..') result.pop();
    else if (p !== '.' && p !== '') result.push(p);
  }
  const joined = result.join('/');
  const out = /^[a-z]:/i.test(joined) ? joined : '/' + joined;
  return basePath.includes('\\') ? out.replace(/\//g, '\\') : out;
}

describe('resolveRelativePath', () => {
  it('resolves "../sheet.png" against atlas file in subfolder (Windows)', () => {
    const result = resolveRelativePath(
      'E:\\Game AI\\playable_ads_kvtm\\assets-playable-ads\\pots-spine\\pots_set_00\\pots_set_00.atlas',
      '../pots_set_00.png'
    );
    expect(result).toBe('E:\\Game AI\\playable_ads_kvtm\\assets-playable-ads\\pots-spine\\pots_set_00.png');
  });

  it('resolves "./sheet.png" (same folder)', () => {
    const result = resolveRelativePath('E:\\a\\b\\file.atlas', './sheet.png');
    expect(result).toBe('E:\\a\\b\\sheet.png');
  });

  it('resolves bare filename to same folder', () => {
    const result = resolveRelativePath('E:\\a\\b\\file.atlas', 'sheet.png');
    expect(result).toBe('E:\\a\\b\\sheet.png');
  });

  it('resolves "../../up.png" two levels', () => {
    const result = resolveRelativePath('E:\\a\\b\\c\\file.atlas', '../../up.png');
    expect(result).toBe('E:\\a\\up.png');
  });

  it('preserves forward slashes when base uses them (Linux/Mac)', () => {
    const result = resolveRelativePath('/home/user/proj/file.atlas', '../sheet.png');
    expect(result).toBe('/home/user/sheet.png');
  });

  it('absolute path passes through (Windows drive letter)', () => {
    const result = resolveRelativePath('E:\\a\\file.atlas', 'C:/other/sheet.png');
    expect(result).toBe('C:\\other\\sheet.png');
  });

  it('absolute path passes through (POSIX)', () => {
    const result = resolveRelativePath('/home/proj/file.atlas', '/abs/sheet.png');
    expect(result).toBe('/abs/sheet.png');
  });
});

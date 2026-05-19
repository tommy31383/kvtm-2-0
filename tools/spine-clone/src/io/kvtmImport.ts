// Import KVTM `_BLOOM_DATA` (modules + anims) → spine-clone Skeleton.
//
// KVTM source format:
//   { modules: { id: {x,y,w,h,[dx,dy]} }, anims: { name: [{m, d}, ...] } }
//
// Conversion strategy:
//   - Each KVTM module becomes a RegionAttachment in spine-clone
//   - One slot "flower" attached to root bone
//   - One animation per KVTM anim name (bloom/bud/flower)
//     → slot attachment-swap timeline cycling through modules
//   - Frame duration `d` (ms) → time in seconds for spine timeline
//
// This validates that the spine-clone format is expressive enough to carry
// over the existing KVTM flipbook animations. Later we can convert these
// stepped attachment swaps into real bone-keyframe transforms.

import type {
  Skeleton, RegionAttachment, Animation, TimelineKey, Atlas, AtlasRegion,
} from '../core/types.js';

export interface KvtmBloomData {
  modules: { [id: string]: { x: number; y: number; w: number; h: number; dx?: number; dy?: number } };
  anims:   { [name: string]: { m: string; d: number }[] };
}

export interface ImportResult {
  skeleton: Skeleton;
  atlas: Atlas;
}

/**
 * Convert a KVTM bloom data block + its sheet info into our internal model.
 * `sheetName` = the texture file name (e.g. "flower_red_bloom.webp").
 * `sheetW`/`sheetH` = pixel size of the atlas page (optional but recommended).
 */
export function importKvtmBloom(
  data: KvtmBloomData,
  sheetName: string,
  sheetW = 0,
  sheetH = 0,
  skeletonName = 'kvtm-flower',
): ImportResult {
  // ── Atlas: 1 region per module rect ────────────────────────
  const regions: AtlasRegion[] = Object.entries(data.modules).map(([id, m]) => ({
    name: id,
    x: m.x,
    y: m.y,
    width: m.w,
    height: m.h,
    // KVTM dx/dy are render offsets, NOT atlas trimming — they go on the
    // RegionAttachment, not the atlas page.
  }));
  const atlas: Atlas = {
    pages: [{
      name: sheetName,
      width: sheetW,
      height: sheetH,
      format: 'RGBA8888',
      filter: ['Linear', 'Linear'],
      regions,
    }],
  };

  // ── Skeleton: 1 root bone + 1 slot "flower" + 1 attachment per module ──
  const skeleton: Skeleton = {
    name: skeletonName,
    version: '0.1.0',
    bones: [{ name: 'root', length: 0, x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 }],
    slots: [{ name: 'flower', bone: 'root' }],
    skins: [{ name: 'default', attachments: { flower: {} } }],
    animations: {},
  };

  // One RegionAttachment per module. x/y = render offset (dx/dy). w/h preserved.
  Object.entries(data.modules).forEach(([id, m]) => {
    const att: RegionAttachment = {
      type: 'region',
      name: id,
      path: id,                       // reference the atlas region with same name
      x: m.dx || 0,
      y: m.dy || 0,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      width: m.w,
      height: m.h,
    };
    skeleton.skins[0].attachments.flower[id] = att;
  });

  // ── Animations: each KVTM anim → 1 spine animation with slot attachment timeline ──
  Object.entries(data.anims).forEach(([animName, frames]) => {
    const attachmentKeys: TimelineKey<string | null>[] = [];
    let timeSec = 0;
    for (const fr of frames) {
      attachmentKeys.push({
        time: timeSec,
        value: fr.m,                 // attachment NAME (matches module id)
        curve: 'stepped',            // attachment swaps are always stepped
      });
      timeSec += (fr.d || 90) / 1000; // ms → s
    }
    const anim: Animation = {
      name: animName,
      duration: timeSec,
      bones: {},
      slots: {
        flower: { attachment: attachmentKeys },
      },
    };
    skeleton.animations[animName] = anim;
  });

  return { skeleton, atlas };
}

/**
 * Load a KVTM bloom JSON file (the sample in public/sample-assets/).
 * Returns the parsed import result.
 */
export async function loadKvtmSample(url: string, sheetName: string): Promise<ImportResult> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`fetch ${url}: ${r.status}`);
  const json = await r.json();
  // The sample JSON has the KVTM data plus some _meta keys we strip.
  const data: KvtmBloomData = { modules: json.modules, anims: json.anims };
  return importKvtmBloom(data, sheetName);
}

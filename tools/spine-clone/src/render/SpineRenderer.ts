// SpineRenderer — wraps the OFFICIAL @esotericsoftware/spine-pixi-v8 runtime.
//
// This replaces our home-grown PixiRenderer. The official runtime handles
// EVERYTHING correctly:
//   - Bone hierarchy + world transforms (Y-up convention)
//   - Region + mesh attachments
//   - IK + transform + path constraints
//   - Animation mixing (multiple tracks blending)
//   - Bezier curves (proper Spine curve format)
//   - Attachment swaps + color/alpha tweens
//   - Clipping
//
// Input: skeleton JSON text, atlas TEXT, sheet image as Pixi Texture.
// Output: a Pixi-renderable Spine container we add to the stage.

import {
  Spine,
  TextureAtlas,
  AtlasAttachmentLoader,
  SkeletonJson,
  SpineTexture,
} from '@esotericsoftware/spine-pixi-v8';
import type { Texture } from 'pixi.js';

export interface SpineLoadResult {
  spine: Spine;
  animationNames: string[];
  skinNames: string[];
  durationByAnim: Record<string, number>;
}

/**
 * Create a Spine display object from already-loaded text + texture.
 * Avoids spine-pixi's URL-based asset loader (which can't easily consume
 * blob URLs from our Tauri-loaded files).
 */
export function loadSpineFromText(
  skeletonJsonText: string,
  atlasText: string,
  sheetTexture: Texture,
): SpineLoadResult {
  // 1. Build TextureAtlas from the .atlas text
  const atlas = new TextureAtlas(atlasText);

  // 2. Assign Pixi texture to every atlas page.
  // For multi-page atlases, all pages share the same sheet here. (Phase 4
  // enhancement: load distinct image per page when atlas references them.)
  for (const page of atlas.pages) {
    page.setTexture(SpineTexture.from(sheetTexture.source));
  }

  // 3. Build attachment loader bound to this atlas
  const loader = new AtlasAttachmentLoader(atlas);

  // 4. Parse skeleton JSON
  const json = new SkeletonJson(loader);
  const skeletonData = json.readSkeletonData(skeletonJsonText);

  // 5. Construct the Spine display object
  const spine = new Spine(skeletonData);

  // Collect metadata for UI
  const animationNames = skeletonData.animations.map(a => a.name);
  const skinNames = skeletonData.skins.map(s => s.name);
  const durationByAnim: Record<string, number> = {};
  for (const a of skeletonData.animations) durationByAnim[a.name] = a.duration;

  return { spine, animationNames, skinNames, durationByAnim };
}

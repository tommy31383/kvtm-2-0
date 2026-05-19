// Pose evaluation — combine setup pose + animation timelines at time t
// → world-space transforms for each bone + active attachment per slot.
//
// Pipeline:
//   1. For each bone: read setup pose, override with animation keyframes
//      (interpolated). Result = local transform.
//   2. Walk bone tree in parent-first order, multiply parent's world matrix
//      by local matrix → bone's world matrix.
//   3. For each slot: read setup attachment, override with attachment timeline.
//      Active attachment renders at the slot's bone's world transform.
//
// The renderer (PixiRenderer) takes the output `PoseSnapshot` and updates
// Pixi Container transforms to match.

import type {
  Skeleton, Bone, Slot, Animation, XY,
} from './types.js';
import {
  sampleNumberTimeline, sampleXYTimeline, sampleSteppedTimeline, lerpAngle,
} from './interpolation.js';

// ── Local transform = setup + animation override ──────────────
export interface LocalTransform {
  x: number;
  y: number;
  rotation: number;    // degrees
  scaleX: number;
  scaleY: number;
}

// ── World transform = 2D affine matrix + decomposed components ────
export interface WorldTransform {
  // Affine matrix: [a, b, c, d, tx, ty]
  // Applied: x' = a*x + c*y + tx ;  y' = b*x + d*y + ty
  a: number; b: number;
  c: number; d: number;
  tx: number; ty: number;
}

export interface PoseSnapshot {
  bones: { [boneName: string]: WorldTransform };
  slotAttachments: { [slotName: string]: string | null | undefined };
}

// ── Local transform from setup pose + animation override ────────
export function evaluateLocalTransform(
  bone: Bone,
  anim: Animation | undefined,
  t: number,
): LocalTransform {
  let { x, y, rotation, scaleX, scaleY } = bone;
  const tl = anim?.bones?.[bone.name];
  if (tl) {
    if (tl.translate && tl.translate.length) {
      const off = sampleXYTimeline(tl.translate, t);
      x += off.x;
      y += off.y;
    }
    if (tl.rotate && tl.rotate.length) {
      const r = sampleNumberTimeline(tl.rotate, t, lerpAngle);
      rotation += r;
    }
    if (tl.scale && tl.scale.length) {
      const s = sampleXYTimeline(tl.scale, t);
      scaleX *= s.x;
      scaleY *= s.y;
    }
  }
  return { x, y, rotation, scaleX, scaleY };
}

// ── Matrix helpers ─────────────────────────────────────────────
export const identityMatrix = (): WorldTransform =>
  ({ a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 });

/** Compose local TRS → 2D affine matrix. Rotation in degrees. */
export function localToMatrix(local: LocalTransform): WorldTransform {
  const rad = (local.rotation * Math.PI) / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  return {
    a:  cos * local.scaleX,
    b:  sin * local.scaleX,
    c: -sin * local.scaleY,
    d:  cos * local.scaleY,
    tx: local.x,
    ty: local.y,
  };
}

/** Multiply two 2D affine matrices: result = parent ∘ child. */
export function multiplyMatrix(p: WorldTransform, c: WorldTransform): WorldTransform {
  return {
    a:  p.a * c.a + p.c * c.b,
    b:  p.b * c.a + p.d * c.b,
    c:  p.a * c.c + p.c * c.d,
    d:  p.b * c.c + p.d * c.d,
    tx: p.a * c.tx + p.c * c.ty + p.tx,
    ty: p.b * c.tx + p.d * c.ty + p.ty,
  };
}

// ── Full pose evaluation ───────────────────────────────────────
/**
 * Walk the bone hierarchy + apply animation, returning a world-space snapshot.
 * @param skeleton The skeleton being posed.
 * @param animName Animation to apply. undefined → setup pose only.
 * @param t Time in seconds.
 */
export function evaluatePose(
  skeleton: Skeleton,
  animName: string | undefined,
  t: number,
): PoseSnapshot {
  const anim = animName ? skeleton.animations[animName] : undefined;

  // Map bones by name + index parent's index
  const byName: Record<string, Bone> = {};
  skeleton.bones.forEach(b => { byName[b.name] = b; });

  // Compute world transforms; iterate in parent-first order. The bones[] list
  // is assumed to be roughly parent-first (Spine convention). For safety we
  // walk recursively + memoize.
  const worlds: Record<string, WorldTransform> = {};
  function computeWorld(name: string): WorldTransform {
    if (worlds[name]) return worlds[name];
    const bone = byName[name];
    if (!bone) throw new Error(`bone not found: ${name}`);
    const local = evaluateLocalTransform(bone, anim, t);
    const localMat = localToMatrix(local);
    if (!bone.parent) {
      worlds[name] = localMat;
    } else {
      const parentWorld = computeWorld(bone.parent);
      worlds[name] = multiplyMatrix(parentWorld, localMat);
    }
    return worlds[name];
  }
  skeleton.bones.forEach(b => computeWorld(b.name));

  // Slot attachments — current attachment per slot from setup + timeline
  const slotAttachments: Record<string, string | null | undefined> = {};
  skeleton.slots.forEach((slot: Slot) => {
    let active: string | null | undefined = slot.attachment;
    const tl = anim?.slots?.[slot.name];
    if (tl?.attachment && tl.attachment.length) {
      const sampled = sampleSteppedTimeline(tl.attachment, t);
      if (sampled !== undefined) active = sampled;
    }
    slotAttachments[slot.name] = active;
  });

  return { bones: worlds, slotAttachments };
}

// ── Extract decomposed TRS from a world matrix (for Pixi Container set) ──
export function decomposeMatrix(m: WorldTransform): LocalTransform {
  // Standard 2D matrix decomposition; assumes no shear.
  const scaleX = Math.sign(m.a) * Math.hypot(m.a, m.b);
  const scaleY = Math.sign(m.d) * Math.hypot(m.c, m.d);
  const rotation = (Math.atan2(m.b, m.a) * 180) / Math.PI;
  return { x: m.tx, y: m.ty, rotation, scaleX, scaleY };
}

// ── Util: XY type re-export for convenience ────────────────────
export type { XY };

// Export to Spine 4.x JSON format — runtime-compatible.
//
// Spec: https://en.esotericsoftware.com/spine-json-format
//
// Compatibility goal: outputs JSON that any spine-runtime (spine-pixi,
// spine-three, spine-threejs, spine-ts) can load via SkeletonJson.readSkeletonData.
//
// Conversion notes:
//   - Spine uses Y-up, our model is currently Y-up too (Phase 1)
//   - Spine timeline keys use `time` in seconds (same as ours)
//   - Spine curve: 'stepped' | 'linear' | [cx1, cy1, cx2, cy2] (same)
//   - Spine slot color is hex without '#' — we strip if present
//   - Bone transformMode: spine uses 'normal'|'onlyTranslation'|... (same names)
//   - We emit `defaultSkin` only (Spine convention) — multi-skin in Phase 4+
//
// Limitations (Phase 1):
//   - No mesh, IK, constraints, events emitted yet
//   - No particle effects (Spine doesn't support natively — would need custom ext)

import type {
  Skeleton, Animation, Bone, Slot, RegionAttachment, TimelineKey, CurveType,
} from '../core/types.js';

interface SpineJson {
  skeleton: {
    hash?: string;
    spine: string;             // version
    width?: number;
    height?: number;
    images?: string;
    audio?: string;
  };
  bones: SpineBone[];
  slots: SpineSlot[];
  skins: SpineSkin[];
  animations: { [name: string]: SpineAnimation };
  events?: any;
  ik?: any[];
  transform?: any[];
  path?: any[];
}

interface SpineBone {
  name: string;
  parent?: string;
  length?: number;
  x?: number;
  y?: number;
  rotation?: number;
  scaleX?: number;
  scaleY?: number;
  shearX?: number;
  shearY?: number;
  transform?: string;
  color?: string;
}

interface SpineSlot {
  name: string;
  bone: string;
  attachment?: string;
  color?: string;
  dark?: string;
  blend?: string;
}

interface SpineSkin {
  name: string;
  attachments: { [slotName: string]: { [attachName: string]: SpineAttachment } };
}

interface SpineAttachment {
  type?: string;               // 'region' (default) | 'mesh' | 'boundingbox' | 'path'
  name?: string;
  path?: string;
  x?: number;
  y?: number;
  rotation?: number;
  scaleX?: number;
  scaleY?: number;
  width?: number;
  height?: number;
  color?: string;
  // mesh
  vertices?: number[];
  uvs?: number[];
  triangles?: number[];
  hull?: number;
}

interface SpineAnimation {
  bones?: { [boneName: string]: SpineBoneTimeline };
  slots?: { [slotName: string]: SpineSlotTimeline };
  events?: any[];
  drawOrder?: any[];
}

interface SpineBoneTimeline {
  rotate?: SpineKey[];
  translate?: SpineKey[];
  scale?: SpineKey[];
  shear?: SpineKey[];
}

interface SpineSlotTimeline {
  attachment?: SpineKey[];
  color?: SpineKey[];
}

interface SpineKey {
  time?: number;
  value?: any;
  angle?: number;              // for rotate
  x?: number; y?: number;      // for translate / scale / shear
  name?: string | null;        // for attachment
  color?: string;
  curve?: any;                 // 'stepped' | 'linear' | [c1,c2,c3,c4]
}

// ── Helpers ────────────────────────────────────────────────────
function stripHash(c?: string): string | undefined {
  if (!c) return undefined;
  return c.startsWith('#') ? c.slice(1) : c;
}

function exportCurve(curve?: CurveType): any {
  if (!curve || curve === 'linear') return undefined;
  if (curve === 'stepped') return 'stepped';
  return curve;
}

// ── Main exporter ──────────────────────────────────────────────
export function exportToSpineJson(
  skeleton: Skeleton,
  opts: { spineVersion?: string; imagesPath?: string } = {},
): string {
  const spine: SpineJson = {
    skeleton: {
      spine: opts.spineVersion ?? '4.2',
      hash: skeleton.hash,
      images: opts.imagesPath,
    },
    bones: skeleton.bones.map(exportBone),
    slots: skeleton.slots.map(exportSlot),
    skins: skeleton.skins.map(exportSkin),
    animations: {},
  };
  Object.entries(skeleton.animations).forEach(([name, anim]) => {
    spine.animations[name] = exportAnimation(anim);
  });
  return JSON.stringify(spine, null, 2);
}

function exportBone(b: Bone): SpineBone {
  const out: SpineBone = { name: b.name };
  if (b.parent) out.parent = b.parent;
  if (b.length) out.length = b.length;
  if (b.x) out.x = b.x;
  if (b.y) out.y = b.y;
  if (b.rotation) out.rotation = b.rotation;
  if (b.scaleX !== undefined && b.scaleX !== 1) out.scaleX = b.scaleX;
  if (b.scaleY !== undefined && b.scaleY !== 1) out.scaleY = b.scaleY;
  if (b.shearX) out.shearX = b.shearX;
  if (b.shearY) out.shearY = b.shearY;
  if (b.transformMode && b.transformMode !== 'normal') out.transform = b.transformMode;
  if (b.color) out.color = stripHash(b.color);
  return out;
}

function exportSlot(s: Slot): SpineSlot {
  const out: SpineSlot = { name: s.name, bone: s.bone };
  if (s.attachment) out.attachment = s.attachment;
  if (s.color) out.color = stripHash(s.color);
  if (s.blend && s.blend !== 'normal') out.blend = s.blend;
  return out;
}

function exportSkin(skin: Skeleton['skins'][number]): SpineSkin {
  const out: SpineSkin = { name: skin.name, attachments: {} };
  Object.entries(skin.attachments).forEach(([slotName, atts]) => {
    out.attachments[slotName] = {};
    Object.entries(atts).forEach(([attName, att]) => {
      out.attachments[slotName][attName] = exportAttachment(att);
    });
  });
  return out;
}

function exportAttachment(att: any): SpineAttachment {
  if (att.type === 'region') {
    const a = att as RegionAttachment;
    const out: SpineAttachment = {};
    if (a.path && a.path !== a.name) out.path = a.path;
    if (a.x) out.x = a.x;
    if (a.y) out.y = a.y;
    if (a.rotation) out.rotation = a.rotation;
    if (a.scaleX !== undefined && a.scaleX !== 1) out.scaleX = a.scaleX;
    if (a.scaleY !== undefined && a.scaleY !== 1) out.scaleY = a.scaleY;
    if (a.width) out.width = a.width;
    if (a.height) out.height = a.height;
    if (a.color) out.color = stripHash(a.color);
    return out;
  }
  // Mesh/boundingbox fall-through (Phase 4): emit raw fields with type tag
  return { type: att.type, ...att };
}

function exportAnimation(anim: Animation): SpineAnimation {
  const out: SpineAnimation = {};
  // Bones
  if (Object.keys(anim.bones).length) {
    out.bones = {};
    Object.entries(anim.bones).forEach(([boneName, tl]) => {
      const stl: SpineBoneTimeline = {};
      if (tl.rotate) stl.rotate = tl.rotate.map(k => exportKey({ time: k.time, angle: k.value, curve: k.curve }));
      if (tl.translate) stl.translate = tl.translate.map(k => exportKey({ time: k.time, x: k.value.x, y: k.value.y, curve: k.curve }));
      if (tl.scale) stl.scale = tl.scale.map(k => exportKey({ time: k.time, x: k.value.x, y: k.value.y, curve: k.curve }));
      if (tl.shear) stl.shear = tl.shear.map(k => exportKey({ time: k.time, x: k.value.x, y: k.value.y, curve: k.curve }));
      out.bones![boneName] = stl;
    });
  }
  // Slots
  if (Object.keys(anim.slots).length) {
    out.slots = {};
    Object.entries(anim.slots).forEach(([slotName, tl]) => {
      const stl: SpineSlotTimeline = {};
      if (tl.attachment) stl.attachment = tl.attachment.map(k => exportKey({ time: k.time, name: k.value, curve: k.curve }));
      if (tl.color)      stl.color      = tl.color.map(k => exportKey({ time: k.time, color: stripHash(k.value), curve: k.curve }));
      out.slots![slotName] = stl;
    });
  }
  return out;
}

function exportKey(partial: SpineKey): SpineKey {
  const out: SpineKey = {};
  // Spine omits time:0 in first key by convention — but it's safe to include.
  if (partial.time) out.time = partial.time;
  if (partial.angle !== undefined && partial.angle !== 0) out.angle = partial.angle;
  if (partial.x !== undefined) out.x = partial.x;
  if (partial.y !== undefined) out.y = partial.y;
  if (partial.name !== undefined) out.name = partial.name;
  if (partial.color !== undefined) out.color = partial.color;
  const c = exportCurve(partial.curve);
  if (c !== undefined) out.curve = c;
  return out;
}

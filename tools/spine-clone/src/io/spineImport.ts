// Parse Spine 4.x JSON skeleton format → internal Skeleton model.
//
// Spec: https://en.esotericsoftware.com/spine-json-format
//
// This is the inverse of spineExport.ts. Round-trip parity: a skeleton
// exported via exportToSpineJson and re-imported via this should be
// equivalent (modulo default-value normalization).

import type {
  Skeleton, Bone, Slot, Animation, BoneTimeline, SlotTimeline,
  TimelineKey, CurveType, RegionAttachment, MeshAttachment,
  Attachment, XY,
} from '../core/types.js';

export function parseSpineJson(text: string): Skeleton {
  const raw = JSON.parse(text);
  if (!raw.bones || !Array.isArray(raw.bones)) {
    throw new Error('Not a Spine JSON: missing `bones` array');
  }
  const name = inferName(raw);
  const skeleton: Skeleton = {
    name,
    version: raw.skeleton?.spine ?? '4.2',
    hash: raw.skeleton?.hash,
    bones: raw.bones.map(parseBone),
    slots: (raw.slots ?? []).map(parseSlot),
    skins: parseSkins(raw.skins ?? raw.skin ?? []),
    animations: {},
  };
  if (raw.animations) {
    Object.entries(raw.animations).forEach(([animName, animObj]) => {
      skeleton.animations[animName] = parseAnimation(animName, animObj as any);
    });
  }
  return skeleton;
}

function inferName(raw: any): string {
  if (raw.skeleton?.images) {
    const m = raw.skeleton.images.match(/([^\\/]+)[\\/]?$/);
    if (m) return m[1].replace(/\.\w+$/, '');
  }
  return 'imported';
}

// ── Bones ──────────────────────────────────────────────────────
function parseBone(b: any): Bone {
  return {
    name: b.name,
    parent: b.parent,
    length: b.length ?? 0,
    x: b.x ?? 0,
    y: b.y ?? 0,
    rotation: b.rotation ?? 0,
    scaleX: b.scaleX ?? 1,
    scaleY: b.scaleY ?? 1,
    shearX: b.shearX ?? 0,
    shearY: b.shearY ?? 0,
    transformMode: b.transform ?? 'normal',
    color: b.color ? `#${b.color}` : undefined,
  };
}

// ── Slots ──────────────────────────────────────────────────────
function parseSlot(s: any): Slot {
  return {
    name: s.name,
    bone: s.bone,
    attachment: s.attachment,
    color: s.color ? `#${s.color}` : undefined,
    blend: s.blend,
  };
}

// ── Skins ──────────────────────────────────────────────────────
function parseSkins(skinsRaw: any): Skeleton['skins'] {
  // Spine has TWO historical formats:
  //   - new: skins: [{name, attachments: {slot: {att: {...}}}}]
  //   - old: skin: {slot: {att: {...}}}  (single default skin)
  if (Array.isArray(skinsRaw)) {
    return skinsRaw.map((sk: any) => ({
      name: sk.name,
      attachments: parseSlotAttachments(sk.attachments ?? {}),
    }));
  }
  // Old format → wrap as default skin
  return [{
    name: 'default',
    attachments: parseSlotAttachments(skinsRaw),
  }];
}

function parseSlotAttachments(raw: any): Skeleton['skins'][number]['attachments'] {
  const out: Skeleton['skins'][number]['attachments'] = {};
  Object.entries(raw).forEach(([slotName, atts]: [string, any]) => {
    out[slotName] = {};
    Object.entries(atts).forEach(([attName, attRaw]: [string, any]) => {
      out[slotName][attName] = parseAttachment(attName, attRaw);
    });
  });
  return out;
}

function parseAttachment(name: string, raw: any): Attachment {
  const type = raw.type ?? 'region';
  if (type === 'region') {
    const r: RegionAttachment = {
      type: 'region',
      name,
      path: raw.path ?? name,
      x: raw.x ?? 0,
      y: raw.y ?? 0,
      rotation: raw.rotation ?? 0,
      scaleX: raw.scaleX ?? 1,
      scaleY: raw.scaleY ?? 1,
      width: raw.width ?? 0,
      height: raw.height ?? 0,
      color: raw.color ? `#${raw.color}` : undefined,
    };
    return r;
  }
  if (type === 'mesh') {
    const m: MeshAttachment = {
      type: 'mesh',
      name,
      path: raw.path ?? name,
      vertices: raw.vertices ?? [],
      uvs: raw.uvs ?? [],
      triangles: raw.triangles ?? [],
      hull: raw.hull ?? 0,
      width: raw.width,
      height: raw.height,
      color: raw.color ? `#${raw.color}` : undefined,
    };
    return m;
  }
  // boundingbox / path / clipping / etc. — pass-through (Phase 4+ first-class support)
  return { type, name, ...raw };
}

// ── Animations ─────────────────────────────────────────────────
function parseAnimation(name: string, raw: any): Animation {
  const anim: Animation = {
    name,
    duration: 0,  // computed below
    bones: {},
    slots: {},
  };

  // Bone timelines
  if (raw.bones) {
    Object.entries(raw.bones).forEach(([boneName, tlRaw]: [string, any]) => {
      const tl: BoneTimeline = {};
      if (tlRaw.rotate) {
        tl.rotate = tlRaw.rotate.map((k: any) => ({
          time: k.time ?? 0,
          value: k.angle ?? k.value ?? 0,
          curve: parseCurve(k.curve),
        } as TimelineKey<number>));
      }
      if (tlRaw.translate) {
        tl.translate = tlRaw.translate.map(parseXYKey);
      }
      if (tlRaw.scale) {
        tl.scale = tlRaw.scale.map(parseXYKey);
      }
      if (tlRaw.shear) {
        tl.shear = tlRaw.shear.map(parseXYKey);
      }
      anim.bones[boneName] = tl;
    });
  }

  // Slot timelines
  if (raw.slots) {
    Object.entries(raw.slots).forEach(([slotName, tlRaw]: [string, any]) => {
      const tl: SlotTimeline = {};
      if (tlRaw.attachment) {
        tl.attachment = tlRaw.attachment.map((k: any) => ({
          time: k.time ?? 0,
          value: k.name === undefined ? null : k.name,
          curve: parseCurve(k.curve) ?? 'stepped',
        } as TimelineKey<string | null>));
      }
      // Spine 4.x uses `rgba` field; Spine 3.x used `color`. Support both.
      const colorRaw = tlRaw.rgba ?? tlRaw.color;
      if (colorRaw && Array.isArray(colorRaw)) {
        tl.color = colorRaw.map((k: any) => ({
          time: k.time ?? 0,
          value: k.color ? `#${k.color}` : '#ffffffff',
          curve: parseCurve(k.curve),
        } as TimelineKey<string>));
      }
      anim.slots[slotName] = tl;
    });
  }

  // Compute duration = max time across all timelines
  let maxT = 0;
  const visit = (t?: number) => { if (typeof t === 'number' && t > maxT) maxT = t; };
  Object.values(anim.bones).forEach(tl => {
    tl.rotate?.forEach(k => visit(k.time));
    tl.translate?.forEach(k => visit(k.time));
    tl.scale?.forEach(k => visit(k.time));
    tl.shear?.forEach(k => visit(k.time));
  });
  Object.values(anim.slots).forEach(tl => {
    tl.attachment?.forEach(k => visit(k.time));
    tl.color?.forEach(k => visit(k.time));
  });
  anim.duration = maxT;
  return anim;
}

function parseXYKey(k: any): TimelineKey<XY> {
  return {
    time: k.time ?? 0,
    value: { x: k.x ?? 0, y: k.y ?? 0 },
    curve: parseCurve(k.curve),
  };
}

function parseCurve(c: any): CurveType | undefined {
  if (c === undefined || c === 'linear') return undefined;
  if (c === 'stepped') return 'stepped';
  if (Array.isArray(c) && c.length === 4) return c as [number, number, number, number];
  return undefined;
}

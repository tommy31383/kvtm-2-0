// Core data model — Spine-equivalent skeleton + animation primitives.
//
// Mirrors the structure documented in docs/DESIGN.md. Compatible target:
// Spine 4.x JSON schema (https://en.esotericsoftware.com/spine-json-format).
// Some fields are simplified / deferred for Phase 1-3; full features added in
// Phase 4 (mesh, IK, constraints).

// ── Skeleton root ──────────────────────────────────────────────
export interface Skeleton {
  name: string;
  version: string;            // schema version, e.g. "0.1.0"
  hash?: string;              // optional checksum (Spine compat)
  bones: Bone[];
  slots: Slot[];
  skins: Skin[];              // Phase 1: just "default"
  animations: { [name: string]: Animation };
  // Phase 4+
  ik?: IKConstraint[];
  transform?: TransformConstraint[];
  // Phase 5+
  events?: EventDef[];
}

// ── Bone ───────────────────────────────────────────────────────
export interface Bone {
  name: string;
  parent?: string;            // null/undefined → root
  length: number;             // visual length for editor; affects nothing in pose
  // Setup pose (relative to parent)
  x: number;
  y: number;
  rotation: number;           // degrees
  scaleX: number;
  scaleY: number;
  shearX?: number;            // degrees, Phase 4
  shearY?: number;
  transformMode?: TransformMode;
  // UI hints
  color?: string;             // hex for editor display, e.g. "#ff8a3d"
}

export type TransformMode =
  | 'normal'                  // inherit everything
  | 'onlyTranslation'         // inherit translation only
  | 'noRotationOrReflection'
  | 'noScale'
  | 'noScaleOrReflection';

// ── Slot ───────────────────────────────────────────────────────
export interface Slot {
  name: string;
  bone: string;               // parent bone name
  attachment?: string;        // active attachment name (from active skin)
  color?: string;             // hex tint, default "ffffffff"
  blend?: BlendMode;
}

export type BlendMode = 'normal' | 'additive' | 'multiply' | 'screen';

// ── Skin (attachment set) ──────────────────────────────────────
export interface Skin {
  name: string;
  // skin → slot name → attachment name → attachment def
  attachments: { [slotName: string]: { [attachName: string]: Attachment } };
}

// ── Attachments ────────────────────────────────────────────────
export type Attachment = RegionAttachment | MeshAttachment | BoundingBoxAttachment;

export interface RegionAttachment {
  type: 'region';
  name: string;
  path?: string;              // texture region name; defaults to attachment name
  x: number;                  // offset from slot's bone
  y: number;
  rotation: number;           // degrees
  scaleX: number;
  scaleY: number;
  width: number;              // unscaled image size
  height: number;
  color?: string;
}

export interface MeshAttachment {
  type: 'mesh';
  name: string;
  path?: string;
  // Flat vertices: either [x,y, x,y, ...] (no bones) or
  // [boneCount, b1,w1,x1,y1, b2,w2,x2,y2, ...] (bone-weighted, Phase 4)
  vertices: number[];
  uvs: number[];              // u,v pairs, 0..1
  triangles: number[];        // index triples
  hull: number;               // hull vertex count
  width?: number;
  height?: number;
  color?: string;
}

export interface BoundingBoxAttachment {
  type: 'boundingbox';
  name: string;
  vertices: number[];
}

// ── Animation ──────────────────────────────────────────────────
export interface Animation {
  name: string;
  duration: number;           // seconds (computed = max key time across all timelines)
  bones: { [boneName: string]: BoneTimeline };
  slots: { [slotName: string]: SlotTimeline };
  // Phase 5
  events?: EventKey[];
  drawOrder?: DrawOrderKey[];
}

export interface BoneTimeline {
  rotate?: TimelineKey<number>[];
  translate?: TimelineKey<XY>[];
  scale?: TimelineKey<XY>[];
  shear?: TimelineKey<XY>[];
}

export interface SlotTimeline {
  attachment?: TimelineKey<string | null>[];   // stepped (no interp)
  color?: TimelineKey<string>[];                // hex string
}

export interface TimelineKey<T> {
  time: number;               // seconds
  value: T;
  curve?: CurveType;
}

// 'linear' (default), 'stepped' (hold value), or bezier [cx1,cy1,cx2,cy2]
export type CurveType = 'linear' | 'stepped' | [number, number, number, number];

export interface XY { x: number; y: number; }

// ── Constraints (Phase 4) ──────────────────────────────────────
export interface IKConstraint {
  name: string;
  bones: string[];            // bones controlled, last bone is end-effector
  target: string;             // bone the chain reaches towards
  mix: number;                // 0..1 blend with setup pose
  bendPositive: boolean;
}

export interface TransformConstraint {
  name: string;
  bones: string[];
  target: string;
  rotateMix: number;
  translateMix: number;
  scaleMix: number;
  shearMix: number;
}

// ── Events (Phase 5) ──────────────────────────────────────────
export interface EventDef {
  name: string;
  int?: number;
  float?: number;
  string?: string;
}
export interface EventKey {
  time: number;
  name: string;
  int?: number;
  float?: number;
  string?: string;
}
export interface DrawOrderKey {
  time: number;
  offsets: { slot: string; offset: number }[];
}

// ── Atlas (texture packing) ────────────────────────────────────
export interface Atlas {
  pages: AtlasPage[];
}
export interface AtlasPage {
  name: string;               // image file name, e.g. "sprites.png"
  width: number;
  height: number;
  format?: string;            // RGBA8888, RGBA4444, etc.
  filter?: [string, string];  // [min, mag], e.g. ["Linear", "Linear"]
  regions: AtlasRegion[];
}
export interface AtlasRegion {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotate?: boolean;           // 90deg rotated for tighter pack
  offsetX?: number;           // for trimmed sprites
  offsetY?: number;
  originalWidth?: number;
  originalHeight?: number;
}

// ── Helpers ────────────────────────────────────────────────────
export function makeEmptySkeleton(name = 'Skeleton'): Skeleton {
  return {
    name,
    version: '0.1.0',
    bones: [{ name: 'root', length: 0, x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 }],
    slots: [],
    skins: [{ name: 'default', attachments: {} }],
    animations: {},
  };
}

// Timeline reference helpers — locate a specific keyframe array inside
// Skeleton.animations[animName] for command get/set operations.
//
// A TimelineRef is a structured pointer that survives JSON round-trips —
// commands store these instead of direct array references so they remain
// valid after undo/redo replays.

import type {
  Skeleton, Animation, BoneTimeline, SlotTimeline,
  TimelineKey, XY, CurveType,
} from '../../core/types.js';

export type BoneChannel = 'rotate' | 'translate' | 'scale' | 'shear';
export type SlotChannel = 'attachment' | 'color';

export type TimelineRef =
  | { kind: 'bone'; animation: string; bone: string; channel: BoneChannel }
  | { kind: 'slot'; animation: string; slot: string; channel: SlotChannel };

export type TimelineValue = number | XY | string | null;
export type AnyKey = TimelineKey<TimelineValue>;

/** Get the animation, creating an empty one if `createIfMissing`. */
export function getAnimation(
  skel: Skeleton, name: string, createIfMissing = false,
): Animation | undefined {
  let anim = skel.animations[name];
  if (!anim && createIfMissing) {
    anim = { name, duration: 0, bones: {}, slots: {} };
    skel.animations[name] = anim;
  }
  return anim;
}

/**
 * Resolve the key array for a given ref. Creates parent containers (bone
 * timeline, channel array) if `createIfMissing` — necessary for InsertKey.
 * Returns undefined if anim missing AND !createIfMissing.
 */
export function resolveKeys(
  skel: Skeleton, ref: TimelineRef, createIfMissing = false,
): AnyKey[] | undefined {
  const anim = getAnimation(skel, ref.animation, createIfMissing);
  if (!anim) return undefined;

  if (ref.kind === 'bone') {
    let bt: BoneTimeline | undefined = anim.bones[ref.bone];
    if (!bt) {
      if (!createIfMissing) return undefined;
      bt = {};
      anim.bones[ref.bone] = bt;
    }
    let arr = (bt as any)[ref.channel] as AnyKey[] | undefined;
    if (!arr) {
      if (!createIfMissing) return undefined;
      arr = [];
      (bt as any)[ref.channel] = arr;
    }
    return arr;
  }

  // slot
  let st: SlotTimeline | undefined = anim.slots[ref.slot];
  if (!st) {
    if (!createIfMissing) return undefined;
    st = {};
    anim.slots[ref.slot] = st;
  }
  let arr = (st as any)[ref.channel] as AnyKey[] | undefined;
  if (!arr) {
    if (!createIfMissing) return undefined;
    arr = [];
    (st as any)[ref.channel] = arr;
  }
  return arr;
}

/** Binary search for key index by time. Returns -1 if not found. */
export function findKeyIndex(keys: AnyKey[], time: number, epsilon = 1e-6): number {
  for (let i = 0; i < keys.length; i++) {
    if (Math.abs(keys[i].time - time) < epsilon) return i;
  }
  return -1;
}

/** Insert key keeping array sorted by time. Returns insertion index. */
export function insertSorted(keys: AnyKey[], key: AnyKey): number {
  let i = 0;
  while (i < keys.length && keys[i].time < key.time) i++;
  keys.splice(i, 0, key);
  return i;
}

/** Recompute animation duration as max time across all timelines. */
export function recomputeDuration(anim: Animation): void {
  let maxT = 0;
  for (const bt of Object.values(anim.bones)) {
    for (const ch of ['rotate', 'translate', 'scale', 'shear'] as const) {
      const arr = (bt as any)[ch] as AnyKey[] | undefined;
      if (arr && arr.length) maxT = Math.max(maxT, arr[arr.length - 1].time);
    }
  }
  for (const st of Object.values(anim.slots)) {
    for (const ch of ['attachment', 'color'] as const) {
      const arr = (st as any)[ch] as AnyKey[] | undefined;
      if (arr && arr.length) maxT = Math.max(maxT, arr[arr.length - 1].time);
    }
  }
  anim.duration = maxT;
}

/** Deep clone a key (value may be XY object — needs copy). */
export function cloneKey<T extends AnyKey>(k: T): T {
  const copy: any = { time: k.time, value: cloneValue(k.value) };
  if (k.curve !== undefined) copy.curve = Array.isArray(k.curve) ? [...k.curve] as CurveType : k.curve;
  return copy;
}

function cloneValue(v: TimelineValue): TimelineValue {
  if (v === null) return null;
  if (typeof v === 'object') return { x: v.x, y: v.y };
  return v;
}

/** Stable string key for a TimelineRef — used for coalesce comparison. */
export function refKey(ref: TimelineRef): string {
  return ref.kind === 'bone'
    ? `b/${ref.animation}/${ref.bone}/${ref.channel}`
    : `s/${ref.animation}/${ref.slot}/${ref.channel}`;
}

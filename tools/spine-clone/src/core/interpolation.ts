// Timeline interpolation — Linear / Stepped / Bezier.
//
// Spine 4.x curve format:
//   undefined / 'linear'  → linear interp (default)
//   'stepped'             → hold previous value until next key
//   [cx1, cy1, cx2, cy2]  → cubic bezier (cx/cy in 0..1, see Spine docs)
//
// References:
//   https://en.esotericsoftware.com/spine-curve-format
//   https://www.smoothterminal.com/articles/cubic-bezier
//
// All sample APIs take an `alpha` in [0,1] representing normalized time
// between two keyframes (alpha=0 → from, alpha=1 → to).

import type { CurveType, TimelineKey, XY } from './types.js';

// ── Curve evaluation ───────────────────────────────────────────

/**
 * Evaluate a curve at normalized time alpha ∈ [0,1].
 * Returns the eased alpha to use for the value lerp.
 */
export function evalCurve(curve: CurveType | undefined, alpha: number): number {
  if (alpha <= 0) return 0;
  if (alpha >= 1) return 1;
  if (!curve || curve === 'linear') return alpha;
  if (curve === 'stepped') return 0;
  // Cubic bezier: [cx1, cy1, cx2, cy2]
  // Spine's bezier curves are parameterized so the X axis is time and the Y
  // axis is the eased value. We find the bezier param t such that x(t) = alpha,
  // then return y(t).
  return cubicBezierEase(curve[0], curve[1], curve[2], curve[3], alpha);
}

/** Solve cubic-bezier ease for x → return y. Newton-Raphson root find. */
export function cubicBezierEase(
  cx1: number, cy1: number, cx2: number, cy2: number, x: number,
): number {
  // Standard CSS-like cubic bezier with P0=(0,0), P3=(1,1).
  // x(t) = 3(1-t)^2 t cx1 + 3(1-t) t^2 cx2 + t^3
  // y(t) = 3(1-t)^2 t cy1 + 3(1-t) t^2 cy2 + t^3
  // Find t s.t. x(t) = x, then return y(t).
  const cx = 3 * cx1;
  const bx = 3 * (cx2 - cx1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * cy1;
  const by = 3 * (cy2 - cy1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t;
  const sampleDx = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  // Newton-Raphson
  let t = x;
  for (let i = 0; i < 8; i++) {
    const xt = sampleX(t) - x;
    if (Math.abs(xt) < 1e-6) return sampleY(t);
    const dx = sampleDx(t);
    if (Math.abs(dx) < 1e-6) break;
    t -= xt / dx;
  }
  // Fallback: bisection
  let lo = 0, hi = 1;
  t = x;
  for (let i = 0; i < 32; i++) {
    const xt = sampleX(t);
    if (Math.abs(xt - x) < 1e-6) return sampleY(t);
    if (xt < x) lo = t; else hi = t;
    t = (lo + hi) / 2;
  }
  return sampleY(t);
}

// ── Numeric lerp helpers ───────────────────────────────────────

export function lerpNum(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Lerp two XY vectors. */
export function lerpXY(a: XY, b: XY, t: number): XY {
  return { x: lerpNum(a.x, b.x, t), y: lerpNum(a.y, b.y, t) };
}

/** Lerp two angles (degrees) by shortest path. */
export function lerpAngle(a: number, b: number, t: number): number {
  let delta = b - a;
  while (delta > 180) delta -= 360;
  while (delta < -180) delta += 360;
  return a + delta * t;
}

// ── Timeline sampling ──────────────────────────────────────────

/**
 * Sample a timeline of numeric keyframes at time t (seconds).
 * Before the first key → returns first key's value.
 * After the last key  → returns last key's value.
 */
export function sampleNumberTimeline(
  keys: TimelineKey<number>[],
  t: number,
  lerp: (a: number, b: number, alpha: number) => number = lerpNum,
): number {
  if (!keys.length) return 0;
  if (t <= keys[0].time) return keys[0].value;
  if (t >= keys[keys.length - 1].time) return keys[keys.length - 1].value;
  // Find the bracketing key pair
  for (let i = 1; i < keys.length; i++) {
    if (keys[i].time >= t) {
      const from = keys[i - 1], to = keys[i];
      const dur = to.time - from.time;
      const rawAlpha = dur === 0 ? 1 : (t - from.time) / dur;
      const eased = evalCurve(from.curve, rawAlpha);
      return lerp(from.value, to.value, eased);
    }
  }
  return keys[keys.length - 1].value;
}

/** Sample an XY timeline. */
export function sampleXYTimeline(keys: TimelineKey<XY>[], t: number): XY {
  if (!keys.length) return { x: 0, y: 0 };
  if (t <= keys[0].time) return { ...keys[0].value };
  if (t >= keys[keys.length - 1].time) return { ...keys[keys.length - 1].value };
  for (let i = 1; i < keys.length; i++) {
    if (keys[i].time >= t) {
      const from = keys[i - 1], to = keys[i];
      const dur = to.time - from.time;
      const rawAlpha = dur === 0 ? 1 : (t - from.time) / dur;
      const eased = evalCurve(from.curve, rawAlpha);
      return lerpXY(from.value, to.value, eased);
    }
  }
  return { ...keys[keys.length - 1].value };
}

/**
 * Sample a stepped string/attachment timeline.
 * Returns the value of the latest key whose time ≤ t.
 */
export function sampleSteppedTimeline<T>(keys: TimelineKey<T>[], t: number): T | undefined {
  if (!keys.length) return undefined;
  let result: T = keys[0].value;
  for (const k of keys) {
    if (k.time <= t) result = k.value;
    else break;
  }
  return result;
}

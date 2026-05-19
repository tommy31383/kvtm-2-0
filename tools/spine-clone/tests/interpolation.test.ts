import { describe, it, expect } from 'vitest';
import {
  evalCurve, lerpNum, lerpAngle, sampleNumberTimeline,
  sampleSteppedTimeline, cubicBezierEase,
} from '../src/core/interpolation.js';

describe('evalCurve', () => {
  it('linear returns alpha unchanged', () => {
    expect(evalCurve('linear', 0.3)).toBeCloseTo(0.3);
    expect(evalCurve(undefined, 0.7)).toBeCloseTo(0.7);
  });
  it('stepped returns 0 in middle, clamps at edges', () => {
    expect(evalCurve('stepped', 0)).toBe(0);
    expect(evalCurve('stepped', 0.5)).toBe(0);
    expect(evalCurve('stepped', 1)).toBe(1);
  });
  it('bezier ease-in-out passes through endpoints', () => {
    const c: [number, number, number, number] = [0.42, 0, 0.58, 1];
    expect(evalCurve(c, 0)).toBe(0);
    expect(evalCurve(c, 1)).toBe(1);
  });
  it('bezier ease-in-out is symmetric around 0.5', () => {
    const c: [number, number, number, number] = [0.42, 0, 0.58, 1];
    const left = evalCurve(c, 0.3);
    const right = evalCurve(c, 0.7);
    // Symmetric: f(0.3) + f(0.7) ≈ 1
    expect(left + right).toBeCloseTo(1, 2);
  });
});

describe('cubicBezierEase', () => {
  it('linear bezier returns x', () => {
    expect(cubicBezierEase(0.33, 0.33, 0.66, 0.66, 0.5)).toBeCloseTo(0.5);
  });
});

describe('lerpAngle', () => {
  it('takes shortest path across 180/-180', () => {
    // 170 → -170 should go through 180, not through 0
    expect(lerpAngle(170, -170, 0.5)).toBeCloseTo(180);
  });
  it('linear when no wrap', () => {
    expect(lerpAngle(0, 90, 0.5)).toBeCloseTo(45);
  });
});

describe('sampleNumberTimeline', () => {
  const keys = [
    { time: 0,   value: 0 },
    { time: 1,   value: 10, curve: 'linear' as const },
    { time: 2,   value: 30 },
  ];
  it('returns first value before first key', () => {
    expect(sampleNumberTimeline(keys, -1)).toBe(0);
  });
  it('returns last value after last key', () => {
    expect(sampleNumberTimeline(keys, 99)).toBe(30);
  });
  it('lerps linearly between keys', () => {
    expect(sampleNumberTimeline(keys, 0.5)).toBeCloseTo(5);
    expect(sampleNumberTimeline(keys, 1.5)).toBeCloseTo(20);
  });
});

describe('sampleSteppedTimeline', () => {
  const keys = [
    { time: 0,   value: 'a' },
    { time: 1,   value: 'b' },
    { time: 2,   value: 'c' },
  ];
  it('holds previous value between keys', () => {
    expect(sampleSteppedTimeline(keys, 0.5)).toBe('a');
    expect(sampleSteppedTimeline(keys, 1.999)).toBe('b');
    expect(sampleSteppedTimeline(keys, 2)).toBe('c');
  });
  it('returns first before first key', () => {
    expect(sampleSteppedTimeline(keys, -1)).toBe('a');
  });
});

describe('lerpNum', () => {
  it('endpoints', () => {
    expect(lerpNum(5, 10, 0)).toBe(5);
    expect(lerpNum(5, 10, 1)).toBe(10);
  });
  it('midpoint', () => {
    expect(lerpNum(5, 10, 0.5)).toBe(7.5);
  });
});

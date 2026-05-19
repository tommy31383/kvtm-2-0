import { describe, it, expect, vi } from 'vitest';
import { DocumentStore } from '../src/store/DocumentStore.js';
import { makeEmptySkeleton } from '../src/core/types.js';

function makeStore() {
  const skel = makeEmptySkeleton('test');
  skel.animations = {
    idle: { name: 'idle', duration: 2, bones: {}, slots: {} },
    walk: { name: 'walk', duration: 1, bones: {}, slots: {} },
  };
  return new DocumentStore({
    skeleton: skel,
    atlas: { pages: [] },
  });
}

describe('DocumentStore — initial state', () => {
  it('selection starts as none', () => {
    const s = makeStore();
    expect(s.selection.type).toBe('none');
  });
  it('current animation defaults to undefined (setup pose)', () => {
    const s = makeStore();
    expect(s.currentAnimation).toBeUndefined();
  });
  it('time starts at 0, not playing', () => {
    const s = makeStore();
    expect(s.currentTimeSec).toBe(0);
    expect(s.playing).toBe(false);
  });
});

describe('DocumentStore — selection', () => {
  it('sets bone selection + fires event', () => {
    const s = makeStore();
    const fn = vi.fn();
    s.on('selection-changed', fn);
    s.setSelection({ type: 'bone', name: 'root' });
    expect(s.selection).toEqual({ type: 'bone', name: 'root' });
    expect(fn).toHaveBeenCalledOnce();
  });
  it('no event when selecting same bone twice', () => {
    const s = makeStore();
    s.setSelection({ type: 'bone', name: 'root' });
    const fn = vi.fn();
    s.on('selection-changed', fn);
    s.setSelection({ type: 'bone', name: 'root' });
    expect(fn).not.toHaveBeenCalled();
  });
});

describe('DocumentStore — time', () => {
  it('clamps time to [0, duration] after selecting animation', () => {
    const s = makeStore();
    s.setCurrentAnimation('idle');  // duration 2s
    s.setTime(-5);
    expect(s.currentTimeSec).toBe(0);
    s.setTime(100);
    expect(s.currentTimeSec).toBe(2);  // idle duration
  });
  it('time stays at 0 when no animation (setup pose)', () => {
    const s = makeStore();
    s.setTime(1.5);
    expect(s.currentTimeSec).toBe(0);  // clamped because duration is 0
  });
  it('changing animation resets time to 0', () => {
    const s = makeStore();
    s.setCurrentAnimation('idle');
    s.setTime(1.5);
    expect(s.currentTimeSec).toBe(1.5);
    s.setCurrentAnimation('walk');
    expect(s.currentTimeSec).toBe(0);
  });
});

describe('DocumentStore — bone editing', () => {
  it('setBone updates property + fires event', () => {
    const s = makeStore();
    const fn = vi.fn();
    s.on('bone-changed', fn);
    s.setBone('root', { rotation: 45 });
    expect(s.skeleton.bones[0].rotation).toBe(45);
    expect(fn).toHaveBeenCalledOnce();
  });
  it('setBone throws on unknown bone name', () => {
    const s = makeStore();
    expect(() => s.setBone('nonexistent', { x: 10 })).toThrow();
  });
});

describe('DocumentStore — subscriptions', () => {
  it('returns unsubscribe function', () => {
    const s = makeStore();
    s.setCurrentAnimation('idle');  // so time can advance past 0
    const fn = vi.fn();
    const off = s.on('time-changed', fn);
    s.setTime(0.5);
    expect(fn).toHaveBeenCalledOnce();
    off();
    s.setTime(1);
    expect(fn).toHaveBeenCalledOnce();  // still 1 — unsubbed
  });
  it('errors in listener do not break other listeners', () => {
    const s = makeStore();
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    s.on('selection-changed', () => { throw new Error('boom'); });
    const fn = vi.fn();
    s.on('selection-changed', fn);
    s.setSelection({ type: 'bone', name: 'root' });
    expect(fn).toHaveBeenCalledOnce();
    consoleSpy.mockRestore();
  });
});

describe('DocumentStore — playback', () => {
  it('setPlaying fires event', () => {
    const s = makeStore();
    const fn = vi.fn();
    s.on('playback-state-changed', fn);
    s.setPlaying(true);
    expect(s.playing).toBe(true);
    expect(fn).toHaveBeenCalledOnce();
  });
});

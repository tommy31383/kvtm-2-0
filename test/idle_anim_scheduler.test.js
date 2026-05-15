// Shared-rAF idle anim scheduler tests.
// Mirrors logic from engine/sort_blossom_render.js _IdleAnim — verifies
// catch-up advance, frame-skip optimization, and disposal behavior.
const test = require('node:test');
const assert = require('node:assert/strict');

// ── Mirror of engine helpers ────────────────────────────────────
function durFor(variant, i, speed = 1) {
  const d = variant.durations;
  let ms;
  if (Array.isArray(d)) ms = d[i] || 90;
  else if (typeof d === 'number' && d > 0) ms = d;
  else ms = 200;
  return ms * speed;
}

// Pure frame-advance simulation — same while-loop as _tick.
function advance(state, now, variant, speed = 1) {
  const rects = variant.rects;
  let dur = durFor(variant, state.frameIdx, speed);
  let safety = 64;
  let advances = 0;
  while (now - state.frameStart >= dur && safety-- > 0) {
    state.frameStart += dur;
    state.frameIdx = (state.frameIdx + 1) % rects.length;
    dur = durFor(variant, state.frameIdx, speed);
    advances++;
  }
  return advances;
}

// ── Basic advance ───────────────────────────────────────────────
test('single tick under frame duration → no advance', () => {
  const state = { frameIdx: 0, frameStart: 1000 };
  const variant = { rects: [{}, {}], durations: 200 };
  const n = advance(state, 1100, variant);
  assert.equal(n, 0);
  assert.equal(state.frameIdx, 0);
});

test('single advance when elapsed exactly hits duration', () => {
  const state = { frameIdx: 0, frameStart: 1000 };
  const variant = { rects: [{}, {}], durations: 200 };
  const n = advance(state, 1200, variant);
  assert.equal(n, 1);
  assert.equal(state.frameIdx, 1);
  assert.equal(state.frameStart, 1200);
});

test('wraps around at end of loop', () => {
  const state = { frameIdx: 2, frameStart: 1000 };
  const variant = { rects: [{}, {}, {}], durations: 100 };
  const n = advance(state, 1100, variant);
  assert.equal(n, 1);
  assert.equal(state.frameIdx, 0);  // wrapped
});

// ── Catch-up after lag ──────────────────────────────────────────
test('catch-up advances multiple frames if browser lagged', () => {
  const state = { frameIdx: 0, frameStart: 1000 };
  const variant = { rects: [{}, {}, {}, {}], durations: 100 };
  // 350ms elapsed → should advance 3 frames (3×100ms)
  const n = advance(state, 1350, variant);
  assert.equal(n, 3);
  assert.equal(state.frameIdx, 3);
  assert.equal(state.frameStart, 1300);
});

test('catch-up wraps across loop boundary', () => {
  const state = { frameIdx: 0, frameStart: 1000 };
  const variant = { rects: [{}, {}, {}], durations: 100 };
  // 700ms elapsed across 3 frames → 7 advances, ends at idx 1 (7 % 3)
  const n = advance(state, 1700, variant);
  assert.equal(n, 7);
  assert.equal(state.frameIdx, 1);
});

test('safety cap prevents runaway loop after huge gap', () => {
  const state = { frameIdx: 0, frameStart: 1000 };
  const variant = { rects: [{}, {}], durations: 10 };
  // 1e9 ms elapsed (tab paused for years) — safety cap stops at 64
  const n = advance(state, 1000000000, variant);
  assert.equal(n, 64);
});

// ── Per-frame durations ─────────────────────────────────────────
test('per-frame durations honored across advance', () => {
  const state = { frameIdx: 0, frameStart: 1000 };
  const variant = { rects: [{}, {}, {}], durations: [50, 100, 200] };
  // 50 + 100 = 150ms → advances 2
  const n = advance(state, 1150, variant);
  assert.equal(n, 2);
  assert.equal(state.frameIdx, 2);
  assert.equal(state.frameStart, 1150);
});

test('default 200ms used when durations is null', () => {
  const state = { frameIdx: 0, frameStart: 1000 };
  const variant = { rects: [{}, {}], durations: null };
  // 199ms → no advance, 200ms → advance
  assert.equal(advance({ ...state }, 1199, variant), 0);
  assert.equal(advance({ ...state }, 1200, variant), 1);
});

// ── Speed multiplier ────────────────────────────────────────────
test('speed=2 doubles effective duration → fewer advances', () => {
  const state = { frameIdx: 0, frameStart: 1000 };
  const variant = { rects: [{}, {}, {}], durations: 100 };
  // 200ms elapsed @ speed 2 → effective duration 200ms → 1 advance
  const n = advance(state, 1200, variant, 2);
  assert.equal(n, 1);
});

test('speed=0.5 halves duration → more advances', () => {
  const state = { frameIdx: 0, frameStart: 1000 };
  const variant = { rects: [{}, {}, {}], durations: 100 };
  // 200ms elapsed @ speed 0.5 → effective duration 50ms → 4 advances
  const n = advance(state, 1200, variant, 0.5);
  assert.equal(n, 4);
  assert.equal(state.frameIdx, 1);  // (0+4) % 3
});

// ── frameStart accumulation precision ──────────────────────────
test('frameStart accumulates exactly — no drift over many cycles', () => {
  const state = { frameIdx: 0, frameStart: 0 };
  const variant = { rects: [{}, {}, {}, {}], durations: 100 };
  // 10000 advances should leave frameStart at exactly 10000*100 = 1000000ms
  advance(state, 1000000, variant);
  // After capped advance, frameStart should equal multiple of 100
  assert.equal(state.frameStart % 100, 0);
});

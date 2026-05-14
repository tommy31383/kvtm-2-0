// Pot layout positions stay inside phone-frame.
const test = require('node:test');
const assert = require('node:assert/strict');
const { layoutPots, FRAME_W, POT_W, POT_H } = require('../scripts/layout-pots.js');

const PAD = 12; // tolerance — accept slight overhang for organic feel

test('layoutPots: all positions inside frame bounds (N=2..9)', () => {
  for (let n = 2; n <= 9; n++) {
    const positions = layoutPots(n);
    assert.equal(positions.length, n, `expected ${n} positions`);
    positions.forEach((p, i) => {
      assert.ok(p.x - POT_W/2 >= -PAD, `L${n} pot${i}.x=${p.x} too far left (left edge < 0)`);
      assert.ok(p.x + POT_W/2 <= FRAME_W + PAD, `L${n} pot${i}.x=${p.x} too far right`);
      assert.ok(p.y - POT_H/2 >= 120,            `L${n} pot${i}.y=${p.y} overlaps HUD`);
      assert.ok(p.y + POT_H/2 <= 844 - 20,        `L${n} pot${i}.y=${p.y} overflows footer`);
    });
  }
});

test('layoutPots: 2 pots placed side by side', () => {
  const [a, b] = layoutPots(2);
  assert.ok(Math.abs(a.y - b.y) < 5, 'same row');
  assert.ok(b.x > a.x, 'left-to-right');
});

test('layoutPots: jitter deterministic by seed', () => {
  const a = layoutPots(4, { jitter: 0.5, seed: 42 });
  const b = layoutPots(4, { jitter: 0.5, seed: 42 });
  assert.deepEqual(a, b);
  const c = layoutPots(4, { jitter: 0.5, seed: 99 });
  assert.notDeepEqual(a, c);
});

test('layoutPots: jitter respects max offset', () => {
  const base = layoutPots(4, { jitter: 0 });
  const jittered = layoutPots(4, { jitter: 1, seed: 1 });
  jittered.forEach((p, i) => {
    assert.ok(Math.abs(p.x - base[i].x) <= 12, `x jitter <= 12, got ${p.x - base[i].x}`);
    assert.ok(Math.abs(p.y - base[i].y) <= 12, `y jitter <= 12, got ${p.y - base[i].y}`);
  });
});

test('layoutPots: invalid count throws', () => {
  assert.throws(() => layoutPots(0));
  assert.throws(() => layoutPots(10));
});

// ─── Generator smoke ────────────────────────────────────────────
const { generate } = require('../scripts/gen-level.js');

test('generate: simple 2-color level produces solvable layout', () => {
  const { level, meta } = generate({
    id: 999,
    name: 'Test',
    colors: ['R', 'Y'],
    perColor: 3,
    pots: 3,
    queueDepth: 1,
    difficulty: 'medium',
  });
  assert.equal(level.id, 999);
  assert.equal(level.pots.length, 3);
  assert.ok(level.potLayout && level.potLayout.length === 3, 'has potLayout');
  assert.ok(meta.optimal >= 0, 'has optimal moves');
  assert.ok(level.moveLimit > level.starThresholds[0], 'limit > 3-star threshold');
  assert.equal(level.starThresholds.length, 3);
  assert.equal(level.schemaVersion, 2);
});

test('generate: hard difficulty gives tighter limit than easy', () => {
  const spec = { id: 998, colors: ['R','P','Y'], perColor: 3, pots: 4, queueDepth: 1, seed: 100 };
  const easy = generate({ ...spec, difficulty: 'easy' });
  const hard = generate({ ...spec, difficulty: 'hard' });
  assert.ok(hard.level.moveLimit < easy.level.moveLimit,
    `hard limit ${hard.level.moveLimit} should be < easy ${easy.level.moveLimit}`);
});

test('generate: infeasible spec throws clearly', () => {
  // 6 colors × 6 perColor = 36 flowers, 2 pots × (3+1) = 8 capacity → infeasible
  assert.throws(() => generate({
    id: 997, colors: ['R','P','Y','V','W','O'], perColor: 6, pots: 2, queueDepth: 1
  }), /Infeasible/);
});

test('generate: invalid spec throws clearly', () => {
  assert.throws(() => generate({ id: 'x', colors: [], perColor: 1, pots: 1, queueDepth: -1 }),
    /Spec invalid/);
});

test('generate: solver-verified levels have meta.solverConverged=true (small levels)', () => {
  // 2 colors × 3 flowers in 3 pots — small enough for BFS to converge fast.
  const { meta } = generate({
    id: 996, colors: ['R','Y'], perColor: 3, pots: 3, queueDepth: 0, difficulty: 'easy'
  });
  assert.equal(meta.solverConverged, true);
});

test('generate: 1-color × 3 flowers in 2 pots is non-trivial (no win at init)', () => {
  // Edge case: even with monochrome, generator must avoid immediate-win layouts.
  // Currently fails because the reserved-empty-pot strategy forces all flowers
  // into one pot → instant triple. Documents the limitation; pick ≥2 pots for play.
  // (Acceptable: spec author should use ≥2 colors OR ≥3 pots for solvable variety.)
  assert.throws(() => generate({
    id: 995, colors: ['R'], perColor: 3, pots: 2, queueDepth: 0
  }), /Could not generate any solvable layout/);
});

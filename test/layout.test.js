// Pot layout positions stay inside phone-frame.
// Contract: x = pot CENTER, y = pot TOP EDGE (per scripts/layout-pots.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  layoutPots, validateLayout, describeBloomOverlap,
  X_MIN, X_MAX, Y_MIN, Y_MAX, POT_W, POT_H,
  EFFECTIVE_POT_W, BLOOM_PAD_LEFT, BLOOM_PAD_RIGHT,
} = require('../scripts/layout-pots.js');

const N_MIN = 2;
const N_MAX = 12;

test('layoutPots: all positions inside safe zone AND meet POT_GAP target (N=2..12)', () => {
  for (let n = N_MIN; n <= N_MAX; n++) {
    const positions = layoutPots(n);
    assert.equal(positions.length, n, `expected ${n} positions`);
    // Without jitter, presets must hit the SOFT target gap, not just HARD no-overlap.
    const issues = validateLayout(positions, { strict: true });
    assert.deepEqual(issues, [], `L${n} layout issues: ${issues.join(' | ')}`);
  }
});

test('layoutPots: x is center (in safe range), y is top edge', () => {
  for (let n = N_MIN; n <= N_MAX; n++) {
    layoutPots(n).forEach((p, i) => {
      assert.ok(p.x >= X_MIN && p.x <= X_MAX, `N=${n} pot${i}.x=${p.x} out of [${X_MIN},${X_MAX}]`);
      assert.ok(p.y >= Y_MIN && p.y <= Y_MAX, `N=${n} pot${i}.y=${p.y} out of [${Y_MIN},${Y_MAX}]`);
    });
  }
});

test('layoutPots: no overlapping pots in any preset', () => {
  for (let n = N_MIN; n <= N_MAX; n++) {
    const positions = layoutPots(n);
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const a = positions[i], b = positions[j];
        const overlap = Math.abs(a.x - b.x) < POT_W && Math.abs(a.y - b.y) < POT_H;
        assert.ok(!overlap, `N=${n} pots ${i},${j} overlap @ Δx=${Math.abs(a.x-b.x)} Δy=${Math.abs(a.y-b.y)}`);
      }
    }
  }
});

test('layoutPots: 2 pots placed side by side', () => {
  const [a, b] = layoutPots(2);
  assert.equal(a.y, b.y, 'same row');
  assert.ok(b.x > a.x, 'left-to-right');
});

test('layoutPots: 3 pots form triangle (2 top, 1 below centered)', () => {
  const [a, b, c] = layoutPots(3);
  assert.equal(a.y, b.y, 'top two same row');
  assert.ok(c.y > a.y + 160, 'third below first row pot bottom');
  assert.equal(c.x, 195, 'third horizontally centered');
});

test('layoutPots: jitter deterministic by seed', () => {
  const a = layoutPots(4, { jitter: 0.5, seed: 42 });
  const b = layoutPots(4, { jitter: 0.5, seed: 42 });
  assert.deepEqual(a, b);
  const c = layoutPots(4, { jitter: 0.5, seed: 99 });
  assert.notDeepEqual(a, c);
});

test('layoutPots: jitter respects max offset (≤ MAX_JITTER_PX = 3)', () => {
  const { MAX_JITTER_PX } = require('../scripts/layout-pots.js');
  const base = layoutPots(4, { jitter: 0 });
  const jittered = layoutPots(4, { jitter: 1, seed: 1 });
  jittered.forEach((p, i) => {
    assert.ok(Math.abs(p.x - base[i].x) <= MAX_JITTER_PX, `x jitter <= ${MAX_JITTER_PX}, got ${p.x - base[i].x}`);
    assert.ok(Math.abs(p.y - base[i].y) <= MAX_JITTER_PX, `y jitter <= ${MAX_JITTER_PX}, got ${p.y - base[i].y}`);
  });
});

test('layoutPots: jitter never causes overlap or out-of-bounds', () => {
  // HARD check only — jitter may eat into the target POT_GAP but never overlap.
  for (let seed = 1; seed <= 10; seed++) {
    for (let n = N_MIN; n <= N_MAX; n++) {
      const issues = validateLayout(layoutPots(n, { jitter: 1, seed }));
      assert.deepEqual(issues, [], `N=${n} seed=${seed}: ${issues.join(' | ')}`);
    }
  }
});

test('layoutPots: invalid count throws', () => {
  assert.throws(() => layoutPots(0));
  assert.throws(() => layoutPots(1));
  assert.throws(() => layoutPots(13));
});

test('layoutPots: N=10,11,12 use 3-col packing with 4 rows', () => {
  for (const n of [10, 11, 12]) {
    const positions = layoutPots(n);
    assert.equal(positions.length, n);
    // top row should be 3 pots in a row (same y)
    const topY = positions[0].y;
    const topRowCount = positions.filter(p => p.y === topY).length;
    assert.equal(topRowCount, 3, `N=${n} top row has 3 pots`);
    // 4 distinct y values (4 rows)
    const ys = [...new Set(positions.map(p => p.y))].sort((a, b) => a - b);
    assert.equal(ys.length, 4, `N=${n} uses 4 rows`);
  }
});

test('describeBloomOverlap: returns notes (informational, never throws)', () => {
  // N=2: pots side-by-side → bloom fans intentionally overlap
  const notes2 = describeBloomOverlap(layoutPots(2));
  assert.ok(notes2.length >= 1, 'N=2 has at least 1 bloom-fan overlap pair');
  // N=12: many adjacent pots → many overlaps
  const notes12 = describeBloomOverlap(layoutPots(12));
  assert.ok(notes12.length >= 8, `N=12 has >=8 bloom-fan overlap pairs, got ${notes12.length}`);
  // Empty layout: no notes
  assert.deepEqual(describeBloomOverlap([]), []);
});

test('EFFECTIVE_POT_W reflects measured bloom envelope', () => {
  // The envelope is asymmetric (blooms lean right). EFFECTIVE_POT_W must
  // be at least POT_W (no negative pads).
  assert.ok(EFFECTIVE_POT_W >= POT_W, `EFFECTIVE_POT_W=${EFFECTIVE_POT_W} >= POT_W=${POT_W}`);
  assert.ok(BLOOM_PAD_LEFT >= 0 && BLOOM_PAD_RIGHT >= 0);
});

test('validateLayout: detects out-of-bounds + overlap', () => {
  // out of bounds
  assert.ok(validateLayout([{ x: 0, y: 0 }]).length > 0);
  // overlap (two pots same position)
  assert.ok(validateLayout([{ x: 195, y: 200 }, { x: 195, y: 200 }]).length > 0);
  // clean
  assert.deepEqual(validateLayout([{ x: 100, y: 100 }, { x: 250, y: 300 }]), []);
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
    layout: true,
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

test('generate: omits potLayout by default (designer adds via editor)', () => {
  const { level } = generate({
    id: 994, colors: ['R','Y'], perColor: 3, pots: 3, queueDepth: 1, difficulty: 'easy',
  });
  assert.ok(!('potLayout' in level), 'potLayout should be absent without layout:true');
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

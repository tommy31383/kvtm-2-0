// Multi-variant bloom format migration tests.
// Verifies _resolveVariants() and _pickVariantIdx() behavior — the contract
// between the tool's save format and the engine's runtime consumption.
// Mirrors logic in engine/sort_blossom_render.js.
const test = require('node:test');
const assert = require('node:assert/strict');

// ── Mirror of engine helpers ────────────────────────────────────
function isNewVariantFormat(rectsEntry) {
  return Array.isArray(rectsEntry)
      && rectsEntry.length > 0
      && Array.isArray(rectsEntry[0])
      && Array.isArray(rectsEntry[0][0]);
}

function resolveVariants(rectsEntry, dursEntry) {
  if (!rectsEntry || !rectsEntry.length) return [];
  if (isNewVariantFormat(rectsEntry)) {
    const dursArr = Array.isArray(dursEntry) ? dursEntry : [];
    return rectsEntry.map((vRects, i) => ({
      rects: vRects,
      durations: i < dursArr.length ? dursArr[i] : null,
    }));
  }
  return [{ rects: rectsEntry, durations: dursEntry == null ? null : dursEntry }];
}

function pickVariantIdx(potIdx, posIdx, color, nVariants) {
  if (!nVariants || nVariants <= 1) return 0;
  const colorSalt = color ? (color.charCodeAt(0) % 7) : 0;
  return ((potIdx * 3 + posIdx + colorSalt) % nVariants + nVariants) % nVariants;
}

// ── Format detection ────────────────────────────────────────────
test('isNew: old flat format → false', () => {
  const old = [[44,59,75,114,1,3], [139,58,82,115,0,3]];  // 2 rects
  assert.equal(isNewVariantFormat(old), false);
});

test('isNew: new nested format → true', () => {
  const fresh = [
    [[44,59,75,114], [139,58,82,115]],  // variant 0
    [[50,60,80,120], [140,60,85,118]],  // variant 1
  ];
  assert.equal(isNewVariantFormat(fresh), true);
});

test('isNew: empty array → false', () => {
  assert.equal(isNewVariantFormat([]), false);
});

test('isNew: null/undefined → false', () => {
  assert.equal(isNewVariantFormat(null), false);
  assert.equal(isNewVariantFormat(undefined), false);
});

// ── Resolve variants — old format (back-compat) ─────────────────
test('resolveVariants: old rects + null durs → 1 variant w/ null durs', () => {
  const old = [[44,59,75,114], [139,58,82,115]];
  const r = resolveVariants(old, null);
  assert.equal(r.length, 1);
  assert.deepEqual(r[0].rects, old);
  assert.equal(r[0].durations, null);
});

test('resolveVariants: old rects + scalar durs → 1 variant w/ scalar durs', () => {
  const old = [[44,59,75,114], [139,58,82,115]];
  const r = resolveVariants(old, 87);
  assert.equal(r.length, 1);
  assert.equal(r[0].durations, 87);
});

test('resolveVariants: old rects + array durs → 1 variant w/ array durs', () => {
  const old = [[44,59,75,114], [139,58,82,115]];
  const r = resolveVariants(old, [80, 100]);
  assert.equal(r.length, 1);
  assert.deepEqual(r[0].durations, [80, 100]);
});

// ── Resolve variants — new nested format ────────────────────────
test('resolveVariants: 2 variants + per-variant scalar durs', () => {
  const fresh = [
    [[44,59,75,114], [139,58,82,115]],
    [[50,60,80,120], [140,60,85,118]],
  ];
  const r = resolveVariants(fresh, [87, null]);
  assert.equal(r.length, 2);
  assert.deepEqual(r[0].rects, fresh[0]);
  assert.equal(r[0].durations, 87);
  assert.deepEqual(r[1].rects, fresh[1]);
  assert.equal(r[1].durations, null);
});

test('resolveVariants: 2 variants + missing durs entry → null for missing', () => {
  const fresh = [
    [[44,59,75,114]],
    [[50,60,80,120]],
  ];
  const r = resolveVariants(fresh, [87]);  // only 1 dur for 2 variants
  assert.equal(r.length, 2);
  assert.equal(r[0].durations, 87);
  assert.equal(r[1].durations, null);  // padded
});

test('resolveVariants: 3 variants + per-frame durs in each', () => {
  const fresh = [
    [[44,59,75,114], [139,58,82,115]],
    [[50,60,80,120], [140,60,85,118]],
    [[55,65,85,125], [145,65,90,120]],
  ];
  const durs = [[80, 100], 87, null];
  const r = resolveVariants(fresh, durs);
  assert.equal(r.length, 3);
  assert.deepEqual(r[0].durations, [80, 100]);
  assert.equal(r[1].durations, 87);
  assert.equal(r[2].durations, null);
});

// ── Empty / edge cases ──────────────────────────────────────────
test('resolveVariants: empty rects → empty array', () => {
  assert.deepEqual(resolveVariants([], null), []);
  assert.deepEqual(resolveVariants(null, 87), []);
});

// ── Variant picker determinism ──────────────────────────────────
test('pickVariantIdx: 1 variant → always 0', () => {
  for (let p = 0; p < 10; p++)
    for (let s = 0; s < 3; s++)
      assert.equal(pickVariantIdx(p, s, 'R', 1), 0);
});

test('pickVariantIdx: same (pot,pos,color) → same variant', () => {
  const a = pickVariantIdx(3, 1, 'R', 4);
  const b = pickVariantIdx(3, 1, 'R', 4);
  assert.equal(a, b);
});

test('pickVariantIdx: different pots spread variants', () => {
  // With 4 variants and 10 pots, we should see > 1 distinct variant chosen.
  const set = new Set();
  for (let p = 0; p < 10; p++) set.add(pickVariantIdx(p, 0, 'R', 4));
  assert.ok(set.size > 1, 'expected variant distribution across pots');
});

test('pickVariantIdx: result always in [0, nVariants)', () => {
  for (let p = 0; p < 20; p++)
    for (let s = 0; s < 3; s++)
      for (const c of ['R','P','Y','V','W','O','B','C'])
        for (const n of [1, 2, 3, 5, 7]) {
          const v = pickVariantIdx(p, s, c, n);
          assert.ok(v >= 0 && v < n, `v=${v} not in [0,${n}) for pot=${p} pos=${s} c=${c}`);
        }
});

test('pickVariantIdx: color salt shifts distribution', () => {
  // Different colors at same pot should NOT all collide on variant 0.
  const colors = ['R','P','Y','V','W','O','B','C'];
  const variants = colors.map(c => pickVariantIdx(0, 0, c, 5));
  const distinct = new Set(variants);
  assert.ok(distinct.size >= 3, `expected ≥3 distinct variants, got ${distinct.size}: ${variants}`);
});

// ── Real-data round-trip ────────────────────────────────────────
test('round-trip: existing R data (old format) survives resolveVariants', () => {
  // Snapshot of current _BLOOM_RECTS.R
  const realR = [[44,59,75,114,1,3],[139,58,82,115,0,3],[240,48,88,125,0,-3],[340,53,98,119,0,-4],[470,54,93,119,0,-6],[28,249,92,120,-2,-8],[128,246,100,122,3,-9],[230,246,106,123,3,-9],[340,243,101,125,2,-12],[480,243,97,126,8,-12]];
  const r = resolveVariants(realR, null);
  assert.equal(r.length, 1);
  assert.equal(r[0].rects.length, 10);
  assert.deepEqual(r[0].rects[0], [44,59,75,114,1,3]);
});

test('round-trip: existing P data with scalar dur 87 survives', () => {
  const realP = [[44,62,75,107,-1,1],[141,61,77,108,-1,0]];
  const r = resolveVariants(realP, 87);
  assert.equal(r.length, 1);
  assert.equal(r[0].durations, 87);
});

// ── Role-based variant access (Bloom/Nụ/Bông) ──────────────────
const VARIANT_ROLE = { BLOOM: 0, BUD: 1, FLOWER: 2 };
function pickByRole(cached, role) {
  if (!cached || !cached.variants || !cached.variants.length) return null;
  const v = cached.variants[role];
  if (v && v.rects && v.rects.length) return { ...v, isFallback: false };
  const bloom = cached.variants[VARIANT_ROLE.BLOOM];
  if (!bloom || !bloom.rects || !bloom.rects.length) return null;
  if (role === VARIANT_ROLE.BUD) return { rects: [bloom.rects[0]], durations: null, isFallback: true };
  if (role === VARIANT_ROLE.FLOWER) return { rects: [bloom.rects[bloom.rects.length - 1]], durations: null, isFallback: true };
  return { ...bloom, isFallback: false };
}

test('pickByRole: legacy 1-variant → Nụ falls back to Bloom frame 0', () => {
  const cached = { variants: [{ rects: [[44,59,75,114],[100,100,80,120],[200,200,90,130]], durations: null }] };
  const r = pickByRole(cached, VARIANT_ROLE.BUD);
  assert.equal(r.isFallback, true);
  assert.equal(r.rects.length, 1);
  assert.deepEqual(r.rects[0], [44,59,75,114]);
});

test('pickByRole: legacy 1-variant → Bông falls back to Bloom last frame', () => {
  const cached = { variants: [{ rects: [[44,59,75,114],[100,100,80,120],[200,200,90,130]], durations: null }] };
  const r = pickByRole(cached, VARIANT_ROLE.FLOWER);
  assert.equal(r.isFallback, true);
  assert.equal(r.rects.length, 1);
  assert.deepEqual(r.rects[0], [200,200,90,130]);
});

test('pickByRole: 3-variant data → role variants used directly (no fallback)', () => {
  const cached = { variants: [
    { rects: [[10,10,50,50],[20,20,60,60]], durations: 90 },           // Bloom
    { rects: [[100,100,80,80]], durations: null },                       // Nụ
    { rects: [[200,200,90,90],[210,210,90,90]], durations: 200 },        // Bông
  ]};
  const bud    = pickByRole(cached, VARIANT_ROLE.BUD);
  const flower = pickByRole(cached, VARIANT_ROLE.FLOWER);
  assert.equal(bud.isFallback, false);
  assert.equal(bud.rects.length, 1);
  assert.deepEqual(bud.rects[0], [100,100,80,80]);
  assert.equal(flower.isFallback, false);
  assert.equal(flower.rects.length, 2);
  assert.equal(flower.durations, 200);
});

test('pickByRole: 2-variant data (Bloom+Nụ, no Bông) → Bông falls back to Bloom last', () => {
  const cached = { variants: [
    { rects: [[10,10,50,50],[20,20,60,60],[30,30,70,70]], durations: null },
    { rects: [[100,100,80,80]], durations: null },
  ]};
  const flower = pickByRole(cached, VARIANT_ROLE.FLOWER);
  assert.equal(flower.isFallback, true);
  assert.deepEqual(flower.rects[0], [30,30,70,70]);
});

test('pickByRole: empty cache → null', () => {
  assert.equal(pickByRole(null, VARIANT_ROLE.BUD), null);
  assert.equal(pickByRole({ variants: [] }, VARIANT_ROLE.BUD), null);
});

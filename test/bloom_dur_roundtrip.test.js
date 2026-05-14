// Round-trip test for _BLOOM_DURS save/load contract.
// Verifies the canonical-literal logic so tool ↔ game state stays in sync.
const test = require('node:test');
const assert = require('node:assert/strict');

// Re-implement _canonicalDurLiteral inline (mirrors tools/bloom_test.html)
function canonical(durs) {
  const ds = durs.map(d => Math.round(d || 90));
  if (!ds.length) return 'null';
  const allSame = ds.every(d => d === ds[0]);
  if (allSame) return ds[0] === 90 ? 'null' : String(ds[0]);
  return JSON.stringify(ds);
}

// Re-implement loader's _durFor for an array `durs` parsed from render.js
function durFor(durs, i) {
  if (Array.isArray(durs)) return durs[i] || 90;
  if (typeof durs === 'number' && durs > 0) return durs;
  return 90;
}

test('canonical: all 90 → null', () => {
  assert.equal(canonical([90, 90, 90, 90]), 'null');
});

test('canonical: all 474 → "474" scalar', () => {
  assert.equal(canonical([474, 474, 474, 474]), '474');
});

test('canonical: mixed → array literal', () => {
  assert.equal(canonical([474, 474, 200, 474]), '[474,474,200,474]');
});

test('canonical: empty → null', () => {
  assert.equal(canonical([]), 'null');
});

test('canonical: undefined per-frame coerces to 90', () => {
  assert.equal(canonical([undefined, undefined, undefined]), 'null');
});

test('durFor: null source → 90 default for every i', () => {
  for (let i = 0; i < 10; i++) assert.equal(durFor(null, i), 90);
});

test('durFor: scalar 474 → 474 for every i (legacy uniform)', () => {
  for (let i = 0; i < 10; i++) assert.equal(durFor(474, i), 474);
});

test('durFor: array → per-frame value', () => {
  const arr = [90, 100, 80, 200, 90];
  arr.forEach((v, i) => assert.equal(durFor(arr, i), v));
});

test('durFor: array with 0 falls back to 90 (truthy default)', () => {
  assert.equal(durFor([0, 100], 0), 90);
});

// ─── Round-trip: load → no edit → save produces identical literal ──
test('round-trip: load null → save null', () => {
  const loaded = Array.from({ length: 10 }, (_, i) => durFor(null, i));
  assert.equal(canonical(loaded), 'null');
});

test('round-trip: load scalar 474 → save "474"', () => {
  const loaded = Array.from({ length: 10 }, (_, i) => durFor(474, i));
  assert.equal(canonical(loaded), '474');
});

test('round-trip: load array → save same array', () => {
  const orig = [90, 100, 80, 200, 90, 90, 90, 90, 90, 90];
  const loaded = orig.map((_, i) => durFor(orig, i));
  assert.equal(canonical(loaded), JSON.stringify(orig));
});

// ─── User flow: load scalar, edit one frame, save → array ──
test('user flow: scalar 474 + edit frame 5 to 200 → array literal', () => {
  const loaded = Array.from({ length: 10 }, (_, i) => durFor(474, i));
  loaded[5] = 200;
  assert.equal(canonical(loaded), '[474,474,474,474,474,200,474,474,474,474]');
});

// ─── User flow: load mixed array, normalize all to 90, save → null ──
test('user flow: clear all per-frame edits back to 90 → null', () => {
  const orig = [474, 100, 80];
  const loaded = orig.map((_, i) => durFor(orig, i));
  const normalized = loaded.map(() => 90);
  assert.equal(canonical(normalized), 'null');
});

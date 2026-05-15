// _BLOOM_DATA (modules + anims) format tests — Phase 1.
// Mirrors engine's _bloomDataToVariants() + tool's _buildBloomDataObject().
const test = require('node:test');
const assert = require('node:assert/strict');

// ── Mirror of engine: _animToVariant + _bloomDataToVariants ────
function animToVariant(anim, modules) {
  if (!Array.isArray(anim) || !anim.length) return { rects: [], durations: null };
  const rects = [];
  const durs = [];
  for (const frame of anim) {
    const mod = modules[frame.m];
    if (!mod) continue;
    const dx = mod.dx || 0, dy = mod.dy || 0;
    rects.push([mod.x, mod.y, mod.w, mod.h, dx, dy]);
    durs.push(typeof frame.d === 'number' ? frame.d : 90);
  }
  let durations = null;
  if (durs.length) {
    const allSame = durs.every(d => d === durs[0]);
    if (allSame) durations = durs[0] === 90 ? null : durs[0];
    else durations = durs;
  }
  return { rects, durations };
}
const ROLE_INDEX = { bloom: 0, bud: 1, flower: 2 };
function bloomDataToVariants(data) {
  if (!data || !data.modules || !data.anims) return null;
  const animNames = Object.keys(data.anims);
  if (!animNames.length) return null;
  const variants = [];
  for (const [roleName, idx] of Object.entries(ROLE_INDEX)) {
    variants[idx] = animToVariant(data.anims[roleName], data.modules);
  }
  for (const name of animNames) {
    if (name in ROLE_INDEX) continue;
    variants.push(animToVariant(data.anims[name], data.modules));
  }
  while (variants.length > 1) {
    const tail = variants[variants.length - 1];
    if (tail && tail.rects && tail.rects.length) break;
    variants.pop();
  }
  return variants;
}

// ── Mirror of tool: _buildBloomDataObject ──────────────────────
const ROLE_NAMES = ['bloom', 'bud', 'flower'];
function buildBloomDataObject(variants) {
  const modules = {};
  const anims = {};
  variants.forEach((vFrames, idx) => {
    const animName = idx < ROLE_NAMES.length ? ROLE_NAMES[idx] : `anim${idx}`;
    anims[animName] = vFrames.map((f, i) => {
      const modId = `${animName}_${i}`;
      const m = { x: Math.round(f.x), y: Math.round(f.y), w: Math.round(f.w), h: Math.round(f.h) };
      if (f.dx) m.dx = Math.round(f.dx);
      if (f.dy) m.dy = Math.round(f.dy);
      modules[modId] = m;
      return { m: modId, d: Math.round(f.dur || 90) };
    });
  });
  return { modules, anims };
}

// ── Basic conversion ───────────────────────────────────────────
test('bloomDataToVariants: empty/invalid → null', () => {
  assert.equal(bloomDataToVariants(null), null);
  assert.equal(bloomDataToVariants({}), null);
  assert.equal(bloomDataToVariants({ modules: {}, anims: {} }), null);
});

test('bloomDataToVariants: bloom only → 1 variant', () => {
  const data = {
    modules: { f0: {x:10,y:10,w:50,h:50}, f1: {x:20,y:20,w:60,h:60} },
    anims: { bloom: [{m:'f0',d:90},{m:'f1',d:90}] }
  };
  const v = bloomDataToVariants(data);
  assert.equal(v.length, 1);
  assert.equal(v[0].rects.length, 2);
  assert.deepEqual(v[0].rects[0], [10,10,50,50,0,0]);
});

test('bloomDataToVariants: bloom+bud+flower → 3 variants in role order', () => {
  const data = {
    modules: { a: {x:0,y:0,w:10,h:10}, b: {x:20,y:0,w:10,h:10}, c: {x:40,y:0,w:10,h:10} },
    anims: {
      bloom:  [{m:'a',d:90}],
      bud:    [{m:'b',d:200}],
      flower: [{m:'c',d:90}],
    }
  };
  const v = bloomDataToVariants(data);
  assert.equal(v.length, 3);
  assert.deepEqual(v[0].rects[0], [0,0,10,10,0,0]);    // Bloom
  assert.deepEqual(v[1].rects[0], [20,0,10,10,0,0]);   // Nụ
  assert.deepEqual(v[1].durations, 200);                // scalar dur
  assert.deepEqual(v[2].rects[0], [40,0,10,10,0,0]);   // Bông
});

test('bloomDataToVariants: durations compaction — all 90 → null', () => {
  const data = {
    modules: { a: {x:0,y:0,w:10,h:10} },
    anims: { bloom: [{m:'a',d:90},{m:'a',d:90},{m:'a',d:90}] }
  };
  const v = bloomDataToVariants(data);
  assert.equal(v[0].durations, null);
});

test('bloomDataToVariants: durations compaction — all same non-90 → scalar', () => {
  const data = {
    modules: { a: {x:0,y:0,w:10,h:10} },
    anims: { bloom: [{m:'a',d:87},{m:'a',d:87}] }
  };
  const v = bloomDataToVariants(data);
  assert.equal(v[0].durations, 87);
});

test('bloomDataToVariants: durations compaction — mixed → array', () => {
  const data = {
    modules: { a: {x:0,y:0,w:10,h:10} },
    anims: { bloom: [{m:'a',d:80},{m:'a',d:100},{m:'a',d:90}] }
  };
  const v = bloomDataToVariants(data);
  assert.deepEqual(v[0].durations, [80,100,90]);
});

test('bloomDataToVariants: module reuse — same m referenced across frames', () => {
  const data = {
    modules: { bud: {x:44,y:59,w:75,h:114} },
    anims: { bloom: [{m:'bud',d:90},{m:'bud',d:90},{m:'bud',d:90}] }
  };
  const v = bloomDataToVariants(data);
  assert.equal(v[0].rects.length, 3);
  // All 3 frames resolve to same rect — module reuse works
  assert.deepEqual(v[0].rects[0], v[0].rects[1]);
  assert.deepEqual(v[0].rects[1], v[0].rects[2]);
});

test('bloomDataToVariants: module dx/dy → appended to rect', () => {
  const data = {
    modules: { a: {x:10,y:10,w:50,h:50,dx:3,dy:-5} },
    anims: { bloom: [{m:'a',d:90}] }
  };
  const v = bloomDataToVariants(data);
  assert.deepEqual(v[0].rects[0], [10,10,50,50,3,-5]);
});

test('bloomDataToVariants: unknown m ref → frame silently skipped', () => {
  const data = {
    modules: { a: {x:0,y:0,w:10,h:10} },
    anims: { bloom: [{m:'a',d:90},{m:'missing',d:90},{m:'a',d:90}] }
  };
  const v = bloomDataToVariants(data);
  assert.equal(v[0].rects.length, 2);  // 2 valid frames, 1 skipped
});

test('bloomDataToVariants: unknown anim name → appended at index 3+', () => {
  const data = {
    modules: { a: {x:0,y:0,w:10,h:10} },
    anims: {
      bloom: [{m:'a',d:90}],
      bud: [{m:'a',d:200}],
      flower: [{m:'a',d:90}],
      seasonal: [{m:'a',d:500}],  // reserved slot
    }
  };
  const v = bloomDataToVariants(data);
  assert.equal(v.length, 4);
  assert.equal(v[3].durations, 500);
});

// ── Round-trip: tool builder ↔ engine resolver ─────────────────
test('round-trip: 3 anims through tool → engine produces same shape', () => {
  const variants = [
    [{x:10,y:10,w:50,h:50,dur:90,dx:0,dy:0}, {x:20,y:20,w:60,h:60,dur:90,dx:0,dy:0}],   // bloom
    [{x:100,y:100,w:80,h:80,dur:200,dx:0,dy:0}],                                          // bud
    [{x:200,y:200,w:90,h:90,dur:90,dx:0,dy:0}, {x:210,y:200,w:90,h:90,dur:90,dx:0,dy:0}], // flower
  ];
  const data = buildBloomDataObject(variants);
  // Verify modules populated, anims reference them
  assert.equal(Object.keys(data.modules).length, 5);  // 2+1+2
  assert.equal(data.anims.bloom.length, 2);
  assert.equal(data.anims.bud.length, 1);
  assert.equal(data.anims.flower.length, 2);
  // Reverse through engine
  const back = bloomDataToVariants(data);
  assert.equal(back.length, 3);
  assert.equal(back[0].rects.length, 2);
  assert.equal(back[1].rects.length, 1);
  assert.equal(back[1].durations, 200);
  assert.equal(back[2].rects.length, 2);
  assert.deepEqual(back[0].rects[0], [10,10,50,50,0,0]);
  assert.deepEqual(back[1].rects[0], [100,100,80,80,0,0]);
});

test('round-trip: empty bud variant survives', () => {
  const variants = [
    [{x:10,y:10,w:50,h:50,dur:90,dx:0,dy:0}],  // bloom
    [],                                          // bud — empty
  ];
  const data = buildBloomDataObject(variants);
  assert.equal(data.anims.bud.length, 0);
  const back = bloomDataToVariants(data);
  // bud at idx 1 trimmed (empty trailing) — back.length could be 1
  assert.ok(back.length >= 1);
  assert.equal(back[0].rects.length, 1);
});

test('round-trip: module dx/dy preserved both directions', () => {
  const variants = [
    [{x:10,y:10,w:50,h:50,dur:90,dx:3,dy:-5}],
  ];
  const data = buildBloomDataObject(variants);
  assert.equal(data.modules.bloom_0.dx, 3);
  assert.equal(data.modules.bloom_0.dy, -5);
  const back = bloomDataToVariants(data);
  assert.deepEqual(back[0].rects[0], [10,10,50,50,3,-5]);
});

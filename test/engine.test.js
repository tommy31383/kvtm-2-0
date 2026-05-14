// Unit tests for engine/sort_blossom_engine.js
// Run: node --test test/  (Node 18+)
//
// The engine is a pure-logic module with no DOM. It exports via either
// CommonJS or a global; we require it as CJS here.

const test = require('node:test');
const assert = require('node:assert/strict');
const Engine = require('../engine/sort_blossom_engine.js');

const { emptyPot, clone, applyMove, applyMovePlace, settle, promote,
        initState, isWon, isDeadlock, hasPendingVanish, canMove,
        starsFor, validate, countColors, bfsSolve, findHint,
        pickPosFromX, encode } = Engine;

// ─── helpers ────────────────────────────────────────────────────
const pot = (active = [null, null, null], queue = []) => ({ active: [...active], queue: [...queue] });

// ─── pickPosFromX ───────────────────────────────────────────────
test('pickPosFromX: left third → 0', () => {
  assert.equal(pickPosFromX(10, 100), 0);
  assert.equal(pickPosFromX(33, 100), 0);
});
test('pickPosFromX: middle third → 1', () => {
  assert.equal(pickPosFromX(50, 100), 1);
  assert.equal(pickPosFromX(35, 100), 1);
  assert.equal(pickPosFromX(65, 100), 1);
});
test('pickPosFromX: right third → 2', () => {
  assert.equal(pickPosFromX(67, 100), 2);
  assert.equal(pickPosFromX(99, 100), 2);
});

// ─── canMove ────────────────────────────────────────────────────
test('canMove: same pot → false', () => {
  const s = [pot(['R', null, null])];
  assert.equal(canMove(s, 0, 0, 0, 1), false);
});
test('canMove: source empty → false', () => {
  const s = [pot([null, null, null]), pot([null, null, null])];
  assert.equal(canMove(s, 0, 0, 1, 0), false);
});
test('canMove: dest occupied → false', () => {
  const s = [pot(['R', null, null]), pot(['Y', null, null])];
  assert.equal(canMove(s, 0, 0, 1, 0), false);
});
test('canMove: valid move → true', () => {
  const s = [pot(['R', null, null]), pot([null, null, null])];
  assert.equal(canMove(s, 0, 0, 1, 1), true);
});

// ─── applyMove + settle (vanish-3) ──────────────────────────────
test('applyMove triggers vanish when third matching flower placed', () => {
  const s = [pot(['R', 'R', null]), pot(['R', null, null])];
  const r = applyMove(s, 1, 0, 0, 2);
  assert.equal(r.ok, true);
  assert.ok(r.vanished.length > 0);
  assert.deepEqual(s[0].active, [null, null, null]);
  assert.deepEqual(s[1].active, [null, null, null]);
});

test('applyMove does NOT vanish when no triple completes', () => {
  const s = [pot(['R', 'Y', null]), pot(['R', null, null])];
  const r = applyMove(s, 1, 0, 0, 2);
  assert.equal(r.ok, true);
  assert.equal(r.vanished.length, 0);
  assert.deepEqual(s[0].active, ['R', 'Y', 'R']);
});

test('applyMovePlace does NOT auto-settle (for animation pacing)', () => {
  const s = [pot(['R', 'R', null]), pot(['R', null, null])];
  const r = applyMovePlace(s, 1, 0, 0, 2);
  assert.equal(r.ok, true);
  assert.equal(r.willVanish, true);
  // Triple is staged but NOT vanished yet — caller animates land then calls settle()
  assert.deepEqual(s[0].active, ['R', 'R', 'R']);
});

// ─── promotion ──────────────────────────────────────────────────
test('promote: shifts queue head into empty active', () => {
  const p = pot([null, null, null], ['R', 'Y', 'B', 'V']);
  promote(p);
  assert.deepEqual(p.active, ['R', 'Y', 'B']);
  assert.deepEqual(p.queue, ['V']);
});

test('promote: no-op when any active occupied', () => {
  const p = pot(['R', null, null], ['Y', 'B']);
  promote(p);
  assert.deepEqual(p.active, ['R', null, null]);
  assert.deepEqual(p.queue, ['Y', 'B']);
});

test('promote: fills only what queue has', () => {
  const p = pot([null, null, null], ['R']);
  promote(p);
  assert.deepEqual(p.active, ['R', null, null]);
  assert.deepEqual(p.queue, []);
});

test('settle: cascades vanish → promote → vanish', () => {
  // Active triple vanishes, queue promotes 3 more, those happen to be triple too.
  const s = [pot(['R', 'R', 'R'], ['Y', 'Y', 'Y'])];
  const r = settle(s);
  assert.deepEqual(r.vanished, [0, 0]);    // vanished twice
  assert.deepEqual(r.promoted, [0]);        // promoted between vanishes
  assert.deepEqual(s[0].active, [null, null, null]);
  assert.deepEqual(s[0].queue, []);
});

// ─── isWon / isDeadlock ────────────────────────────────────────
test('isWon: all pots empty (active+queue) → true', () => {
  assert.equal(isWon([emptyPot(), emptyPot()]), true);
});
test('isWon: any flower remaining → false', () => {
  assert.equal(isWon([emptyPot(), pot(['R', null, null])]), false);
  assert.equal(isWon([pot([null, null, null], ['R'])]), false);
});
test('isDeadlock: no valid moves → true', () => {
  // All pots full of different colors; nothing to do.
  const s = [pot(['R', 'Y', 'B']), pot(['V', 'W', 'O'])];
  assert.equal(isDeadlock(s), true);
});
test('isDeadlock: has empty slot → false (movable)', () => {
  const s = [pot(['R', 'Y', null]), pot(['B', 'V', 'W'])];
  assert.equal(isDeadlock(s), false);
});

// ─── hasPendingVanish ──────────────────────────────────────────
test('hasPendingVanish: detects un-settled triple', () => {
  const s = [pot(['R', 'R', 'R'])];
  assert.equal(hasPendingVanish(s), true);
});
test('hasPendingVanish: false when no triple', () => {
  const s = [pot(['R', 'R', 'Y'])];
  assert.equal(hasPendingVanish(s), false);
});

// ─── initState ─────────────────────────────────────────────────
test('initState: promotes empty actives from queue on load', () => {
  const lvl = [pot([null, null, null], ['R', 'Y', 'B', 'V'])];
  const s = initState(lvl);
  assert.deepEqual(s[0].active, ['R', 'Y', 'B']);
  assert.deepEqual(s[0].queue, ['V']);
});

test('initState: settles immediate matches from level data', () => {
  // Level author wrote a pot already at triple — should resolve at load.
  const lvl = [pot(['R', 'R', 'R'])];
  const s = initState(lvl);
  assert.deepEqual(s[0].active, [null, null, null]);
});

// ─── starsFor ──────────────────────────────────────────────────
test('starsFor: thresholds applied in order', () => {
  const th = [5, 8, 12];  // ≤5 → 3, ≤8 → 2, ≤12 → 1, else 0
  assert.equal(starsFor(3, th), 3);
  assert.equal(starsFor(5, th), 3);
  assert.equal(starsFor(7, th), 2);
  assert.equal(starsFor(11, th), 1);
  assert.equal(starsFor(13, th), 0);
});

// ─── validate ──────────────────────────────────────────────────
test('validate: color counts must be multiples of 3', () => {
  const lvl = { pots: [pot(['R', 'R', null]), pot(['R', null, null])] };
  // 3 reds total — valid count-wise
  // Will also need to be solvable; with these positions it might end won.
  // Add 6 yellows to ensure non-trivial level
  lvl.pots.push(pot(['Y', 'Y', 'Y']));
  lvl.pots.push(pot(['Y', 'Y', 'Y']));
  const errs = validate(lvl);
  // Either 0 errors or at most "starts won"; we only care no count-error here
  assert.equal(errs.some(e => e.includes('multiple of 3')), false);
});

test('validate: bad color count caught', () => {
  const lvl = { pots: [pot(['R', null, null])] };  // 1 red — not multiple of 3
  const errs = validate(lvl);
  assert.ok(errs.some(e => e.includes('multiple of 3')));
});

test('validate: missing pots array', () => {
  assert.deepEqual(validate({}), ['Missing pots[]']);
  assert.deepEqual(validate(null), ['Missing pots[]']);
});

// ─── encode ────────────────────────────────────────────────────
test('encode: same state → same key', () => {
  const s1 = [pot(['R', null, 'Y'], ['B'])];
  const s2 = [pot(['R', null, 'Y'], ['B'])];
  assert.equal(encode(s1), encode(s2));
});
test('encode: different state → different key', () => {
  const s1 = [pot(['R', null, 'Y'])];
  const s2 = [pot(['Y', null, 'R'])];
  assert.notEqual(encode(s1), encode(s2));
});

// ─── findHint ──────────────────────────────────────────────────
test('findHint: returns first valid move', () => {
  const s = [pot(['R', null, null]), pot([null, null, null])];
  const h = findHint(s);
  assert.ok(h);
  assert.equal(h.fromPot, 0);
  assert.equal(h.fromPos, 0);
});
test('findHint: returns null when locked', () => {
  const s = [pot(['R', 'Y', 'B']), pot(['V', 'W', 'O'])];
  assert.equal(findHint(s), null);
});

// ─── bfsSolve ──────────────────────────────────────────────────
test('bfsSolve: trivially won state returns 0 moves', () => {
  const r = bfsSolve([emptyPot(), emptyPot()]);
  assert.equal(r.moves, 0);
  assert.equal(r.solvable, true);
});

test('bfsSolve: 1-move win (move third matching flower to complete triple)', () => {
  // Pot 0 has R,R; pot 1 has R alone. Move pot1's R into pot0 → triple vanish → won.
  const pots = [pot(['R', 'R', null]), pot(['R', null, null])];
  const r = bfsSolve(pots);
  assert.equal(r.solvable, true);
  assert.equal(r.moves, 1);
});

test('bfsSolve: unsolvable → solvable false', () => {
  // Deadlock from the start: every pot full, no matching colors
  const pots = [pot(['R', 'Y', 'B']), pot(['V', 'W', 'O'])];
  const r = bfsSolve(pots);
  assert.equal(r.solvable, false);
});

test('bfsSolve: respects maxStates cap', () => {
  // Construct a moderately big state — cap at very small N to force timeout
  const pots = [
    pot(['R', 'Y', 'B'], ['Y', 'R', 'B']),
    pot([null, null, null], ['R', 'Y', 'B']),
    pot([null, null, null]),
  ];
  const r = bfsSolve(pots, 5);
  // Either solved within cap (unlikely with cap=5) or timed out
  assert.ok(r.timeout === true || r.solvable === true);
});

// ─── countColors ───────────────────────────────────────────────
test('countColors: sums active + queue across all pots', () => {
  const s = [pot(['R', 'R', null], ['Y']), pot(['R', null, null], ['Y', 'B'])];
  const c = countColors(s);
  assert.equal(c.R, 3);
  assert.equal(c.Y, 2);
  assert.equal(c.B, 1);
});

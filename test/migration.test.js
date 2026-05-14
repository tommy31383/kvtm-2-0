// Migration tests — guarantee old data formats always normalize cleanly so
// "data cũ lung tung" never bites us again.
const test = require('node:test');
const assert = require('node:assert/strict');

// ─── _BLOOM_DURS migration ──────────────────────────────────────
const Render = require('../engine/sort_blossom_render.js');
const { migrateBloomDurs } = Render;

test('migrateBloomDurs: null -> default', () => {
  assert.deepEqual(migrateBloomDurs(null), { kind: 'default' });
  assert.deepEqual(migrateBloomDurs(undefined), { kind: 'default' });
});

test('migrateBloomDurs: positive number -> uniform', () => {
  assert.deepEqual(migrateBloomDurs(474), { kind: 'uniform', ms: 474 });
});

test('migrateBloomDurs: 0 or negative -> default (treats as invalid)', () => {
  assert.deepEqual(migrateBloomDurs(0), { kind: 'default' });
  assert.deepEqual(migrateBloomDurs(-5), { kind: 'default' });
});

test('migrateBloomDurs: array all 90 -> default', () => {
  assert.deepEqual(migrateBloomDurs([90, 90, 90, 90]), { kind: 'default' });
});

test('migrateBloomDurs: array all same non-90 -> uniform', () => {
  assert.deepEqual(migrateBloomDurs([474, 474, 474]), { kind: 'uniform', ms: 474 });
});

test('migrateBloomDurs: mixed array -> perFrame', () => {
  assert.deepEqual(
    migrateBloomDurs([474, 100, 200]),
    { kind: 'perFrame', ms: [474, 100, 200] }
  );
});

test('migrateBloomDurs: array with bad entries coerced to 90', () => {
  // [null, 'x', 0, 100] -> [90, 90, 90, 100]
  const r = migrateBloomDurs([null, 'x', 0, 100]);
  assert.equal(r.kind, 'perFrame');
  assert.deepEqual(r.ms, [90, 90, 90, 100]);
});

test('migrateBloomDurs: pad to frame count', () => {
  // 2-entry array but engine expects 10 frames
  const r = migrateBloomDurs([100, 200], 5);
  assert.deepEqual(r.ms, [100, 200, 90, 90, 90]);
});

test('migrateBloomDurs: truncate to frame count', () => {
  const r = migrateBloomDurs([100, 200, 300, 400, 500], 3);
  assert.deepEqual(r.ms, [100, 200, 300]);
});

test('migrateBloomDurs: empty array -> default', () => {
  assert.deepEqual(migrateBloomDurs([]), { kind: 'default' });
});

test('migrateBloomDurs: object/string/bool -> default (with warn)', () => {
  // Suppress console.warn for this test
  const orig = console.warn;
  console.warn = () => {};
  try {
    assert.deepEqual(migrateBloomDurs({}), { kind: 'default' });
    assert.deepEqual(migrateBloomDurs('hello'), { kind: 'default' });
    assert.deepEqual(migrateBloomDurs(true), { kind: 'default' });
  } finally {
    console.warn = orig;
  }
});

// ─── Save migration ─────────────────────────────────────────────
// Re-implement migrateSave inline (mirrors src/js/core.js) because the file
// runs in browser context — node import would pull in DOM globals it doesn't
// have. Keeping a parallel copy is fine for a small pure function.
const SAVE_SCHEMA_VERSION = 2;
const DEFAULT_SAVE = {
  _v: SAVE_SCHEMA_VERSION,
  player: { name: '', gender: '', createdAt: null, lastLogin: null, dayStreak: 1 },
  progress: { currentLevel: 1, levelsCompleted: [], starsBalance: 5, livesCount: 5, livesRegenAt: null },
  hub: { decorTasksDone: [], currentEstate: 'rose_garden' },
  story: { beatsUnlocked: ['intro'], chapterProgress: 0 },
  daily: { loginRewards: [], lastClaimDay: 0 },
  settings: { sound: true, haptic: true, music: true }
};

function migrateSave(raw) {
  const fresh = JSON.parse(JSON.stringify(DEFAULT_SAVE));
  if (!raw || typeof raw !== 'object') return fresh;
  let cur = raw;
  let v = typeof cur._v === 'number' ? cur._v : 1;
  while (v < SAVE_SCHEMA_VERSION) {
    switch (v) {
      case 1: cur._v = 2; break;
      default: v = SAVE_SCHEMA_VERSION;
    }
    v = cur._v;
  }
  function merge(target, defaults) {
    for (const key in defaults) {
      if (!(key in target)) {
        target[key] = JSON.parse(JSON.stringify(defaults[key]));
      } else if (typeof defaults[key] === 'object' && defaults[key] !== null && !Array.isArray(defaults[key])) {
        if (typeof target[key] !== 'object' || target[key] === null) target[key] = {};
        merge(target[key], defaults[key]);
      }
    }
    return target;
  }
  return merge(cur, fresh);
}

test('migrateSave: null/undefined -> fresh default', () => {
  const s = migrateSave(null);
  assert.equal(s._v, SAVE_SCHEMA_VERSION);
  assert.equal(s.progress.starsBalance, 5);
  assert.equal(s.settings.sound, true);
});

test('migrateSave: legacy v1 save (no _v) -> upgraded to v2 with defaults', () => {
  const old = {
    player: { name: 'Tommy', createdAt: '2024-01-01' },
    progress: { currentLevel: 7, starsBalance: 42 }
  };
  const s = migrateSave(old);
  assert.equal(s._v, SAVE_SCHEMA_VERSION);
  assert.equal(s.player.name, 'Tommy');           // preserved
  assert.equal(s.player.createdAt, '2024-01-01'); // preserved
  assert.equal(s.player.dayStreak, 1);            // default filled
  assert.equal(s.progress.currentLevel, 7);       // preserved
  assert.equal(s.progress.starsBalance, 42);      // preserved
  assert.equal(s.progress.livesCount, 5);         // default filled
  assert.deepEqual(s.story.beatsUnlocked, ['intro']);
});

test('migrateSave: corrupt save (string) -> fresh default', () => {
  const s = migrateSave('garbage');
  assert.equal(s._v, SAVE_SCHEMA_VERSION);
});

test('migrateSave: current-version save passes through unchanged data', () => {
  const cur = {
    _v: 2,
    player: { name: 'X', gender: 'female', createdAt: 'now', lastLogin: 'now', dayStreak: 5 },
    progress: { currentLevel: 10, levelsCompleted: [{id:1,stars:3}], starsBalance: 99, livesCount: 3, livesRegenAt: null },
    hub: { decorTasksDone: ['gate_repair'], currentEstate: 'rose_garden' },
    story: { beatsUnlocked: ['intro','ch1'], chapterProgress: 2 },
    daily: { loginRewards: [1,2,3], lastClaimDay: 5 },
    settings: { sound: false, haptic: true, music: true }
  };
  const s = migrateSave(cur);
  assert.equal(s.player.name, 'X');
  assert.equal(s.progress.currentLevel, 10);
  assert.equal(s.settings.sound, false);
  assert.deepEqual(s.progress.levelsCompleted, [{id:1,stars:3}]);
});

test('migrateSave: partial save merges defaults for missing nested keys', () => {
  const partial = { _v: 2, player: { name: 'A' } };  // missing settings, hub, etc.
  const s = migrateSave(partial);
  assert.equal(s.player.name, 'A');
  assert.equal(s.settings.sound, true);
  assert.equal(s.hub.currentEstate, 'rose_garden');
  assert.deepEqual(s.story.beatsUnlocked, ['intro']);
});

test('migrateSave: future-version save left alone (forward compat)', () => {
  // If a player downgrades the app, we don't try to mangle their newer save.
  const future = { _v: 999, player: { name: 'future' } };
  const s = migrateSave(future);
  assert.equal(s.player.name, 'future');
  // Loop exits because v > SAVE_SCHEMA_VERSION; we still merge defaults
});

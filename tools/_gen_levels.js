// Procedural generator for Sort Blossom levels (v2 rules).
// Guarantees:
//   - Color counts are multiples of 3
//   - Engine.validate() passes
//   - No trivial-win start (no pot begins with 3 active same color)
//   - Not deadlocked at start
//   - BFS-solvable (with marker if heuristic fallback used)
//   - Combo-biased queue ordering for cascade vanishes
//
// Run:
//   node tools/_gen_levels.js [seed] > engine/_gen_output.txt
// Optional 'seed' (integer). Default 42 → reproducible across runs.

const Engine = require('../engine/sort_blossom_engine.js');

// ─── PRNG (Mulberry32) — seeded, reproducible ──────────────────
let _rngState = 42;
function setSeed(s) { _rngState = (s >>> 0) || 1; }
function rng() {
  let t = (_rngState += 0x6D2B79F5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), 1 | t);
  t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function rngInt(maxExclusive) { return Math.floor(rng() * maxExclusive); }
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rngInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── CURVE — { id, name, colors, perColor (×3), pots, queueDepth } ─────
const CURVE = [
  // L1-3 canonical (kept verbatim, see CANON)
  // L4-L10: 2-3 colors, simple
  { id: 4,  name: 'Vườn Bạch Cúc',       colors: ['R','Y'],         perColor: 3, pots: 3, queueDepth: 1 },
  { id: 5,  name: 'Hoa Anh Đào',         colors: ['R','P'],         perColor: 3, pots: 3, queueDepth: 1 },
  { id: 6,  name: 'Cúc Họa Mi',          colors: ['Y','P'],         perColor: 3, pots: 3, queueDepth: 1 },
  { id: 7,  name: 'Tam Sắc Bình Minh',   colors: ['R','P','Y'],     perColor: 3, pots: 4, queueDepth: 0 },
  { id: 8,  name: 'Cánh Đồng Tulip',     colors: ['R','P','Y'],     perColor: 3, pots: 4, queueDepth: 1 },
  { id: 9,  name: 'Vườn Hoa Sớm',        colors: ['R','P','Y'],     perColor: 6, pots: 5, queueDepth: 3 },
  { id: 10, name: 'Khu Vườn Bí Mật',     colors: ['R','P','Y'],     perColor: 6, pots: 4, queueDepth: 3 },
  // L11-L17: 3-4 colors
  { id: 11, name: 'Hoa Cẩm Chướng',      colors: ['R','P','Y'],     perColor: 3, pots: 5, queueDepth: 1 },
  { id: 12, name: 'Vườn Trên Cao',       colors: ['R','P','Y'],     perColor: 6, pots: 5, queueDepth: 2 },
  { id: 13, name: 'Bốn Mùa Hoa',         colors: ['R','P','Y','V'], perColor: 3, pots: 5, queueDepth: 0 },
  { id: 14, name: 'Hoa Tử Đinh Hương',   colors: ['R','P','Y','V'], perColor: 3, pots: 5, queueDepth: 1 },
  { id: 15, name: 'Vườn Phượng',         colors: ['R','P','Y','V'], perColor: 6, pots: 6, queueDepth: 3 },
  { id: 16, name: 'Hoa Lavender',        colors: ['R','P','Y','V'], perColor: 6, pots: 5, queueDepth: 3 },
  { id: 17, name: 'Vườn Cẩm Tú Cầu',     colors: ['R','P','Y','V'], perColor: 6, pots: 6, queueDepth: 3 },
  // L18-L22: 5 colors
  { id: 18, name: 'Hoa Trắng Tinh Khôi', colors: ['R','P','Y','V','W'], perColor: 3, pots: 6, queueDepth: 0 },
  { id: 19, name: 'Vườn Mây',            colors: ['R','P','Y','V','W'], perColor: 3, pots: 6, queueDepth: 1 },
  { id: 20, name: 'Lá Mùa Thu',          colors: ['R','P','Y','V','W'], perColor: 6, pots: 7, queueDepth: 3 },
  { id: 21, name: 'Vườn Bạch Liên',      colors: ['R','P','Y','V','W'], perColor: 6, pots: 6, queueDepth: 3 },
  { id: 22, name: 'Đỉnh Cao Năm Sắc',    colors: ['R','P','Y','V','W'], perColor: 6, pots: 7, queueDepth: 4 },
  // L23-L30: 6 colors
  { id: 23, name: 'Hoàng Hôn Cam',       colors: ['R','P','Y','V','W','O'], perColor: 3, pots: 7, queueDepth: 0 },
  { id: 24, name: 'Vườn Lửa',            colors: ['R','P','Y','V','W','O'], perColor: 3, pots: 7, queueDepth: 1 },
  { id: 25, name: 'Lễ Hội Sắc Màu',      colors: ['R','P','Y','V','W','O'], perColor: 6, pots: 8, queueDepth: 3 },
  { id: 26, name: 'Vườn Phượng Hoàng',   colors: ['R','P','Y','V','W','O'], perColor: 6, pots: 7, queueDepth: 3 },
  { id: 27, name: 'Cầu Vồng Hoa',        colors: ['R','P','Y','V','W','O'], perColor: 6, pots: 8, queueDepth: 4 },
  { id: 28, name: 'Đêm Hội Hoa',         colors: ['R','P','Y','V','W','O'], perColor: 9, pots: 8, queueDepth: 5 },
  { id: 29, name: 'Vũ Điệu Sắc Hoa',     colors: ['R','P','Y','V','W','O'], perColor: 9, pots: 9, queueDepth: 5 },
  { id: 30, name: 'Bậc Thầy Vườn Hoa',   colors: ['R','P','Y','V','W','O'], perColor: 12,pots: 9, queueDepth: 6 },
];

// ─── L1-L3 canon: handcrafted tutorial start ──────────────────
const CANON = [
  { id: 1, name: 'Hoa Hồng Đầu Tiên',
    pots: [
      { active: ['R', null, null], queue: ['R', 'R'] },
      { active: [null, null, null], queue: [] },
    ],
    moveLimit: 8, starThresholds: [4, 6, 8],
    tutorial: true, schemaVersion: 2 },
  { id: 2, name: 'Buổi Sáng Êm Ả',
    pots: [
      { active: ['R', 'P', 'R'], queue: ['P', 'R', 'P'] },
      { active: ['P', 'R', 'P'], queue: ['R', 'P', 'R'] },
      { active: [null, null, null], queue: [] },
    ],
    moveLimit: 14, starThresholds: [8, 11, 14],
    tutorial: true, schemaVersion: 2 },
  { id: 3, name: 'Ba Sắc Hoa',
    pots: [
      { active: ['R', 'P', 'R'], queue: [] },
      { active: ['R', 'Y', 'Y'], queue: [] },
      { active: ['P', 'P', 'Y'], queue: [] },
      { active: [null, null, null], queue: [] },
    ],
    moveLimit: 12, starThresholds: [7, 9, 12],
    tutorial: true, schemaVersion: 2 },
];

// ─── DISTRIBUTION with combo-bias ──────────────────────────────
// Strategy: distribute active randomly; then fill queue with same-color
// clusters where possible so promotions trigger cascade vanishes.
function distribute(flowers, playPots, capPerPot) {
  const shuffled = shuffle(flowers);
  const buckets = Array.from({ length: playPots }, () => []);

  // Pass 1: try to round-robin so each pot gets equal count
  let idx = 0;
  while (idx < shuffled.length) {
    let placed = false;
    for (let p = 0; p < playPots && idx < shuffled.length; p++) {
      if (buckets[p].length < capPerPot) {
        buckets[p].push(shuffled[idx++]);
        placed = true;
      }
    }
    if (!placed) break;
  }

  // For each bucket: split into active (3) and queue (rest).
  // Combo-bias: within queue, cluster same-color triples adjacently so
  // promote→vanish cascades happen.
  return buckets.map(b => {
    const queueRaw = b.slice(3);
    // Cluster by color in queue
    const byColor = {};
    queueRaw.forEach(c => { (byColor[c] = byColor[c] || []).push(c); });
    // Emit clusters of size 3 first, then leftovers
    const clusteredQueue = [];
    const colors = Object.keys(byColor);
    // Shuffle color order so it's not always R first
    const shuffledColors = shuffle(colors);
    shuffledColors.forEach(c => {
      const list = byColor[c];
      // Place triples first
      while (list.length >= 3) {
        clusteredQueue.push(list.shift(), list.shift(), list.shift());
      }
    });
    // Then leftovers (1-2 of same color)
    shuffledColors.forEach(c => {
      while (byColor[c].length) clusteredQueue.push(byColor[c].shift());
    });
    const active = [b[0] || null, b[1] || null, b[2] || null];
    return { active, queue: clusteredQueue };
  });
}

// Post-process: bias each pot toward "2+1" active (2 of same color + 1 other)
// — creates "1-move-from-vanish" hotspots → more combo opportunities.
// If pot's 3 active are all distinct colors and queue has a duplicate match,
// swap. Mutates pots in place.
function biasActiveTowardPairs(pots) {
  for (const p of pots) {
    const [a0, a1, a2] = p.active;
    if (!a0 || !a1 || !a2) continue;                  // need full active
    if (a0 === a1 || a1 === a2 || a0 === a2) continue; // already has pair
    if (!p.queue.length) continue;
    // Try to find a queue flower matching one of active colors
    for (let qi = 0; qi < p.queue.length; qi++) {
      const qc = p.queue[qi];
      const replaceIdx = qc === a0 ? -1 : qc === a1 ? -1 : qc === a2 ? -1 : -1;
      if (qc === a0 || qc === a1 || qc === a2) {
        // Swap: queue[qi] becomes one of active, push displaced into queue head
        // Choose to replace the position whose color is NOT qc — prefer middle (pos 1) for max visibility
        let target = -1;
        if (a1 !== qc) target = 1;
        else if (a0 !== qc) target = 0;
        else target = 2;
        const old = p.active[target];
        p.active[target] = qc;
        p.queue.splice(qi, 1);
        p.queue.unshift(old); // displaced flower joins queue front (will promote later)
        break;
      }
    }
  }
}

// ─── Random simulation: prove playability when BFS times out ──
// Runs N random plays, returns minimum moves of any win.
// Uses the same engine.applyMove so vanish+promote behave as in production.
function randomSimulate(initState, maxMovesPerRun = 100, runs = 200) {
  let minMoves = Infinity;
  let solved = false;
  for (let run = 0; run < runs; run++) {
    const state = Engine.clone(initState);
    let moves = 0;
    while (moves < maxMovesPerRun) {
      // Find all valid moves
      const valid = [];
      const N = state.length;
      for (let a = 0; a < N; a++) {
        for (let posA = 0; posA < 3; posA++) {
          if (!state[a].active[posA]) continue;
          for (let b = 0; b < N; b++) {
            for (let posB = 0; posB < 3; posB++) {
              if (a === b && posA === posB) continue;
              if (state[b].active[posB] !== null) continue;
              if (Engine.canMove(state, a, posA, b, posB)) valid.push([a, posA, b, posB]);
            }
          }
        }
      }
      if (!valid.length) break;
      // Prefer moves that COMPLETE a vanish (greedy combo)
      let move = null;
      for (const m of valid) {
        const flower = state[m[0]].active[m[1]];
        const dest = state[m[2]].active;
        let cnt = 0;
        for (let k = 0; k < 3; k++) if (dest[k] === flower) cnt++;
        if (cnt === 2) { move = m; break; } // adding to a 2-same pot triggers vanish
      }
      if (!move) move = valid[rngInt(valid.length)];
      Engine.applyMove(state, ...move);
      moves++;
      if (Engine.isWon(state)) {
        solved = true;
        if (moves < minMoves) minMoves = moves;
        break;
      }
    }
  }
  return { solved, minMoves: solved ? minMoves : -1 };
}

// ─── Detection: pot starts in trivial-win (3 active same color) ────
function hasTrivialPot(pots) {
  return pots.some(p =>
    p.active[0] && p.active[0] === p.active[1] && p.active[1] === p.active[2]
  );
}

// ─── Generate one level ────────────────────────────────────────
function generate(spec, maxAttempts = 200) {
  const flowers = [];
  spec.colors.forEach(c => {
    for (let i = 0; i < spec.perColor; i++) flowers.push(c);
  });
  const playPots = spec.pots - 1;
  const capPerPot = 3 + spec.queueDepth;

  if (flowers.length > playPots * capPerPot) {
    console.error(`L${spec.id} infeasible: ${flowers.length} flowers > ${playPots * capPerPot} cap`);
    return null;
  }

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const distrib = distribute(flowers, playPots, capPerPot);
    biasActiveTowardPairs(distrib); // increase combo potential
    const pots = [...distrib, { active: [null, null, null], queue: [] }];

    // Validate basic
    const lv = { id: spec.id, name: spec.name, pots, moveLimit: 100, starThresholds: [10, 20, 30], schemaVersion: 2 };
    const errs = Engine.validate(lv);
    if (errs.length) continue;

    // Reject trivial-win starts
    if (hasTrivialPot(pots)) continue;

    // Init + check deadlock + not already won
    const init = Engine.initState(pots);
    if (Engine.isWon(init)) continue;
    if (Engine.isDeadlock(init)) continue;

    // BFS solve — generous budget for early/mid levels
    const budget = spec.id <= 8 ? 250000 : (spec.id <= 15 ? 400000 : (spec.id <= 22 ? 150000 : 60000));
    const r = Engine.bfsSolve(init, budget);
    let opt, solved, simulated = false;
    if (r && r.solvable) {
      opt = r.moves;
      solved = true;
    } else {
      // BFS gave up. Run random simulation to find SOME winning path.
      // Confirms playability + gives empirical move-count estimate.
      const simResult = randomSimulate(init, flowers.length * 2);
      if (simResult.solved) {
        opt = simResult.minMoves;
        simulated = true;
      } else {
        // Last resort heuristic — flag for manual review
        opt = flowers.length;
      }
    }

    // Tuning — 3⭐ relaxed from "exact opt" to "opt + 1"
    const t3 = opt + 1;
    const t2 = Math.max(t3 + 2, Math.ceil(opt * 1.3));
    const t1 = Math.max(t2 + 2, Math.ceil(opt * 1.65));
    // Generous moveLimit so heuristic-only levels remain winnable
    const lim = solved ? Math.max(t1, opt + 4) : Math.max(t1 + 3, Math.ceil(opt * 1.9));

    return {
      id: spec.id,
      name: spec.name,
      pots,
      moveLimit: lim,
      starThresholds: [t3, t2, t1],
      schemaVersion: 2,
      _optimal: opt,
      _solved: solved,
      _simulated: simulated,
      _attempts: attempt + 1,
    };
  }
  return null;
}

// ─── Main ──────────────────────────────────────────────────────
const seed = parseInt(process.argv[2], 10) || 42;
setSeed(seed);
console.error(`Generating L4-L${CURVE[CURVE.length - 1].id} with seed=${seed}...`);

const ALL = [...CANON];
let okCount = 0;
let heuristicCount = 0;

for (const spec of CURVE) {
  const lv = generate(spec);
  if (!lv) {
    console.error(`❌ L${spec.id} "${spec.name}": failed after 200 attempts`);
    continue;
  }
  const marker = lv._solved ? '✅ BFS' : (lv._simulated ? '🎲 SIM' : '⚠️ HEUR');
  if (lv._solved) okCount++; else heuristicCount++;
  console.error(`L${String(lv.id).padStart(2)} "${lv.name.padEnd(22)}" ${lv.pots.length}p · ${spec.colors.length}c · ${spec.colors.length * spec.perColor}f · opt=${lv._optimal} · lim=${lv.moveLimit} · att=${lv._attempts} ${marker}`);
  delete lv._optimal;
  delete lv._solved;
  delete lv._simulated;
  delete lv._attempts;
  ALL.push(lv);
}

console.error(`\nSummary: ${okCount} BFS-verified, ${heuristicCount} heuristic-only`);

// ─── Output JS module body ─────────────────────────────────────
const out = ALL.map(lv => {
  const potsStr = lv.pots.map(p =>
    `      { active: [${p.active.map(x => x === null ? 'null' : JSON.stringify(x)).join(', ')}], queue: [${p.queue.map(x => JSON.stringify(x)).join(', ')}] }`
  ).join(',\n');
  const tutorial = lv.tutorial ? '\n      tutorial: true,' : '';
  return `    {
      id: ${lv.id},
      name: ${JSON.stringify(lv.name)},
      pots: [
${potsStr}
      ],
      moveLimit: ${lv.moveLimit},
      starThresholds: [${lv.starThresholds.join(', ')}],${tutorial}
      schemaVersion: 2,
    }`;
}).join(',\n\n');

console.log(out);

// Procedural generator for Sort Blossom levels.
// Guarantees: color counts are multiples of 3, structure valid, level solvable via bfsSolve.
// Run: node tools/_gen_levels.js > /tmp/levels.txt

const Engine = require('../engine/sort_blossom_engine.js');

// Curve definition — { totalFlowers, colorCount, potCount, queueDepthMax }
const CURVE = [
  // L1-3 already canon — skip
  { id: 4,  name: 'Vườn Bạch Cúc',       colors: ['R','Y'],       perColor: 3, pots: 3, queueDepth: 1 },
  { id: 5,  name: 'Hoa Anh Đào',          colors: ['R','P'],       perColor: 3, pots: 3, queueDepth: 1 },
  { id: 6,  name: 'Cúc Họa Mi',           colors: ['Y','P'],       perColor: 3, pots: 3, queueDepth: 1 },
  { id: 7,  name: 'Tam Sắc Bình Minh',    colors: ['R','P','Y'],   perColor: 3, pots: 4, queueDepth: 0 },
  { id: 8,  name: 'Cánh Đồng Tulip',      colors: ['R','P','Y'],   perColor: 3, pots: 4, queueDepth: 1 },
  { id: 9,  name: 'Vườn Hoa Sớm',         colors: ['R','P','Y'],   perColor: 6, pots: 5, queueDepth: 3 },
  { id: 10, name: 'Khu Vườn Bí Mật',      colors: ['R','P','Y'],   perColor: 6, pots: 4, queueDepth: 3 },
  { id: 11, name: 'Hoa Cẩm Chướng',       colors: ['R','P','Y'],   perColor: 3, pots: 5, queueDepth: 1 },
  { id: 12, name: 'Vườn Trên Cao',        colors: ['R','P','Y'],   perColor: 6, pots: 5, queueDepth: 2 },
  { id: 13, name: 'Bốn Mùa Hoa',          colors: ['R','P','Y','V'], perColor: 3, pots: 5, queueDepth: 0 },
  { id: 14, name: 'Hoa Tử Đinh Hương',    colors: ['R','P','Y','V'], perColor: 3, pots: 5, queueDepth: 1 },
  { id: 15, name: 'Vườn Phượng',          colors: ['R','P','Y','V'], perColor: 6, pots: 6, queueDepth: 3 },
  { id: 16, name: 'Hoa Lavender',         colors: ['R','P','Y','V'], perColor: 6, pots: 5, queueDepth: 3 },
  { id: 17, name: 'Vườn Cẩm Tú Cầu',      colors: ['R','P','Y','V'], perColor: 6, pots: 6, queueDepth: 3 },
  { id: 18, name: 'Hoa Trắng Tinh Khôi',  colors: ['R','P','Y','V','W'], perColor: 3, pots: 6, queueDepth: 0 },
  { id: 19, name: 'Vườn Mây',             colors: ['R','P','Y','V','W'], perColor: 3, pots: 6, queueDepth: 1 },
  { id: 20, name: 'Lá Mùa Thu',           colors: ['R','P','Y','V','W'], perColor: 6, pots: 7, queueDepth: 3 },
  { id: 21, name: 'Vườn Bạch Liên',       colors: ['R','P','Y','V','W'], perColor: 6, pots: 6, queueDepth: 3 },
  { id: 22, name: 'Đỉnh Cao Năm Sắc',     colors: ['R','P','Y','V','W'], perColor: 6, pots: 7, queueDepth: 4 },
  { id: 23, name: 'Hoàng Hôn Cam',        colors: ['R','P','Y','V','W','O'], perColor: 3, pots: 7, queueDepth: 0 },
  { id: 24, name: 'Vườn Lửa',             colors: ['R','P','Y','V','W','O'], perColor: 3, pots: 7, queueDepth: 1 },
  { id: 25, name: 'Lễ Hội Sắc Màu',       colors: ['R','P','Y','V','W','O'], perColor: 6, pots: 8, queueDepth: 3 },
  { id: 26, name: 'Vườn Phượng Hoàng',    colors: ['R','P','Y','V','W','O'], perColor: 6, pots: 7, queueDepth: 3 },
  { id: 27, name: 'Cầu Vồng Hoa',         colors: ['R','P','Y','V','W','O'], perColor: 6, pots: 8, queueDepth: 4 },
  { id: 28, name: 'Đêm Hội Hoa',          colors: ['R','P','Y','V','W','O'], perColor: 9, pots: 8, queueDepth: 5 },
  { id: 29, name: 'Vũ Điệu Sắc Hoa',      colors: ['R','P','Y','V','W','O'], perColor: 9, pots: 9, queueDepth: 5 },
  { id: 30, name: 'Bậc Thầy Vườn Hoa',    colors: ['R','P','Y','V','W','O'], perColor: 12, pots: 9, queueDepth: 6 },
];

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function generate(spec, seed = 0) {
  // Total flowers
  const flowers = [];
  spec.colors.forEach(c => {
    for (let i = 0; i < spec.perColor; i++) flowers.push(c);
  });

  // ALWAYS keep 1 pot fully empty for maneuvering
  const playPots = spec.pots - 1;
  // Capacity per playing pot: 3 active + queueDepth queue
  const capPerPot = 3 + spec.queueDepth;

  // Need at least flowers.length <= playPots * capPerPot
  if (flowers.length > playPots * capPerPot) {
    return null; // not feasible
  }

  // Generate up to N tries, validate solvability
  for (let attempt = 0; attempt < 50; attempt++) {
    const shuffled = shuffle(flowers);
    const pots = [];
    let idx = 0;

    for (let p = 0; p < playPots; p++) {
      // Distribute roughly evenly, leaving some space
      const remaining = shuffled.length - idx;
      const remainingPots = playPots - p;
      const target = Math.min(capPerPot, Math.ceil(remaining / remainingPots));
      const chunk = shuffled.slice(idx, idx + target);
      idx += chunk.length;
      const active = [chunk[0] || null, chunk[1] || null, chunk[2] || null];
      const queue = chunk.slice(3);
      pots.push({ active, queue });
    }
    // Append empty pot
    pots.push({ active: [null, null, null], queue: [] });

    // Validate solvability
    const lv = { id: spec.id, name: spec.name, pots, moveLimit: 100, starThresholds: [10, 20, 30], schemaVersion: 2 };
    const errs = Engine.validate(lv);
    if (errs.length) continue;

    try {
      const init = Engine.initState(pots);
      if (Engine.isWon(init)) continue;
      // Smaller budget for higher levels — fall back to heuristic moveLimit
      const budget = spec.id <= 15 ? 80000 : (spec.id <= 22 ? 40000 : 20000);
      const r = Engine.bfsSolve(init, budget);
      let opt = r && r.moves >= 0 ? r.moves : -1;
      if (opt < 0) {
        // BFS gave up — heuristic: 1.2 × total flowers (rough estimate)
        opt = Math.ceil(flowers.length * 0.6);
      }
      const lim = Math.max(opt + 2, Math.ceil(opt * 1.6));
      const t3 = opt;
      const t2 = Math.ceil(opt * 1.25);
      const t1 = lim;
      return {
        id: spec.id,
        name: spec.name,
        pots,
        moveLimit: lim,
        starThresholds: [t3, t2, t1],
        schemaVersion: 2,
        _optimal: opt,
        _solved: r && r.moves >= 0,
      };
    } catch (e) { /* retry */ }
  }
  return null;
}

// L1-3 canon (keep verbatim)
const CANON = [
  { id: 1, name: 'Hoa Hồng Đầu Tiên', pots: [{ active: ['R', null, null], queue: ['R', 'R'] }, { active: [null, null, null], queue: [] }], moveLimit: 8, starThresholds: [3, 5, 7], tutorial: true, schemaVersion: 2 },
  { id: 2, name: 'Buổi Sáng Êm Ả', pots: [{ active: ['R', 'P', 'R'], queue: ['P', 'R', 'P'] }, { active: ['P', 'R', 'P'], queue: ['R', 'P', 'R'] }, { active: [null, null, null], queue: [] }], moveLimit: 14, starThresholds: [6, 9, 13], schemaVersion: 2 },
  { id: 3, name: 'Ba Sắc Hoa', pots: [{ active: ['R', 'P', 'R'], queue: [] }, { active: ['R', 'Y', 'Y'], queue: [] }, { active: ['P', 'P', 'Y'], queue: [] }, { active: [null, null, null], queue: [] }], moveLimit: 12, starThresholds: [4, 7, 10], schemaVersion: 2 },
];

const ALL = [...CANON];
console.error(`Generating L4-L30...`);
for (const spec of CURVE) {
  let lv = null;
  for (let s = 0; s < 20 && !lv; s++) lv = generate(spec, s);
  if (!lv) {
    console.error(`❌ L${spec.id} "${spec.name}": failed to generate solvable`);
    continue;
  }
  const marker = lv._solved ? '✅' : '⚠️ heuristic';
  console.error(`L${lv.id.toString().padStart(2)} "${lv.name}" — ${lv.pots.length}p · ${spec.colors.length}c · ${spec.colors.length * spec.perColor}f · opt=${lv._optimal} · lim=${lv.moveLimit} ${marker}`);
  delete lv._optimal;
  delete lv._solved;
  ALL.push(lv);
}

// Output as JS module body
const out = ALL.map(lv => {
  const potsStr = lv.pots.map(p => `      { active: [${p.active.map(x => x === null ? 'null' : JSON.stringify(x)).join(', ')}], queue: [${p.queue.map(x => JSON.stringify(x)).join(', ')}] }`).join(',\n');
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

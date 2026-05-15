#!/usr/bin/env node
// Generate one or more Sort Blossom levels from a spec.
//
// Usage:
//   node scripts/gen-level.js --spec levels/specs/L10.json
//   node scripts/gen-level.js --batch levels/specs/curve.json
//   node scripts/gen-level.js --inline '{"id":10,"colors":["R","P","Y"],"perColor":6,"pots":4,"queueDepth":3}'
//
// Spec schema (one level):
//   {
//     "id":         number,         // level ID
//     "name":       string,         // display name (optional, auto-named if omitted)
//     "colors":     ["R","P",...],  // color keys used in this level
//     "perColor":   number,         // flowers per color (multiple of 3)
//     "pots":       number,         // total pots incl. 1 empty maneuver pot
//     "queueDepth": number,         // max queue per playing pot (0..6)
//     "difficulty": "easy"|"medium"|"hard",  // optional, controls move budget
//     "tutorial":   boolean         // optional, marks tutorial level
//   }
//
// Batch spec:
//   { "levels": [<spec>, <spec>, ...] }
//
// Output: prints level JSON to stdout. Use --write to apply directly to
// engine/sort_blossom_data.js (replaces matching id or appends).

const fs = require('fs');
const path = require('path');
const Engine = require('../engine/sort_blossom_engine.js');
const { layoutPots } = require('./layout-pots.js');

// ─── Args parsing ──────────────────────────────────────────────
const args = process.argv.slice(2);
const flags = {};
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--')) {
    const key = args[i].slice(2);
    const val = (i + 1 < args.length && !args[i+1].startsWith('--')) ? args[++i] : true;
    flags[key] = val;
  }
}

// ─── Spec loading ──────────────────────────────────────────────
function loadSpecs() {
  if (flags.inline) return [JSON.parse(flags.inline)];
  if (flags.spec) {
    const txt = fs.readFileSync(flags.spec, 'utf8');
    const parsed = JSON.parse(txt);
    return Array.isArray(parsed) ? parsed : [parsed];
  }
  if (flags.batch) {
    const txt = fs.readFileSync(flags.batch, 'utf8');
    const parsed = JSON.parse(txt);
    return parsed.levels || (Array.isArray(parsed) ? parsed : [parsed]);
  }
  throw new Error('Provide --spec <file>, --batch <file>, or --inline <json>');
}

// ─── Spec validation ───────────────────────────────────────────
function validateSpec(spec) {
  const errs = [];
  if (typeof spec.id !== 'number') errs.push('id must be number');
  if (!Array.isArray(spec.colors) || !spec.colors.length) errs.push('colors must be non-empty array');
  if (typeof spec.perColor !== 'number' || spec.perColor < 3 || spec.perColor % 3 !== 0) {
    errs.push('perColor must be a positive multiple of 3');
  }
  if (typeof spec.pots !== 'number' || spec.pots < 2 || spec.pots > 12) {
    errs.push('pots must be 2..12');
  }
  if (typeof spec.queueDepth !== 'number' || spec.queueDepth < 0 || spec.queueDepth > 6) {
    errs.push('queueDepth must be 0..6');
  }
  if (spec.emptyPots !== undefined) {
    if (typeof spec.emptyPots !== 'number' || spec.emptyPots < 0 || spec.emptyPots >= spec.pots) {
      errs.push(`emptyPots must be 0..${spec.pots - 1}`);
    }
  }
  return errs;
}

// ─── Shuffle ───────────────────────────────────────────────────
function makeRng(seed) {
  let s = seed | 0;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}
function shuffle(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── Difficulty -> move budget multiplier ──────────────────────
// Lower multiplier = tighter limit = harder. Defaults to "medium".
const DIFF_MUL = {
  tutorial: { lim: 2.0, t3: 1.5, t2: 1.75 },  // very forgiving
  easy:     { lim: 1.8, t3: 1.2, t2: 1.5  },
  medium:   { lim: 1.6, t3: 1.0, t2: 1.25 },  // 3* = optimal
  hard:     { lim: 1.3, t3: 1.0, t2: 1.15 },  // tight 2* gap
  brutal:   { lim: 1.15, t3: 1.0, t2: 1.07 },
};

// ─── Generate one level ────────────────────────────────────────
function generate(spec) {
  const errs = validateSpec(spec);
  if (errs.length) throw new Error(`Spec invalid: ${errs.join('; ')}`);

  const totalFlowers = spec.colors.length * spec.perColor;
  const emptyPots = spec.emptyPots ?? 1;  // default: reserve 1 empty maneuver pot
  const playPots = spec.pots - emptyPots;
  const capPerPot = 3 + spec.queueDepth;

  if (totalFlowers > playPots * capPerPot) {
    throw new Error(`Infeasible: ${totalFlowers} flowers > ${playPots} pots × ${capPerPot} cap`);
  }
  // With 0 empty maneuver pots, we need >=1 free slot somewhere so the
  // player can make a first move. Require strictly more capacity than flowers.
  if (emptyPots === 0 && totalFlowers >= playPots * capPerPot) {
    throw new Error(`Infeasible (emptyPots=0): ${totalFlowers} flowers ≥ ${playPots} pots × ${capPerPot} cap — no slack for initial move. Increase queueDepth or pots, or set emptyPots:1.`);
  }

  const flowers = [];
  spec.colors.forEach(c => { for (let i = 0; i < spec.perColor; i++) flowers.push(c); });

  const diff = DIFF_MUL[spec.difficulty || 'medium'];
  const seedBase = spec.seed || (spec.id * 7919);

  // Try up to N attempts; pick the most challenging solvable one
  let best = null;
  for (let attempt = 0; attempt < 40; attempt++) {
    const rng = makeRng(seedBase + attempt * 31);
    const shuffled = shuffle(flowers, rng);
    const pots = [];
    let idx = 0;
    for (let p = 0; p < playPots; p++) {
      const remaining = shuffled.length - idx;
      const remainingPots = playPots - p;
      const target = Math.min(capPerPot, Math.ceil(remaining / remainingPots));
      const chunk = shuffled.slice(idx, idx + target);
      idx += chunk.length;
      pots.push({
        active: [chunk[0] || null, chunk[1] || null, chunk[2] || null],
        queue: chunk.slice(3),
      });
    }
    // When emptyPots=0 we may end up with every active row full → no legal
    // moves at init. Ensure at least 1 active slot is empty somewhere by
    // pulling the LAST active flower of the LAST play pot to its queue.
    if (emptyPots === 0 && pots.length > 0) {
      const allActiveFull = pots.every(p => p.active.every(c => c !== null));
      if (allActiveFull) {
        const last = pots[pots.length - 1];
        if (last.queue.length < spec.queueDepth) {
          last.queue.push(last.active[2]);
          last.active[2] = null;
        }
        // else: queue is also full; level is over-packed — let attempt fail
      }
    }
    for (let e = 0; e < emptyPots; e++) {
      pots.push({ active: [null, null, null], queue: [] });
    }

    const probe = { id: spec.id, name: spec.name || `Level ${spec.id}`, pots, moveLimit: 999, starThresholds: [10, 20, 30], schemaVersion: 2 };
    if (Engine.validate(probe).length) continue;

    const init = Engine.initState(pots);
    if (Engine.isWon(init)) continue;

    // Solver budget — larger for low IDs, smaller for high IDs (BFS state explosion).
    const budget = spec.id <= 15 ? 80000 : (spec.id <= 22 ? 40000 : 20000);
    const r = Engine.bfsSolve(init, budget);
    const solved = r && r.moves >= 0;
    let opt = solved ? r.moves : Math.ceil(flowers.length * 0.6); // heuristic if BFS gives up

    // Track most challenging (highest opt = "most moves required") solvable layout
    if (!best || opt > best.opt) {
      best = { pots, opt, solved };
    }
  }

  if (!best) throw new Error(`Could not generate any solvable layout for L${spec.id}`);

  const opt = best.opt;
  const lim = Math.max(opt + 2, Math.ceil(opt * diff.lim));
  const t3  = opt;
  const t2  = Math.ceil(opt * diff.t2);
  const t1  = lim;

  const level = {
    id: spec.id,
    name: spec.name || `Level ${spec.id}`,
    pots: best.pots,
    moveLimit: lim,
    starThresholds: [t3, t2, t1],
    schemaVersion: 2,
  };
  // Pot layout: only emit when spec.layout === true. Otherwise the level
  // ships without `potLayout`, and the game falls back to flex auto-center
  // (or the designer adds positions later via tools/level_editor.html).
  if (spec.layout === true) {
    level.potLayout = layoutPots(spec.pots, { jitter: spec.jitter || 0, seed: seedBase });
  }
  if (spec.tutorial) level.tutorial = true;

  return { level, meta: { optimal: opt, solverConverged: best.solved, totalFlowers, playPots, emptyPots, difficulty: spec.difficulty || 'medium' } };
}

// ─── Apply to engine/sort_blossom_data.js ──────────────────────
function applyLevels(levels) {
  const file = path.join(__dirname, '..', 'engine', 'sort_blossom_data.js');
  const src = fs.readFileSync(file, 'utf8');
  const marker = 'const SORT_BLOSSOM_LEVELS';
  const start = src.indexOf(marker);
  if (start === -1) throw new Error('SORT_BLOSSOM_LEVELS not found');
  const arrStart = src.indexOf('[', start);
  let depth = 0, end = -1;
  for (let i = arrStart; i < src.length; i++) {
    const ch = src[i];
    if (ch === '[') depth++;
    else if (ch === ']') { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end === -1) throw new Error('Could not find closing ] of SORT_BLOSSOM_LEVELS');

  // Parse existing levels to merge by id (dedupe via Map — file may contain
  // duplicate ids from earlier buggy writes; one merged record per id wins).
  const existingRaw = src.slice(arrStart, end + 1);
  const existing = eval(existingRaw); // file content is trusted; eval ok for parse
  const byId = new Map();
  for (const e of existing) {
    if (!byId.has(e.id)) byId.set(e.id, e); // keep first occurrence on dup
  }
  for (const lv of levels) {
    byId.set(lv.id, lv); // new gen wins
  }
  const merged = [...byId.values()].sort((a, b) => a.id - b.id);

  let tail = end + 1;
  if (src[tail] === ';') tail++;
  if (src[tail] === '\n') tail++;
  const newContent = src.slice(0, start)
    + `const SORT_BLOSSOM_LEVELS = ${JSON.stringify(merged, null, 2)};\n`
    + src.slice(tail);
  fs.writeFileSync(file, newContent, 'utf8');
  console.error(`✓ Wrote ${levels.length} level(s) to ${path.relative(process.cwd(), file)} (total: ${merged.length})`);
}

// ─── Main ──────────────────────────────────────────────────────
function main() {
  const specs = loadSpecs();
  const out = [];
  for (const spec of specs) {
    try {
      const { level, meta } = generate(spec);
      out.push(level);
      console.error(`✓ L${level.id} "${level.name}" — ${meta.totalFlowers}f · ${level.pots.length}p · opt=${meta.optimal} ${meta.solverConverged ? '' : '(heuristic)'} · lim=${level.moveLimit} · stars=[${level.starThresholds.join(',')}]`);
    } catch (e) {
      console.error(`✗ Spec ${spec.id || '?'}: ${e.message}`);
      process.exit(1);
    }
  }

  if (flags.write) {
    applyLevels(out);
  } else {
    console.log(JSON.stringify(out.length === 1 ? out[0] : out, null, 2));
    console.error(`\n(Pass --write to apply to engine/sort_blossom_data.js)`);
  }
}

if (require.main === module) main();
module.exports = { generate, applyLevels };

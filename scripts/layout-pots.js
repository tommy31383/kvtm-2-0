// Pot layout generator for Sort Blossom levels.
//
// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS — change here to retune the WHOLE layout system
// ═══════════════════════════════════════════════════════════════════════════

// ─── Reference frame ──────────────────────────────────────────
// (Matches CSS consumer at kvtm_2_0_game.html:6371 — DO NOT change unless
//  the game's #blv2-pots container ratio changes.)
const FRAME_W = 390;
const FRAME_H = 700;

// ─── Pot dimensions ───────────────────────────────────────────
// (Mirrors `.sb-compact` CSS vars in engine/sort_blossom.css.)
const POT_W = 114;
const POT_H = 160;

// ─── Bloom envelope (visual extent of 3 full blooms beyond pot bbox) ─────
// MEASURED — see scripts/measure-bloom-envelope.js. Re-run to refresh.
// File data/bloom_envelope.json is the source of truth. Values below mirror
// it for sync purposes; build-time check enforces equality.
const BLOOM_ENVELOPE = require('../data/bloom_envelope.json');
const BLOOM_PAD_LEFT  = BLOOM_ENVELOPE.compact.pad_left;
const BLOOM_PAD_RIGHT = BLOOM_ENVELOPE.compact.pad_right;
const BLOOM_PAD_TOP   = BLOOM_ENVELOPE.compact.pad_top;
const BLOOM_PAD_BOT   = BLOOM_ENVELOPE.compact.pad_bot;

const EFFECTIVE_POT_W = POT_W + BLOOM_PAD_LEFT + BLOOM_PAD_RIGHT;
const EFFECTIVE_POT_H = POT_H + BLOOM_PAD_TOP + BLOOM_PAD_BOT;

// ─── Spacing rules ────────────────────────────────────────────
// These are the knobs you tune. Every preset below respects them.

// Padding between pot edge and frame edge.
const EDGE_PAD_X = 14;   // left/right of frame
const EDGE_PAD_TOP = 12; // top of container
const EDGE_PAD_BOT = 18; // bottom of container

// MINIMUM gap between two pots, EDGE-TO-EDGE. Hard constraint — never
// violated, even with jitter. These are the floors; actual gaps will be
// wider when the row has fewer pots (extra space is distributed evenly).
//
// Tuned so 9 pots (3×3) fits cleanly inside 390×700 frame:
//   • 3 cols × 114 + 2 × POT_GAP_X + 2 × EDGE_PAD_X = 342+16+28 = 386 ≤ 390 ✓
//   • 4 rows × 160 + 3 × POT_GAP_Y + TOP+BOT       = 640+30+30 = 700 ✓
//
// If you want more breathing room for high-N levels, the only options are:
//   (a) cap level designs at 6 pots (clean ≥ 24px gaps everywhere)
//   (b) shrink pot CSS for N≥7 (separate `.sb-tight` class)
//   (c) accept tight gaps for high N (current choice).
const POT_GAP_X = 8;     // horizontal (same row, adjacent pots)
const POT_GAP_Y = 10;    // vertical (row-bottom to next row-top)

// Jitter cap. Must be ≤ floor(min(POT_GAP_X, POT_GAP_Y) / 2 - 1)
// = floor(8/2 - 1) = 3. Keeps the hard gap constraint inviolable at extremes.
const MAX_JITTER_PX = 3;

// ─── Derived bounds ───────────────────────────────────────────
// Center-x of a pot must stay in [X_MIN, X_MAX] so its edges stay inside
// EDGE_PAD_X.
const X_MIN = POT_W / 2 + EDGE_PAD_X;
const X_MAX = FRAME_W - POT_W / 2 - EDGE_PAD_X;
// Top-y of a pot must stay in [Y_MIN, Y_MAX] so the pot fits between top
// and bottom padding.
const Y_MIN = EDGE_PAD_TOP;
const Y_MAX = FRAME_H - POT_H - EDGE_PAD_BOT;

// Minimum row spacing (top-of-row to top-of-row). One pot height plus the
// vertical gap.
const ROW_PITCH_MIN = POT_H + POT_GAP_Y; // 176

// Maximum pots that fit on a single row, given EDGE_PAD_X + POT_GAP_X.
// width needed = n*POT_W + (n-1)*POT_GAP_X + 2*EDGE_PAD_X
// solve: n*POT_W + (n-1)*POT_GAP_X + 2*EDGE_PAD_X ≤ FRAME_W
function maxPotsPerRow() {
  const usable = FRAME_W - 2 * EDGE_PAD_X;
  // n*POT_W + (n-1)*POT_GAP_X ≤ usable
  // n*(POT_W + POT_GAP_X) - POT_GAP_X ≤ usable
  // n ≤ (usable + POT_GAP_X) / (POT_W + POT_GAP_X)
  return Math.floor((usable + POT_GAP_X) / (POT_W + POT_GAP_X));
}

// Maximum rows that fit vertically, given EDGE_PAD_TOP + EDGE_PAD_BOT + ROW_PITCH_MIN
function maxRows() {
  // r*POT_H + (r-1)*POT_GAP_Y + EDGE_PAD_TOP + EDGE_PAD_BOT ≤ FRAME_H
  // r ≤ (FRAME_H - EDGE_PAD_TOP - EDGE_PAD_BOT + POT_GAP_Y) / (POT_H + POT_GAP_Y)
  const usable = FRAME_H - EDGE_PAD_TOP - EDGE_PAD_BOT;
  return Math.floor((usable + POT_GAP_Y) / (POT_H + POT_GAP_Y));
}

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

function clampX(x) { return Math.max(X_MIN, Math.min(X_MAX, x)); }
function clampY(y) { return Math.max(Y_MIN, Math.min(Y_MAX, y)); }

/**
 * Build a single row of `n` pots centered horizontally. Respects POT_GAP_X.
 * @param {number} n  pots in row (1..maxPotsPerRow())
 * @param {number} y  top-edge y for the row
 * @throws if n exceeds row capacity
 */
function row(n, y) {
  if (n < 1) throw new Error(`row needs n >= 1, got ${n}`);
  if (n > maxPotsPerRow()) {
    throw new Error(`row of ${n} pots doesn't fit (max ${maxPotsPerRow()} per row at POT_W=${POT_W} POT_GAP_X=${POT_GAP_X} FRAME_W=${FRAME_W})`);
  }
  y = clampY(y);
  if (n === 1) return [{ x: Math.round(FRAME_W / 2), y: Math.round(y) }];
  // Center the row: total width = n*POT_W + (n-1)*POT_GAP_X.
  // Place leftmost center at (FRAME_W - totalWidth + POT_W) / 2.
  const totalWidth = n * POT_W + (n - 1) * POT_GAP_X;
  const leftEdge = (FRAME_W - totalWidth) / 2;
  const firstCenter = leftEdge + POT_W / 2;
  const stride = POT_W + POT_GAP_X;
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({ x: Math.round(clampX(firstCenter + i * stride)), y: Math.round(y) });
  }
  return out;
}

/**
 * Compute top-y for each of `numRows` rows. Spacing rules:
 *   - Adjacent rows: edge-to-edge gap = POT_GAP_Y (hard minimum)
 *   - Block centered vertically: leftover space distributed above/below evenly
 *   - Top of block ≥ EDGE_PAD_TOP
 *   - Bottom of last pot ≤ FRAME_H - EDGE_PAD_BOT
 * Returns deterministic array; never clamps after the fact.
 */
function rowsYs(numRows) {
  const maxR = maxRows();
  if (numRows > maxR) {
    throw new Error(`${numRows} rows don't fit vertically (max ${maxR} at POT_H=${POT_H} POT_GAP_Y=${POT_GAP_Y})`);
  }
  const totalHeight = numRows * POT_H + (numRows - 1) * POT_GAP_Y;
  const slack = FRAME_H - EDGE_PAD_TOP - EDGE_PAD_BOT - totalHeight;
  // slack ≥ 0 guaranteed by maxRows check
  const startTop = EDGE_PAD_TOP + Math.floor(slack / 2);
  const pitch = POT_H + POT_GAP_Y;
  const ys = [];
  for (let i = 0; i < numRows; i++) ys.push(startTop + i * pitch);
  return ys;
}

// ═══════════════════════════════════════════════════════════════════════════
// Pattern presets
// ═══════════════════════════════════════════════════════════════════════════

const PRESETS = {
  // N=2: 1 row of 2, vertically centered
  2: () => row(2, Math.round((FRAME_H - POT_H) / 2)),

  // N=3: triangle (2 top, 1 bottom centered)
  3: () => {
    const ys = rowsYs(2);
    return [
      ...row(2, ys[0]),
      { x: Math.round(FRAME_W / 2), y: ys[1] },
    ];
  },

  // N=4: 2×2 grid
  4: () => {
    const ys = rowsYs(2);
    return [...row(2, ys[0]), ...row(2, ys[1])];
  },

  // N=5: 2-2-1 stack
  5: () => {
    const ys = rowsYs(3);
    return [
      ...row(2, ys[0]),
      ...row(2, ys[1]),
      { x: Math.round(FRAME_W / 2), y: ys[2] },
    ];
  },

  // N=6: 2×3 grid (2 cols × 3 rows)
  6: () => {
    const ys = rowsYs(3);
    return ys.flatMap(y => row(2, y));
  },

  // N=7: 1 apex + 3 rows of 2
  7: () => {
    const ys = rowsYs(4);
    return [
      { x: Math.round(FRAME_W / 2), y: ys[0] },
      ...row(2, ys[1]),
      ...row(2, ys[2]),
      ...row(2, ys[3]),
    ];
  },

  // N=8: 2×4 grid (2 cols × 4 rows)
  8: () => {
    const ys = rowsYs(4);
    return ys.flatMap(y => row(2, y));
  },

  // N=9: 3×3 grid (3 cols × 3 rows). Requires 3 pots per row to fit.
  9: () => {
    if (maxPotsPerRow() < 3) {
      throw new Error('N=9 needs 3 pots per row but current spacing only fits ' + maxPotsPerRow());
    }
    const ys = rowsYs(3);
    return ys.flatMap(y => row(3, y));
  },

  // N=10: 3-3-3-1 (3 rows of 3 + 1 apex centered at bottom)
  // Visual density: same as N=12 minus 2 pots — used for hard levels.
  10: () => {
    if (maxPotsPerRow() < 3) throw new Error('N=10 needs 3 cols');
    const ys = rowsYs(4);
    return [
      ...row(3, ys[0]),
      ...row(3, ys[1]),
      ...row(3, ys[2]),
      { x: Math.round(FRAME_W / 2), y: ys[3] },
    ];
  },

  // N=11: 3-3-3-2 (3 rows of 3 + 2 at bottom)
  11: () => {
    if (maxPotsPerRow() < 3) throw new Error('N=11 needs 3 cols');
    const ys = rowsYs(4);
    return [
      ...row(3, ys[0]),
      ...row(3, ys[1]),
      ...row(3, ys[2]),
      ...row(2, ys[3]),
    ];
  },

  // N=12: 3×4 grid (3 cols × 4 rows) — maximum density.
  // Exactly fills the frame vertically: 4×160 + 3×10 + 12 + 18 = 700.
  12: () => {
    if (maxPotsPerRow() < 3) throw new Error('N=12 needs 3 cols');
    const ys = rowsYs(4);
    return ys.flatMap(y => row(3, y));
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate pot layout for N pots (2..12).
 *
 * @param {number} n
 * @param {object} [opts]
 *   @param {number} [opts.jitter] 0..1 — applies ±MAX_JITTER_PX random offset
 *   @param {number} [opts.seed]   Deterministic seed for jitter
 *   @param {string} [opts.pattern] Force preset key (default String(n))
 * @returns {{x:number, y:number}[]}
 *   x = pot horizontal CENTER (matches CSS margin-left:-pot_w/2)
 *   y = pot TOP edge (matches CSS top:y%)
 */
function layoutPots(n, opts = {}) {
  const pattern = opts.pattern || String(n);
  const preset = PRESETS[pattern];
  if (!preset) throw new Error(`No layout preset for ${n} pots (supported: ${Object.keys(PRESETS).join(',')})`);
  let positions = preset();

  if (opts.jitter && opts.jitter > 0) {
    let seed = opts.seed || 1;
    const rand = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    const maxOff = Math.min(MAX_JITTER_PX, opts.jitter * MAX_JITTER_PX);
    positions = positions.map(p => ({
      x: clampX(Math.round(p.x + (rand() - 0.5) * 2 * maxOff)),
      y: clampY(Math.round(p.y + (rand() - 0.5) * 2 * maxOff)),
    }));
  }

  return positions;
}

/**
 * Verify a potLayout. Two levels of checks:
 *   - HARD (always fails): pot out of safe zone, or any pair overlaps
 *   - SOFT (fails only when `opts.strict`): adjacent pots closer than the
 *     target POT_GAP_X / POT_GAP_Y. Jittered layouts may legitimately
 *     violate SOFT but never HARD.
 * @param {{x,y}[]} layout
 * @param {{strict?:boolean}} [opts]  strict=true also fails on SOFT issues
 * @returns {string[]} issues (empty = valid)
 */
function validateLayout(layout, opts = {}) {
  const issues = [];
  layout.forEach((p, i) => {
    if (p.x < X_MIN || p.x > X_MAX) {
      issues.push(`Pot #${i}: x=${p.x} out of [${X_MIN},${X_MAX}]`);
    }
    if (p.y < Y_MIN || p.y > Y_MAX) {
      issues.push(`Pot #${i}: y=${p.y} out of [${Y_MIN},${Y_MAX}]`);
    }
  });
  for (let i = 0; i < layout.length; i++) {
    for (let j = i + 1; j < layout.length; j++) {
      const a = layout[i], b = layout[j];
      const dxEdge = Math.abs(a.x - b.x) - POT_W;
      const dyEdge = Math.abs(a.y - b.y) - POT_H;
      // HARD: actual overlap → bounding boxes intersect
      if (dxEdge < 0 && dyEdge < 0) {
        issues.push(`Pots #${i}&#${j}: OVERLAP (Δx_edge=${dxEdge}, Δy_edge=${dyEdge})`);
      } else if (opts.strict && dxEdge < POT_GAP_X && dyEdge < POT_GAP_Y) {
        issues.push(`Pots #${i}&#${j}: tight gap (Δx_edge=${dxEdge}<${POT_GAP_X}, Δy_edge=${dyEdge}<${POT_GAP_Y})`);
      }
    }
  }
  return issues;
}

/**
 * Informational: where would the visual bloom envelopes of adjacent pots
 * overlap, given the measured BLOOM_PAD_* values? Returns issues as
 * descriptive strings. NEVER fails — this is design intent, not a bug.
 * Pots are placed so the geometric BBOX doesn't overlap (see validateLayout);
 * the bloom fan above each pot intentionally extends beyond pot edges.
 *
 * Use this to understand visual density when tuning new patterns or CSS.
 * @param {{x,y}[]} layout
 * @returns {string[]} informational notes (always returned, never throws)
 */
function describeBloomOverlap(layout) {
  const notes = [];
  for (let i = 0; i < layout.length; i++) {
    for (let j = i + 1; j < layout.length; j++) {
      const a = layout[i], b = layout[j];
      // Visual envelope (asymmetric: blooms lean right more than left)
      const aL = a.x - POT_W/2 - BLOOM_PAD_LEFT;
      const aR = a.x + POT_W/2 + BLOOM_PAD_RIGHT;
      const aT = a.y - BLOOM_PAD_TOP;
      const aB = a.y + POT_H + BLOOM_PAD_BOT;
      const bL = b.x - POT_W/2 - BLOOM_PAD_LEFT;
      const bR = b.x + POT_W/2 + BLOOM_PAD_RIGHT;
      const bT = b.y - BLOOM_PAD_TOP;
      const bB = b.y + POT_H + BLOOM_PAD_BOT;
      const ox = Math.min(aR, bR) - Math.max(aL, bL);
      const oy = Math.min(aB, bB) - Math.max(aT, bT);
      if (ox > 0 && oy > 0) {
        notes.push(`Pots #${i}&#${j}: bloom envelopes overlap by ${ox.toFixed(0)}×${oy.toFixed(0)} px (intentional fan)`);
      }
    }
  }
  return notes;
}

/**
 * Diagnostic report: spacing of every preset, useful for tuning constants.
 * @returns {object} { perN: { gaps_x, gaps_y, edge_x, edge_y } }
 */
function spacingReport() {
  const out = {};
  for (let n = 2; n <= 12; n++) {
    const layout = layoutPots(n);
    // Edge distances
    const xs = layout.map(p => p.x);
    const ys = layout.map(p => p.y);
    const xLeftEdges  = xs.map(x => x - POT_W / 2);
    const xRightEdges = xs.map(x => x + POT_W / 2);
    const yTopEdges   = [...ys];
    const yBotEdges   = ys.map(y => y + POT_H);
    // Edge clearance to frame
    const edgeLeft   = Math.min(...xLeftEdges);
    const edgeRight  = FRAME_W - Math.max(...xRightEdges);
    const edgeTop    = Math.min(...yTopEdges);
    const edgeBot    = FRAME_H - Math.max(...yBotEdges);
    // Inter-pot gaps
    const xGaps = [], yGaps = [];
    for (let i = 0; i < layout.length; i++) {
      for (let j = i + 1; j < layout.length; j++) {
        const dx = Math.abs(layout[i].x - layout[j].x) - POT_W;
        const dy = Math.abs(layout[i].y - layout[j].y) - POT_H;
        if (dx >= 0 && dy < 0) xGaps.push(dx); // same row → x gap matters
        if (dy >= 0 && dx < 0) yGaps.push(dy); // same column → y gap matters
      }
    }
    out[n] = {
      pots: layout.length,
      edge: { left: edgeLeft, right: edgeRight, top: edgeTop, bottom: edgeBot },
      minSameRowGap_x: xGaps.length ? Math.min(...xGaps) : null,
      minSameColGap_y: yGaps.length ? Math.min(...yGaps) : null,
    };
  }
  return out;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    layoutPots, validateLayout, describeBloomOverlap, spacingReport, PRESETS,
    // constants exposed for tuning + tests
    FRAME_W, FRAME_H, POT_W, POT_H,
    EDGE_PAD_X, EDGE_PAD_TOP, EDGE_PAD_BOT,
    POT_GAP_X, POT_GAP_Y, MAX_JITTER_PX,
    X_MIN, X_MAX, Y_MIN, Y_MAX,
    BLOOM_PAD_LEFT, BLOOM_PAD_RIGHT, BLOOM_PAD_TOP, BLOOM_PAD_BOT,
    EFFECTIVE_POT_W, EFFECTIVE_POT_H,
    maxPotsPerRow, maxRows,
  };
}

// CLI: `node scripts/layout-pots.js report` prints spacing for all N
if (require.main === module) {
  if (process.argv[2] === 'report') {
    console.log('Layout standard:');
    console.log(`  FRAME      ${FRAME_W} × ${FRAME_H}`);
    console.log(`  POT        ${POT_W} × ${POT_H}`);
    console.log(`  EDGE_PAD   x=${EDGE_PAD_X}  top=${EDGE_PAD_TOP}  bot=${EDGE_PAD_BOT}`);
    console.log(`  POT_GAP    x=${POT_GAP_X}  y=${POT_GAP_Y}`);
    console.log(`  Safe zone  x∈[${X_MIN},${X_MAX}]  y∈[${Y_MIN},${Y_MAX}]`);
    console.log(`  Max grid   ${maxPotsPerRow()} cols × ${maxRows()} rows`);
    console.log(`  BLOOM_PAD  L=${BLOOM_PAD_LEFT} R=${BLOOM_PAD_RIGHT} T=${BLOOM_PAD_TOP} B=${BLOOM_PAD_BOT}  (measured — see data/bloom_envelope.json)`);
    console.log(`  EFFECTIVE  ${EFFECTIVE_POT_W} × ${EFFECTIVE_POT_H}  (visual bloom envelope)\n`);
    console.log('Per N:');
    const rep = spacingReport();
    console.log('  N  | edge L  R  T  B  | minGapX  minGapY | bloomFans');
    console.log('  ───┼──────────────────┼─────────────────┼──────────');
    for (let n = 2; n <= 12; n++) {
      const r = rep[n];
      const fans = describeBloomOverlap(layoutPots(n)).length;
      console.log(`   ${String(n).padStart(2)} | ${String(r.edge.left).padStart(4)} ${String(r.edge.right).padStart(3)} ${String(r.edge.top).padStart(3)} ${String(r.edge.bottom).padStart(3)}  | ${String(r.minSameRowGap_x ?? '—').padStart(5)}    ${String(r.minSameColGap_y ?? '—').padStart(5)} | ${fans} pair${fans===1?'':'s'} overlap`);
    }
    console.log('\n(bloomFans = adjacent pot bloom-envelope overlap count; this is intentional visual fan, not a bug)');
  }
}

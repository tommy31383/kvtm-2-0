// Pot layout generator for Sort Blossom levels.
//
// ═══════════════════════════════════════════════════════════════════════════
// LAYOUT CONTRACT (matches kvtm_2_0_game.html consumer at line ~6371-6378)
// ═══════════════════════════════════════════════════════════════════════════
//
// Reference frame: the #blv2-pots container.
//   - Width:  390 px (phone frame minus padding)
//   - Height: 700 px (phone frame minus top HUD + bottom buttons)
//
// Pot dimensions (CSS .sb-compact):
//   - Width:  114 px (--sb-pot-w)
//   - Height: 160 px (--sb-pot-h)
//
// potLayout[i] = { x, y } in container px:
//   - x = HORIZONTAL CENTER of pot. game.html applies `margin-left:-pot_w/2`
//         after `left:${x/390*100}%` so center lands on x.
//   - y = TOP EDGE of pot. game.html applies `top:${y/700*100}%` directly
//         with no vertical margin offset.
//
// Safe zones:
//   - x range:  [POT_W/2 + PAD_X, FRAME_W - POT_W/2 - PAD_X] = [57+8, 390-57-8] = [65, 325]
//   - y range:  [TOP_PAD, FRAME_H - POT_H - BOTTOM_PAD]      = [40, 700-160-40]  = [40, 500]
//
// Spacing rules:
//   - Adjacent pots in same row: prefer ≥ pot_w*0.5 gap edge-to-edge for visual breathing
//   - Adjacent rows: prefer ≥ 20px gap top-to-bottom
//   - Center of mass of the layout should be near container center (190, 350) for
//     visual balance; off-center is OK if intentional (lopsided pattern).
//
// Pattern choice by pot count:
//   N=2 → side by side, centered horizontally + vertically (mid)
//   N=3 → triangle (2 top, 1 below center) — focal point at bottom
//   N=4 → 2×2 grid — balanced
//   N=5 → 2-2-1 stack (top, mid, single bottom focal)
//   N=6 → 2×3 grid (2 cols × 3 rows) — vertical reading
//   N=7 → 1 top, 2-2-2 stack (apex + body)
//   N=8 → 2×4 grid (tight but fits)
//   N=9 → 3×3 grid (densest; pots may need to shrink CSS-side for tap targets)

const FRAME_W = 390;
const FRAME_H = 700;
const POT_W   = 114;
const POT_H   = 160;
const PAD_X   = 12;    // horizontal padding inside container
const PAD_TOP = 10;    // top safe margin (container already has padding-top:50)
const PAD_BOT = 0;     // bottom margin (none — pot bottom may touch container bottom)

// Derived bounds for VALIDATION
const X_MIN = POT_W / 2 + PAD_X;            // 75
const X_MAX = FRAME_W - POT_W / 2 - PAD_X;  // 315
const Y_MIN = PAD_TOP;                      // 10
const Y_MAX = FRAME_H - POT_H - PAD_BOT;    // 540

// Maximum jitter offset (px). Kept small so row spacings stay > POT_H even
// at extremes — preserves the no-overlap invariant for every preset.
const MAX_JITTER_PX = 4;

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

function clampX(x) { return Math.max(X_MIN, Math.min(X_MAX, x)); }
function clampY(y) { return Math.max(Y_MIN, Math.min(Y_MAX, y)); }

/**
 * Build a single row of n pot centers, evenly spaced horizontally.
 * @param {number} n  pots in row
 * @param {number} y  top-edge y for the row
 * @returns {{x:number, y:number}[]}
 */
function row(n, y) {
  y = clampY(y);
  if (n === 1) return [{ x: Math.round(FRAME_W / 2), y: Math.round(y) }];
  // Evenly distribute: leftmost center at X_MIN, rightmost at X_MAX, n-1 gaps.
  const usable = X_MAX - X_MIN;
  const gap = usable / (n - 1);
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({ x: Math.round(clampX(X_MIN + i * gap)), y: Math.round(y) });
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// Pattern presets — each returns N pot top-left+center positions
// ═══════════════════════════════════════════════════════════════════════════

// All presets respect:
//   • Each pot center-x in [X_MIN, X_MAX] = [75, 315]
//   • Each pot top-y  in [Y_MIN, Y_MAX] = [10, 540]
//   • Adjacent rows ≥ POT_H + 2*MAX_JITTER_PX = 168 px apart so jittered
//     layouts never overlap (invariant verified by validateLayout test)
const PRESETS = {
  // N=2: horizontal pair, vertically centered (y_top = (FRAME_H - POT_H) / 2 = 270)
  2: () => row(2, 270),

  // N=3: triangle — 2 top, 1 below center. Row gap = 250.
  3: () => [
    ...row(2, 50),
    { x: Math.round(FRAME_W / 2), y: 300 }
  ],

  // N=4: 2×2 grid. Row gap = 220.
  4: () => [
    ...row(2, 80),
    ...row(2, 300)
  ],

  // N=5: 2-2-1 stack. Row gap = 180.
  5: () => [
    ...row(2, 40),
    ...row(2, 220),
    { x: Math.round(FRAME_W / 2), y: 400 }
  ],

  // N=6: 2×3 grid. Row gap = 170 (> 168 threshold).
  6: () => [
    ...row(2, 30),
    ...row(2, 200),
    ...row(2, 370)
  ],

  // N=7: 1 apex + 2-2-2 stack. Row gap = 170.
  7: () => [
    { x: Math.round(FRAME_W / 2), y: 10 },
    ...row(2, 180),
    ...row(2, 350),
    ...row(2, 520)
  ],

  // N=8: 2×4 grid. Row gap = 170.
  8: () => [
    ...row(2, 10),
    ...row(2, 180),
    ...row(2, 350),
    ...row(2, 520)
  ],

  // N=9: 3×3 grid. Row gap = 260.
  9: () => [
    ...row(3, 10),
    ...row(3, 270),
    ...row(3, 530)
  ],
};

// ═══════════════════════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate pot layout for N pots.
 * @param {number} n  Number of pots (2..9)
 * @param {object} [opts]
 *   @param {number} [opts.jitter] 0..1 — applies seeded random offset (max ±8px)
 *   @param {number} [opts.seed]   Seed for jitter
 *   @param {string} [opts.pattern] Force preset key (defaults to N)
 * @returns {{x:number, y:number}[]}
 *   x = pot center (horizontal), y = pot top edge (vertical).
 *   Matches the contract consumed by kvtm_2_0_game.html.
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
 * Verify a potLayout satisfies the contract (in-bounds, no overlap).
 * @param {{x,y}[]} layout
 * @returns {string[]} array of issues (empty = valid)
 */
function validateLayout(layout) {
  const issues = [];
  layout.forEach((p, i) => {
    if (p.x < X_MIN || p.x > X_MAX) issues.push(`Pot #${i}: x=${p.x} out of [${X_MIN},${X_MAX}]`);
    if (p.y < Y_MIN || p.y > Y_MAX) issues.push(`Pot #${i}: y=${p.y} out of [${Y_MIN},${Y_MAX}]`);
  });
  // Check pairwise overlap: pots overlap if bounding boxes intersect.
  for (let i = 0; i < layout.length; i++) {
    for (let j = i + 1; j < layout.length; j++) {
      const a = layout[i], b = layout[j];
      const xOverlap = Math.abs(a.x - b.x) < POT_W;
      const yOverlap = Math.abs(a.y - b.y) < POT_H;
      if (xOverlap && yOverlap) {
        issues.push(`Pots #${i} & #${j} overlap: Δx=${Math.abs(a.x-b.x)}<${POT_W}, Δy=${Math.abs(a.y-b.y)}<${POT_H}`);
      }
    }
  }
  return issues;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    layoutPots, validateLayout, PRESETS,
    FRAME_W, FRAME_H, POT_W, POT_H,
    X_MIN, X_MAX, Y_MIN, Y_MAX,
  };
}

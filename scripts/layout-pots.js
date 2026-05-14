// Pot layout generator. Given N pots, return [{x, y}, ...] in phone-frame
// coordinates (390 × 844, compact pot = 114 × 160).
//
// Layout area = ~390 wide × 600 tall (HUD takes ~120 top, footer takes ~80).
// Place pot CENTER at (x,y); CSS positions pot via transform: translate(-50%,-50%).

const FRAME_W = 390;
const PLAY_TOP = 180;   // below HUD
const PLAY_BOTTOM = 760;// above footer
const POT_W = 114;
const POT_H = 160;
const PAD_X = 20;

// Helpers ---------------------------------------------------------------
function row(xs, y) { return xs.map(x => ({ x: Math.round(x), y: Math.round(y) })); }
function evenRow(n, y) {
  // n pots evenly spaced across frame width, respecting horizontal padding.
  const usable = FRAME_W - 2 * PAD_X - POT_W;
  if (n === 1) return [{ x: Math.round(FRAME_W / 2), y: Math.round(y) }];
  const gap = usable / (n - 1);
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({ x: Math.round(PAD_X + POT_W / 2 + i * gap), y: Math.round(y) });
  }
  return out;
}

// Pattern presets -------------------------------------------------------
const PRESETS = {
  // 2 pots: side by side, mid screen
  2: () => evenRow(2, 380),

  // 3 pots: triangle — 2 top, 1 below centered
  3: () => [
    ...evenRow(2, 300),
    { x: FRAME_W / 2, y: 480 }
  ],

  // 4 pots: 2x2 grid
  4: () => [
    ...evenRow(2, 290),
    ...evenRow(2, 490)
  ],

  // 5 pots: top row 2, middle 2, bottom 1 (pentagon-ish)
  5: () => [
    ...evenRow(2, 260),
    ...evenRow(2, 430),
    { x: FRAME_W / 2, y: 600 }
  ],

  // 6 pots: 2x3 grid (2 wide × 3 tall)
  6: () => [
    ...evenRow(2, 240),
    ...evenRow(2, 410),
    ...evenRow(2, 580)
  ],

  // 7 pots: 2-2-2 + 1 centered top
  7: () => [
    { x: FRAME_W / 2, y: 200 },
    ...evenRow(2, 330),
    ...evenRow(2, 480),
    ...evenRow(2, 630)
  ],

  // 8 pots: 2x4 grid (tight, last row may need scroll on some screens)
  8: () => [
    ...evenRow(2, 230),
    ...evenRow(2, 370),
    ...evenRow(2, 510),
    ...evenRow(2, 650)
  ],

  // 9 pots: 3x3 grid (smaller pots probably needed; this uses compact)
  9: () => {
    const ys = [240, 410, 580];
    return ys.flatMap(y => evenRow(3, y));
  },
};

/**
 * Generate pot layout for N pots.
 * @param {number} n  Number of pots (2..9)
 * @param {object} opts  Optional overrides:
 *   { jitter: 0..1 }  Add small random offset for organic feel (deterministic via seed)
 *   { seed: number }  Seed for jitter
 *   { pattern: '2'|'3'|... }  Force pattern (default = N)
 * @returns {[{x, y}]}  Center positions in phone-frame px
 */
function layoutPots(n, opts = {}) {
  const pattern = opts.pattern || String(n);
  const preset = PRESETS[pattern];
  if (!preset) throw new Error(`No layout preset for ${n} pots (have: ${Object.keys(PRESETS).join(',')})`);
  let positions = preset();

  if (opts.jitter && opts.jitter > 0) {
    let seed = opts.seed || 1;
    const rand = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    const max = Math.min(12, opts.jitter * 12);
    positions = positions.map(p => ({
      x: Math.round(p.x + (rand() - 0.5) * 2 * max),
      y: Math.round(p.y + (rand() - 0.5) * 2 * max),
    }));
  }

  return positions;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { layoutPots, PRESETS, FRAME_W, POT_W, POT_H };
}

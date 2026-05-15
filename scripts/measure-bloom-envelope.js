// Measure bloom envelope from actual flower sprite alpha channel.
//
// Goal: compute how far the visible bloom pixels extend BEYOND the geometric
// pot bbox after CSS transforms are applied. Output is the "padding" to add
// to POT_W / POT_H to get the visual envelope, used by scripts/layout-pots.js
// to prevent neighbor blooms from visually overlapping.
//
// Pipeline:
//   1. For each color: read flower_<color>.png + bloom_rects_<color>.json
//   2. Extract frame 9 (full bloom) sub-rect
//   3. Alpha-scan → tight visual bbox in sheet pixels (ignores transparent pad)
//   4. Project to canvas display coords (width = --sb-flower-w-side, etc.)
//   5. Apply CSS transform per pos (scale → rotate → translateY oy → translateX(-50%))
//      around transform-origin (50%, 95%)
//   6. Compute final bbox in pot cell coords
//   7. Take worst-case across all pos × all colors
//   8. Write data/bloom_envelope.json
//
// Run: `node scripts/measure-bloom-envelope.js`
//
// CSS values are hard-coded below; refresh them if engine/sort_blossom.css
// `.sb-compact` / `.sb-tighter` changes.

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ASSETS_DIR = path.join(__dirname, '..', 'assets', 'sort_blossom');
const OUT_PATH   = path.join(__dirname, '..', 'data', 'bloom_envelope.json');

// ─── CSS modes (mirror engine/sort_blossom.css) ─────────────────────────
// pos_ox / pos_oy / pos_sc are PER-SLOT offsets (s0_*, s1_*, s2_*).
// angle in degrees (CSS `rotate(...)`). flowerW = --sb-flower-w-*.
const MODES = {
  compact: {
    pot_w: 114,
    pot_h: 160,
    flower_bottom: 40,
    active_h: 110,
    stem_x: 4,
    stem_spread: 10,
    angle: 43,
    pos: [
      // pos 0 (left)
      { flowerW: 85, angle: -43, ox: 7,  oy: -12, sc: 0.85, sideCx: -1 }, // sideCx = stem_x - stem_spread
      // pos 1 (mid)
      { flowerW: 74, angle:   0, ox: 3,  oy: -3,  sc: 1.00, sideCx:  0 }, // sideCx = stem_x (no spread)
      // pos 2 (right)
      { flowerW: 85, angle: 43,  ox: 2,  oy: -5,  sc: 0.85, sideCx:  1 },
    ],
  },
  // Tighter mode for N>=10 levels — smaller blooms + symmetrized stem.
  // These are PROPOSED values; final tuned after measurement run.
  tighter: {
    pot_w: 96,
    pot_h: 135,
    flower_bottom: 34,
    active_h: 93,
    stem_x: 0,        // SYMMETRIC (no center shift)
    stem_spread: 9,
    angle: 43,
    pos: [
      { flowerW: 70, angle: -43, ox: 0,  oy: -10, sc: 0.85, sideCx: -1 },
      { flowerW: 62, angle:   0, ox: 0,  oy: -3,  sc: 1.00, sideCx:  0 },
      { flowerW: 70, angle: 43,  ox: 0,  oy: -4,  sc: 0.85, sideCx:  1 },
    ],
  },
};

const COLORS = ['blue', 'camellia', 'orange', 'pink', 'purple', 'red', 'white', 'yellow'];

// ═══════════════════════════════════════════════════════════════════════
// Step 1-3: Tight alpha bbox per color, in sheet pixel coords
// ═══════════════════════════════════════════════════════════════════════

async function tightVisualRect(color) {
  const rectsPath = path.join(ASSETS_DIR, `bloom_rects_${color}.json`);
  const meta = JSON.parse(fs.readFileSync(rectsPath, 'utf8'));
  const pngPath = path.join(ASSETS_DIR, `flower_${color}_bloom.png`);
  const frameIdx = Math.min(9, meta.rects.length - 1);
  const [sx, sy, sw, sh] = meta.rects[frameIdx];

  const { data, info } = await sharp(pngPath)
    .extract({ left: sx, top: sy, width: sw, height: sh })
    .raw()
    .toBuffer({ resolveWithObject: true });

  if (info.channels < 4) {
    // No alpha → assume the full rect is visible.
    return { color, vL: 0, vT: 0, vR: sw, vB: sh, cw: sw, ch: sh };
  }

  const ALPHA_THRESHOLD = 20; // 0..255; anything dimmer counts as transparent
  let vL = sw, vT = sh, vR = 0, vB = 0;
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const a = data[(y * sw + x) * info.channels + 3];
      if (a >= ALPHA_THRESHOLD) {
        if (x < vL) vL = x;
        if (x > vR) vR = x;
        if (y < vT) vT = y;
        if (y > vB) vB = y;
      }
    }
  }
  if (vL > vR || vT > vB) {
    // entirely transparent — shouldn't happen for full-bloom frame
    return { color, vL: 0, vT: 0, vR: sw, vB: sh, cw: sw, ch: sh };
  }
  // tight visual rect inside the canvas (canvas dim = sw × sh, since render
  // does cv.width=sw, cv.height=sh via drawImage 0,0,w,h scaling)
  return { color, vL, vT, vR: vR + 1, vB: vB + 1, cw: sw, ch: sh };
}

// ═══════════════════════════════════════════════════════════════════════
// Step 4-6: Project tight visual rect through CSS transform into pot cell
// ═══════════════════════════════════════════════════════════════════════

/**
 * Compute axis-aligned bbox of one flower (one pos) in pot cell coords.
 *
 * @param {object} visual  { vL, vT, vR, vB, cw, ch } — tight rect in canvas pixels
 * @param {object} mode    MODES[*]
 * @param {object} posCfg  one of mode.pos
 * @returns {{xmin,xmax,ymin,ymax}} in pot cell coords (origin = top-left of pot)
 */
function projectFlowerBbox(visual, mode, posCfg) {
  // Canvas DISPLAY dimensions (CSS width × height auto)
  const dispW = posCfg.flowerW;
  const dispH = dispW * (visual.ch / visual.cw);
  const scale = dispW / visual.cw;

  // Tight visual rect in canvas DISPLAY coords (top-left origin)
  const dvL = visual.vL * scale;
  const dvT = visual.vT * scale;
  const dvR = visual.vR * scale;
  const dvB = visual.vB * scale;

  // Transform-origin in canvas-local coords (CSS: 50% 95%)
  const Ox = dispW / 2;
  const Oy = dispH * 0.95;

  // Center X in pot cell (matches CSS `left: calc(50% + stem_x ± stem_spread + ox)`
  //   plus `transform: translateX(-50%)` which centers element at that left value)
  // mode.stem_x + side * mode.stem_spread + posCfg.ox
  const cssLeft = mode.pot_w / 2 + mode.stem_x + posCfg.sideCx * mode.stem_spread + posCfg.ox;
  // Canvas top in pot cell:
  //   active-flowers spans pot_h - flower_bottom - active_h .. pot_h - flower_bottom
  //   canvas anchored bottom: 0 of active-flowers → canvas bottom at pot_h - flower_bottom
  //   canvas top at pot_h - flower_bottom - dispH
  const canvasTopY = mode.pot_h - mode.flower_bottom - dispH;

  // Apply CSS transform (scale → rotate → translateY(oy) → translateX(-50%))
  // around transform-origin O. translateX(-50%) is absorbed into element
  // positioning via cssLeft as CENTER (not left), so net x offset = 0 after
  // the centering convention.
  const θ = posCfg.angle * Math.PI / 180;
  const cos = Math.cos(θ);
  const sin = Math.sin(θ);

  // For each corner of the visual rect, compute final pot cell position.
  const corners = [
    [dvL, dvT], [dvR, dvT], [dvR, dvB], [dvL, dvB],
  ];
  let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
  for (const [cx, cy] of corners) {
    // Local point relative to origin
    const lx = cx - Ox;
    const ly = cy - Oy;
    // Scale
    const sx = posCfg.sc * lx;
    const sy = posCfg.sc * ly;
    // Rotate (CSS rotate: positive = clockwise, but math y is downward,
    // so clockwise screen rotation matches mathematical R(θ) with std y-up
    // inverted — i.e., for our top-left coord system, CSS rotate(θ) corresponds
    // to applying matrix [[cos,-sin],[sin,cos]] which is what we have).
    const rx = sx * cos - sy * sin;
    const ry = sx * sin + sy * cos;
    // Translate (Y by oy, X net = 0 because translateX(-50%) absorbed into centering)
    const tx = rx;
    const ty = ry + posCfg.oy;
    // Back to canvas-local (add origin), then add canvas top-left in pot cell.
    // canvas left-edge in pot cell = cssLeft - dispW/2 (since cssLeft is center)
    const potX = cssLeft - dispW / 2 + (Ox + tx);
    const potY = canvasTopY + (Oy + ty);
    if (potX < xmin) xmin = potX;
    if (potX > xmax) xmax = potX;
    if (potY < ymin) ymin = potY;
    if (potY > ymax) ymax = potY;
  }
  return { xmin, xmax, ymin, ymax };
}

// ═══════════════════════════════════════════════════════════════════════
// Step 7-8: Aggregate worst-case across all colors × all pos, write JSON
// ═══════════════════════════════════════════════════════════════════════

function envelopeFromBoxes(boxes, mode) {
  let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
  for (const b of boxes) {
    if (b.xmin < xmin) xmin = b.xmin;
    if (b.xmax > xmax) xmax = b.xmax;
    if (b.ymin < ymin) ymin = b.ymin;
    if (b.ymax > ymax) ymax = b.ymax;
  }
  return {
    pad_left:  Math.max(0, Math.ceil(-xmin)),
    pad_right: Math.max(0, Math.ceil(xmax - mode.pot_w)),
    pad_top:   Math.max(0, Math.ceil(-ymin)),
    pad_bot:   Math.max(0, Math.ceil(ymax - mode.pot_h)),
    raw: { xmin, xmax, ymin, ymax },
  };
}

async function measureMode(modeName) {
  const mode = MODES[modeName];
  console.log(`\n── Mode: ${modeName} ─────────────────────────────────`);
  console.log(`  pot ${mode.pot_w}×${mode.pot_h}, flower_w_side=${mode.pos[0].flowerW}, stem_x=${mode.stem_x}`);
  const allBoxes = [];
  for (const color of COLORS) {
    const visual = await tightVisualRect(color);
    for (let pi = 0; pi < 3; pi++) {
      const bb = projectFlowerBbox(visual, mode, mode.pos[pi]);
      allBoxes.push({ ...bb, color, pos: pi });
    }
  }
  const env = envelopeFromBoxes(allBoxes, mode);
  console.log(`  envelope raw   x∈[${env.raw.xmin.toFixed(1)},${env.raw.xmax.toFixed(1)}] y∈[${env.raw.ymin.toFixed(1)},${env.raw.ymax.toFixed(1)}]`);
  console.log(`  pot bbox       x∈[0,${mode.pot_w}] y∈[0,${mode.pot_h}]`);
  console.log(`  pad L/R/T/B    ${env.pad_left} / ${env.pad_right} / ${env.pad_top} / ${env.pad_bot}`);
  console.log(`  effective_w    ${mode.pot_w + env.pad_left + env.pad_right}`);
  console.log(`  effective_h    ${mode.pot_h + env.pad_top + env.pad_bot}`);

  // Per-pos breakdown (max across colors)
  for (let pi = 0; pi < 3; pi++) {
    const posBoxes = allBoxes.filter(b => b.pos === pi);
    const pEnv = envelopeFromBoxes(posBoxes, mode);
    console.log(`    pos ${pi}: L+${pEnv.pad_left} R+${pEnv.pad_right} T+${pEnv.pad_top} B+${pEnv.pad_bot}`);
  }
  return {
    pot_w: mode.pot_w,
    pot_h: mode.pot_h,
    pad_left: env.pad_left,
    pad_right: env.pad_right,
    pad_top: env.pad_top,
    pad_bot: env.pad_bot,
    effective_w: mode.pot_w + env.pad_left + env.pad_right,
    effective_h: mode.pot_h + env.pad_top + env.pad_bot,
    raw: env.raw,
    measured_at: new Date().toISOString(),
  };
}

async function main() {
  const result = {};
  for (const name of Object.keys(MODES)) {
    result[name] = await measureMode(name);
  }
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(result, null, 2));
  console.log(`\n✓ Wrote ${path.relative(process.cwd(), OUT_PATH)}`);
}

if (require.main === module) {
  main().catch(err => { console.error(err); process.exit(1); });
}

module.exports = { MODES, projectFlowerBbox, tightVisualRect };

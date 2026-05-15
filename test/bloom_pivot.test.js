// Phase 3 pivot tests — verify default pivot fallback (matches legacy
// bottom-align) and explicit pivot math.
const test = require('node:test');
const assert = require('node:assert/strict');

// Mirror of engine _getRectPivot
function getRectPivot(rect) {
  const sw = rect[2], sh = rect[3];
  const px = (typeof rect[6] === 'number') ? rect[6] : sw / 2;
  const py = (typeof rect[7] === 'number') ? rect[7] : sh;
  return { px, py };
}

// ── Default fallback ────────────────────────────────────────────
test('default pivot (no rect[6,7]) → bottom-center', () => {
  const r = [10, 20, 80, 100, 0, 0];
  const p = getRectPivot(r);
  assert.equal(p.px, 40);   // sw/2
  assert.equal(p.py, 100);  // sh (bottom)
});

test('default pivot for legacy 4-element rect', () => {
  const r = [0, 0, 50, 60];
  const p = getRectPivot(r);
  assert.equal(p.px, 25);
  assert.equal(p.py, 60);
});

// ── Explicit pivot ─────────────────────────────────────────────
test('explicit pivot honored', () => {
  const r = [10, 20, 80, 100, 0, 0, 35, 95];
  const p = getRectPivot(r);
  assert.equal(p.px, 35);
  assert.equal(p.py, 95);
});

test('explicit pivot 0 (top-left edge) honored', () => {
  const r = [0, 0, 50, 60, 0, 0, 0, 0];
  const p = getRectPivot(r);
  assert.equal(p.px, 0);
  assert.equal(p.py, 0);
});

// ── Frame placement math (drawFrame) ────────────────────────────
// New formula: ox = refX - pivotDrawX, oy = refY - pivotDrawY
// where pivotDrawX = pxSheet * (dw/sw), pivotDrawY = pySheet * (dh/sh).
function framePlace(rect, refX, refY, cssW, sc_css) {
  const [sx, sy, sw, sh] = rect;
  const dw = Math.round(cssW * sc_css);
  const dh = Math.round(cssW * sc_css * sh / sw);
  const { px: pxSheet, py: pySheet } = getRectPivot(rect);
  const pivotDrawX = pxSheet * (dw / sw);
  const pivotDrawY = pySheet * (dh / sh);
  return {
    ox: Math.round(refX - pivotDrawX),
    oy: Math.round(refY - pivotDrawY),
    dw, dh,
  };
}

test('framePlace: default pivot matches legacy bottom-center', () => {
  // Legacy: ox = PAD + (cssW-dw)/2, oy = PAD + cssH - dh
  // With refX=PAD+cssW/2, refY=PAD+cssH and default pivot (sw/2, sh):
  //   pivotDrawX = (sw/2)*(dw/sw) = dw/2 → ox = PAD+cssW/2 - dw/2 = PAD+(cssW-dw)/2 ✓
  //   pivotDrawY = sh*(dh/sh) = dh → oy = PAD+cssH - dh ✓
  const PAD = 50, cssW = 80, cssH = 100;
  const rect = [10, 20, 75, 114];   // legacy 4-element
  const r = framePlace(rect, PAD + cssW/2, PAD + cssH, cssW, 1);
  // Expected from legacy formula
  const dw_expect = Math.round(cssW * 1);                       // 80
  const dh_expect = Math.round(cssW * 1 * 114 / 75);            // 152
  const ox_expect = PAD + Math.round((cssW - dw_expect) / 2);   // 50 + 0 = 50
  const oy_expect = PAD + cssH - dh_expect;                     // 50 + 100 - 152 = -2
  assert.equal(r.ox, ox_expect);
  assert.equal(r.oy, oy_expect);
});

test('framePlace: explicit pivot shifts frame to align', () => {
  // If pivot py = sh - 4 (4 px above bottom edge), frame should sit
  // 4 px LOWER (in scaled units) so pivot still lands at reference.
  const PAD = 50, cssW = 100, cssH = 120;
  const refY = PAD + cssH;
  const rectDefault = [0, 0, 100, 120];                  // py default = 120
  const rectShifted = [0, 0, 100, 120, 0, 0, 50, 116];   // py = 116 (4 above bottom)
  const a = framePlace(rectDefault, PAD + cssW/2, refY, cssW, 1);
  const b = framePlace(rectShifted, PAD + cssW/2, refY, cssW, 1);
  // sc=1 → pivotDrawY for shifted = 116. oy = refY - 116 = PAD+4
  // For default = 120 → oy = refY - 120 = PAD
  // So shifted frame oy = default oy + 4
  assert.equal(b.oy - a.oy, 4);
});

test('framePlace: pivot at center of frame → frame centered on ref', () => {
  const PAD = 0;
  const cssW = 100;
  const refX = cssW / 2;
  const refY = 50;   // arbitrary
  const rect = [0, 0, 100, 100, 0, 0, 50, 50];   // pivot at center
  const r = framePlace(rect, refX, refY, cssW, 1);
  // pivotDrawX = 50, pivotDrawY = 50
  // ox = refX - 50 = 0, oy = refY - 50 = 0
  assert.equal(r.ox, 0);
  assert.equal(r.oy, 0);
});

// ── Nu vs Bong alignment regression ────────────────────────────
test('nụ with padding-below-stem aligns to flower stem via pivot', () => {
  // Real-world scenario: Bud rect 75x114 with stem-base pixel at y=110 (4px padding)
  //                     Flower rect 97x126 with stem at y=125 (1px padding)
  // Without explicit pivot → both bottom-align at rect bottom → 4px misalignment
  // With explicit pivot → stems converge at same reference Y → no misalignment
  const refY = 200;
  const cssW = 80;

  // Without pivot
  const budDefault = framePlace([0,0,75,114], cssW/2, refY, cssW, 1);
  const flowerDefault = framePlace([0,0,97,126], cssW/2, refY, cssW, 1);
  // bud's bottom = oy + dh. Should equal refY (rounded).
  const budBottomDefault = budDefault.oy + budDefault.dh;
  const flowerBottomDefault = flowerDefault.oy + flowerDefault.dh;
  // Both bottoms at refY — but stem PIXEL inside frame may differ
  assert.ok(Math.abs(budBottomDefault - refY) <= 1);
  assert.ok(Math.abs(flowerBottomDefault - refY) <= 1);

  // With explicit pivot pointing at stem-base PIXEL
  const budPivot    = framePlace([0,0,75,114,0,0, 37, 110], cssW/2, refY, cssW, 1);
  const flowerPivot = framePlace([0,0,97,126,0,0, 48, 125], cssW/2, refY, cssW, 1);
  // Pivot Y in draw coords
  const scBud    = cssW / 75;
  const scFlower = cssW / 97;
  const budStemY    = budPivot.oy    + 110 * scBud;
  const flowerStemY = flowerPivot.oy + 125 * scFlower;
  // BOTH stem-pixel positions converge at refY
  assert.ok(Math.abs(budStemY    - refY) <= 1, `bud stem Y ${budStemY} != ${refY}`);
  assert.ok(Math.abs(flowerStemY - refY) <= 1, `flower stem Y ${flowerStemY} != ${refY}`);
});

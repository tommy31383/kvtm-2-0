# Pot Layout Standard — KVTM 2.0

Định nghĩa duy nhất cho tọa độ pot trong level data (`potLayout` field).
Source-of-truth file: [`scripts/layout-pots.js`](../scripts/layout-pots.js).

Run `node scripts/layout-pots.js report` để in bảng đầy đủ.

## Khoảng cách bắt buộc

| Khoảng cách | Giá trị | Ý nghĩa |
|---|---|---|
| `EDGE_PAD_X` | **14 px** | Pot edge ↔ frame left/right edge |
| `EDGE_PAD_TOP` | **12 px** | Pot top ↔ container top |
| `EDGE_PAD_BOT` | **18 px** | Pot bottom ↔ container bottom |
| `POT_GAP_X` | **8 px** | Edge-to-edge giữa 2 pot CÙNG hàng |
| `POT_GAP_Y` | **10 px** | Edge-to-edge giữa pot hàng trên và pot hàng dưới |
| `MAX_JITTER_PX` | **3 px** | Random offset tối đa (≤ POT_GAP/2 - 1 → không bao giờ overlap) |

**Vì sao gap nhỏ cho N=9?** Frame 390×700 = 273K px². 9 pot × 114×160 = 164K px² = 60% area. Còn lại 40% chia cho 8 gaps × 2 axes + edges = không có chỗ cho gap rộng. Đây là physics, không phải design choice.

Muốn gap rộng hơn? 3 lựa chọn:
- (a) Cap level designs ≤ 6 pot → gaps ≥ 24 px tự nhiên
- (b) Shrink pot CSS (thêm class `.sb-tighter` 90×130) cho level ≥7 pot
- (c) Chấp nhận tight gaps cho high N (current)

## Coordinate contract

```
┌─────────────────────────────┐ y=0 (top of #blv2-pots container)
│  ↕ EDGE_PAD_TOP = 12        │
│   ┌────┐ POT_GAP_X ┌────┐   │
│ ↔ │ Pot│   = 8 px  │ Pot│ ↔ │ EDGE_PAD_X = 14 each side
│   │    │           │    │   │ POT_W = 114, POT_H = 160
│   └────┘           └────┘   │
│       ↕ POT_GAP_Y = 10      │
│   ┌────┐           ┌────┐   │
│   │ Pot│           │ Pot│   │
│   └────┘           └────┘   │
│  ↕ EDGE_PAD_BOT = 18        │
└─────────────────────────────┘
         FRAME_W = 390 × FRAME_H = 700
```

**Reference frame:** the `#blv2-pots` container inside `#phone-frame`.

**Pot dimensions** (`.sb-compact`):
- Width: 114 px (`--sb-pot-w`)
- Height: 160 px (`--sb-pot-h`)

**`potLayout[i] = { x, y }`:**
| Field | Meaning |
|---|---|
| `x` | **horizontal CENTER** of pot. CSS: `left:${x/390*100}%` + `margin-left:calc(-pot_w/2)` |
| `y` | **top EDGE** of pot. CSS: `top:${y/700*100}%` |

Asymmetry intentional — matches CSS at [kvtm_2_0_game.html:6371-6378](../kvtm_2_0_game.html#L6371).

## Safe zones (derived)

```
X_MIN = POT_W/2 + EDGE_PAD_X    = 57 + 14   =  71
X_MAX = FRAME_W - POT_W/2 - EDGE_PAD_X = 390-57-14 = 319
Y_MIN = EDGE_PAD_TOP                       =  12
Y_MAX = FRAME_H - POT_H - EDGE_PAD_BOT = 700-160-18 = 522
```

Max grid khả thi: **3 cols × 4 rows = 12 pot** (N ≤ 12, dùng N=10-12 cho hard levels).

## Khoảng cách thực tế từng preset

(`node scripts/layout-pots.js report`)

| N | Edge L | Edge R | Edge T | Edge B | minGap X (same row) | minGap Y (row-to-row) |
|---|---|---|---|---|---|---|
| 2 | 77 | 77 | 270 | 270 |  8 | — |
| 3 | 77 | 77 | 182 | 188 |  8 | 10 |
| 4 | 77 | 77 | 182 | 188 |  8 | 10 |
| 5 | 77 | 77 |  97 | 103 |  8 | 10 |
| 6 | 77 | 77 |  97 | 103 |  8 | 10 |
| 7 | 77 | 77 |  12 |  18 |  8 | 10 |
| 8 | 77 | 77 |  12 |  18 |  8 | 10 |
| 9 | 16 | 16 |  97 | 103 |  8 | 10 |
| 10 | 16 | 16 |  12 |  18 |  8 | 10 |
| 11 | 16 | 16 |  12 |  18 |  8 | 10 |
| 12 | 16 | 16 |  12 |  18 |  8 | 10 |

**Quan sát:**
- N=2..8: chỉ 1 row hoặc 2 cột → edge X = 77 (rộng rãi)
- N=9 (3×3): edge X chỉ 16 → pot gần biên trái/phải
- N=7..8 (4 rows): edge top/bottom 12-18 → pot gần biên trên/dưới
- minGap luôn = 8 hoặc 10 → đảm bảo no overlap, no overflow

## Patterns (N=2..12)

| N | Pattern | Hàng |
|---|---|---|
| 2 | Side-by-side, centered | 1 row |
| 3 | Triangle (2 top, 1 bottom centered) | 2 rows |
| 4 | 2×2 grid | 2 rows |
| 5 | 2-2-1 stack | 3 rows |
| 6 | 2×3 grid | 3 rows |
| 7 | 1 apex + 2-2-2 stack | 4 rows |
| 8 | 2×4 grid | 4 rows |
| 9 | 3×3 grid | 3 rows |
| 10 | 3-3-3-1 stack | 4 rows |
| 11 | 3-3-3-2 stack | 4 rows |
| 12 | 3×4 grid (max density) | 4 rows |

**Hard levels (N=10-12)** dùng 3-col packing × 4-row stack. Vừa khít frame vertically: `4×160 + 3×10 + 12 + 18 = 700`.

## Bloom envelope (visual fan của 3 bông full)

CSS `.sb-compact` được thiết kế để 3 bông nở **xoè ra như fan** từ gốc stem chung:
- Pos 0 (trái): canvas rotate `-43°` quanh pivot `(50%, 95%)` → đầu bông lệch trái
- Pos 1 (giữa): upright
- Pos 2 (phải): rotate `+43°` → đầu bông lệch phải

Visual envelope (đo bằng `scripts/measure-bloom-envelope.js`, ghi vào `data/bloom_envelope.json`):

| Mode | Pot bbox | Pad L / R / T / B | Effective W × H |
|---|---|---|---|
| `.sb-compact` (current) | 114 × 160 | **36 / 52 / 0 / 0** | 202 × 160 |
| `.sb-tighter` (reserved) | 96 × 135 | 38 / 38 / 0 / 0 | 172 × 135 |

**Key insight**: bloom envelope **vượt pot bbox 52px sang phải, 36px sang trái** (compact mode, do `stem_x=4` lệch tâm). Hai pot side-by-side với `POT_GAP_X=8` (pot center distance = 122) sẽ có fan bloom **giao thoa visually ~30-45px** — đây là **design intent**, không phải bug:

- **Pot bbox (114×160) không overlap** ✓ — đảm bảo bởi `POT_GAP_X` / `POT_GAP_Y`
- **Pot rim** (terracotta `--sb-pot-img-w=82`) cách nhau ≥40px → rõ ràng visually
- **Hit zone tap** = pot cell 114×160 → tap không nhầm sang pot khác
- **Fan blooms** giữa pot cạnh nhau giao thoa "trên không" → look đẹp tự nhiên (vườn rậm)

Visual fan overlap count theo N (informational, từ `describeBloomOverlap()`):

| N  | bloom-fan pairs giao thoa |
|----|---|
| 2-3 | 1 |
| 4-5 | 2 |
| 6-7 | 3 |
| 8 | 4 |
| 9-10 | 6 |
| 11 | 7 |
| 12 | 8 |

Số này tăng tuyến tính với N — **không cần "fix"**. Ngược lại, nếu muốn DECREASE fan overlap, options:
1. Reduce `--sb-flower-w-side` (làm bông nhỏ lại) → giảm độ xoè
2. Reduce CSS rotation angle (`--sb-flower-angle: 43° → ví dụ 30°`) → fan hẹp hơn
3. Đổi sang `.sb-tighter` mode cho high-N (đã định nghĩa, chưa wire vào game)

## Re-measure bloom envelope

Khi CSS `.sb-compact` thay đổi (flower size, angle, stem offsets):
```bash
node scripts/measure-bloom-envelope.js  # cập nhật data/bloom_envelope.json
node scripts/layout-pots.js report      # xem effective_w mới
```

## Validation

```js
const { validateLayout } = require('./scripts/layout-pots.js');

// HARD check only — fails on overlap or out-of-bounds. Jittered layouts OK.
validateLayout(layout);

// STRICT — also fails when gaps < POT_GAP_X / POT_GAP_Y (target).
// Use this to validate presets (without jitter).
validateLayout(layout, { strict: true });
```

## Jitter

- `MAX_JITTER_PX = 3` (cứng) ≤ `min(POT_GAP_X, POT_GAP_Y) / 2 - 1`
- Đảm bảo: dù jitter ±3, gap edge-to-edge vẫn ≥ POT_GAP - 6 = 2 px (vẫn tách rõ visually)
- Deterministic per seed
- Clamp trong safe zone

## Tune lại constants

Mở [`scripts/layout-pots.js`](../scripts/layout-pots.js) phần CONSTANTS đầu file. Mỗi lần đổi:
1. `node scripts/layout-pots.js report` → xem gap mới
2. `npm test` → đảm bảo invariants vẫn pass
3. Reload game → verify visual

Constants liên quan nhau:
```
3 cols cần:  3 × POT_W + 2 × POT_GAP_X + 2 × EDGE_PAD_X ≤ FRAME_W
              3 × 114    + 2 × POT_GAP_X + 2 × EDGE_PAD_X ≤ 390
              POT_GAP_X + EDGE_PAD_X ≤ 24

4 rows cần:  4 × POT_H + 3 × POT_GAP_Y + EDGE_PAD_TOP + EDGE_PAD_BOT ≤ FRAME_H
              640        + 3 × POT_GAP_Y + EDGE_PAD_TOP + EDGE_PAD_BOT ≤ 700
              3 × POT_GAP_Y + EDGE_PAD_TOP + EDGE_PAD_BOT ≤ 60
```

## Existing 30 levels

Tutorial L1-3 không có `potLayout` → fallback flex auto-layout.
Mid levels có `potLayout` cũ (manually placed via editor) → vẫn render đúng vì validate là soft check, không re-generate.

Generated levels (L31+) sẽ luôn có `potLayout` từ pipeline này. Hard tier (L41+ chẳng hạn) có thể dùng N=10-12 để tăng difficulty thông qua spatial density.

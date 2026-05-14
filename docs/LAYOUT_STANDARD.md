# Pot Layout Standard — KVTM 2.0

Định nghĩa duy nhất cho tọa độ pot trong level data (`potLayout` field).

## Coordinate contract

```
┌─────────────────────────────┐ y=0 (top of #blv2-pots container)
│                             │
│   Y_MIN = 10 ──────────────┐│
│                            ││
│   ┌────┐    ┌────┐         ││ POT_W = 114
│   │ Pot│    │ Pot│         ││ POT_H = 160
│   │    │    │    │         ││
│   └────┘    └────┘         ││ Y_MAX = 540
│                            ││ (pot bottom = 700)
├────────────────────────────┤│
│ X_MIN=75       X_MAX=315   ││
└─────────────────────────────┘ y=700 (bottom)
0      FRAME_W=390
```

**Reference frame:** the `#blv2-pots` container inside `#phone-frame`.
- Width: 390 px (% of phone frame width)
- Height: 700 px (% of vertical play area below HUD)

**Pot dimensions** (`.sb-compact`):
- Width: 114 px (`--sb-pot-w`)
- Height: 160 px (`--sb-pot-h`)

**`potLayout[i] = { x, y }`:**
| Field | Meaning |
|---|---|
| `x` | **horizontal CENTER** of pot. CSS: `left:${x/390*100}%` + `margin-left:calc(-pot_w/2)` |
| `y` | **top EDGE** of pot. CSS: `top:${y/700*100}%` directly, no vertical offset |

Asymmetry is intentional — matches existing 30 levels & the CSS implementation at [kvtm_2_0_game.html:6371-6378](../kvtm_2_0_game.html#L6371).

## Safe zones

```
X_MIN = POT_W/2 + PAD_X       = 57 + 12  =  75
X_MAX = FRAME_W - POT_W/2 - PAD_X = 390-57-12 = 315
Y_MIN = PAD_TOP                          =  10
Y_MAX = FRAME_H - POT_H - PAD_BOT = 700-160-0 = 540
```

Any `{x, y}` outside these ranges = pot rendered partially off-screen.
`validateLayout()` in [scripts/layout-pots.js](../scripts/layout-pots.js) enforces.

## Non-overlap invariant

Pots overlap when both:
- `|Δx| < POT_W = 114`, AND
- `|Δy| < POT_H = 160`

All built-in presets keep adjacent rows ≥ 170 px apart (> 160 + 2×jitter_max).

## Preset patterns

| N pots | Pattern | Row tops |
|---|---|---|
| 2 | Side-by-side, mid-screen | y=270 |
| 3 | Triangle (2 top, 1 below center) | y=50, y=300 |
| 4 | 2×2 grid | y=80, y=300 |
| 5 | 2-2-1 stack | y=40, y=220, y=400 |
| 6 | 2×3 grid | y=30, y=200, y=370 |
| 7 | 1 apex + 2-2-2 stack | y=10 (apex), y=180, y=350, y=520 |
| 8 | 2×4 grid | y=10, y=180, y=350, y=520 |
| 9 | 3×3 grid | y=10, y=270, y=530 |

**Within each row:** pots distributed evenly between X_MIN and X_MAX. Single pot → x=195 (center).

## Jitter

```js
layoutPots(n, { jitter: 0..1, seed: number })
```
- Max offset: ±4 px (capped via `MAX_JITTER_PX`)
- Deterministic per `seed` (LCG)
- Stays within safe zone (clamped post-jitter)
- Cannot break the no-overlap invariant (170 - 8 = 162 > 160 = POT_H)

Use `jitter: 0` for clean grids, `0.3-0.7` for organic feel.

## Adding a new pattern

If you need a different visual (e.g. circular, asymmetric), extend `PRESETS` in [scripts/layout-pots.js](../scripts/layout-pots.js):

```js
PRESETS.flower = () => [
  { x: 195, y: 200 },                              // center
  { x: 195-70, y: 130 }, { x: 195+70, y: 130 },    // top petals
  { x: 195-70, y: 270 }, { x: 195+70, y: 270 },    // bottom petals
];
```

Then reference in spec:
```json
{ "id": 50, "pots": 5, "layout": "flower", ... }
```

`gen-level.js` will pick the named preset over the default-by-N.

**Required:** new presets must pass `validateLayout()` (in-bounds + no overlap). Add to `test/layout.test.js`.

## How specs become potLayout

```
levels/specs/foo.json    →   gen-level.js   →   data.js
  { pots: 5, ... }            layoutPots(5)        potLayout: [{x,y}, ...]
```

Generator always attaches `potLayout` so every generated level has explicit coordinates. No reliance on flex/auto layout (which had clutter at high pot counts).

## Existing 30 levels

Levels 1-30 in [engine/sort_blossom_data.js](../engine/sort_blossom_data.js) currently mix:
- Levels with explicit `potLayout` (added via level_editor tool)
- Levels without `potLayout` → game falls back to flex layout

When migrating to the standard:
1. Run `npm run gen -- --batch levels/specs/migrate_1_30.json --write` to regenerate (changes flower distributions; not recommended for tested levels).
2. OR write a one-off script that **only** adds `potLayout` to existing pot data, preserving game logic.

The pragmatic path: leave existing levels as-is, apply standard to **new** levels (L31+).

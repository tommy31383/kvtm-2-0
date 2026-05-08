# Cozy Match-3 / Diary Game — Design System v1

A complete spec for a cozy, warm, handwritten match-3 / decoration / storytelling game UI.
Use this as the canonical reference. Original "Crown & Cottage" theme — NOT a recreation of any branded UI.

---

## 1. DESIGN PRINCIPLES

1. **Cozy, not loud.** Desaturated warm palette. No pure white, no pure black, no high-saturation primaries.
2. **Handwritten, not typeset.** Display + body fonts are handwritten. Slight rotation (-1° to +1°) on cards/buttons/chips so nothing sits perfectly straight — it should feel personal, like a journal.
3. **Chunky silhouettes.** Every interactive surface has a thick warm-brown stroke + hard drop shadow + pillow highlight. No flat web buttons.
4. **One color, one job.** Each accent owns exactly one role. Don't mix roles.
5. **Scene is the hero.** UI hugs the edges. The illustration owns the middle.
6. **Diary mood.** Narration is part of the loop. Reward = a line in the diary, not just a coin number.

---

## 2. COLOR TOKENS

### Backgrounds & ink (warm, never pure)
| Token         | Hex       | Usage                                     |
|---------------|-----------|-------------------------------------------|
| `--paper`     | `#f6efe1` | Aged cream — primary background           |
| `--paper-2`   | `#ebe0c8` | Card stage / panel fills                  |
| `--paper-3`   | `#ddd0b3` | Locked/disabled fills, dividers           |
| `--cream`     | `#f8efd8` | Chip top gradient, nav center button base |
| `--ink`       | `#3a2a1c` | Warm dark brown — strokes, headlines      |
| `--ink-soft`  | `#6b5642` | Phone notch, subtle dark accents          |
| `--muted`     | `#8a7560` | Body copy, captions                       |

### Accent palette (each owns one job)
| Token            | Hex         | Job                                     |
|------------------|-------------|-----------------------------------------|
| `--moss`         | `#8aa872`   | **PRIMARY / PLAY** — Level, Continue    |
| `--moss-d`       | `#5e7c4a`   | Moss gradient bottom                    |
| `--mustard`      | `#e3b25a`   | **SECONDARY / BUILD / REWARD** — Tasks, New Area, stars, coins |
| `--mustard-d`    | `#b88830`   | Mustard gradient bottom                 |
| `--terracotta`   | `#d28464`   | **ALERT / LIVES** — hearts, badges, "!" |
| `--terracotta-d` | `#a85a3e`   | Terracotta gradient bottom              |
| `--denim`        | `#7a92a8`   | **NAV / INFO** — bottom nav, info modals|
| `--denim-d`      | `#4f6a82`   | Denim gradient bottom                   |
| `--sage`         | `#b8c8a8`   | Decoration only (icons, accents)        |
| `--rose`         | `#d8a8a0`   | Decoration only (stickers)              |

**Rule:** moss = play, mustard = build/reward, terra = alert/lives, denim = nav. Do not mix jobs.

### Gradients (3-stop on buttons, 2-stop elsewhere)
- Button gradient pattern: `linear-gradient(180deg, [light 0%], [base 50%], [dark 100%])`
  - Moss: `#a3c08a → #8aa872 → #5e7c4a`
  - Mustard: `#efc97a → #e3b25a → #b88830`
  - Terracotta: `#e8a088 → #d28464 → #a85a3e`
  - Denim: `#9aaec0 → #7a92a8 → #4f6a82`
- Chip gradient: `linear-gradient(180deg, var(--cream), var(--paper-2))`

---

## 3. TYPOGRAPHY

Three handwritten fonts, each with a job. Never use system sans for player-facing copy.

| Family               | Weight | Used for                                                        |
|----------------------|--------|-----------------------------------------------------------------|
| **Caveat Brush**     | 400    | Display: page titles, card labels, button text, swatch labels   |
| **Gloria Hallelujah**| 400    | Body: descriptions, narration, legends, tab labels              |
| **Kalam**            | 700    | Numbers in HUD chips, micro-UI numerics                         |
| **Patrick Hand**     | 400    | Fallback for body when Gloria is too tall                       |

### Type scale
| Use                      | Family            | Size  | Line-height |
|--------------------------|-------------------|-------|-------------|
| Page title               | Caveat Brush      | 42–46 | 1.0         |
| Section heading          | Caveat Brush      | 30–36 | 1.0         |
| Card label               | Caveat Brush      | 24–26 | 1.0         |
| Button (primary)         | Caveat Brush      | 26–28 | 1.0         |
| Banner / diary entry     | Gloria Hallelujah | 18–22 | 1.5         |
| Body / description       | Gloria Hallelujah | 15–17 | 1.5–1.7     |
| Chip number              | Kalam 700         | 16–18 | 1.0         |
| Tab label                | Gloria Hallelujah | 18    | 1.0         |

### Rotation (subtle, ALWAYS apply)
- Page title: `transform: rotate(-1deg)`
- Section heading: `rotate(-0.6deg)`
- Cards: alternate `-0.3deg / +0.4deg / -0.2deg` via `:nth-child`
- Buttons: `-0.8deg`, alternate `+1deg / -0.4deg` via `:nth-of-type`
- Chips: `-0.5deg`, alternate `+0.7deg / -0.3deg`
- Tabs: alternate `-1deg / +1.2deg / -0.6deg / +0.8deg`
- Swatches: alternate `-0.6deg / +0.8deg / -0.3deg`
- Banners & legends: `-0.5deg` and `-0.3deg`

---

## 4. BUTTONS

### Anatomy
- Border: `2.5px solid var(--ink)`
- Border-radius: `16px` (rectangle) or `50%` (icon)
- Padding: `12px 26px 8px` (rectangle), `0` (icon — fixed 60×60)
- Color: `var(--paper)` on color buttons; `var(--ink)` on cream backgrounds
- Text-shadow: `0 2px 0 rgba(58,42,28,.4)` on color buttons
- Box-shadow stack:
  ```
  0 4px 0 var(--ink),
  inset 0 -5px 0 rgba(58,42,28,.18),
  inset 0 3px 0 rgba(255,255,255,.28)
  ```
- Pressed state: `transform: translateY(3px) rotate([same as base])` + shadow drops to `0 1px 0 var(--ink), inset 0 -3px 0 rgba(58,42,28,.2)`

### Variants
| Class         | Background gradient (180deg)                              | Job                |
|---------------|-----------------------------------------------------------|--------------------|
| `.cz-btn.moss`    | `#a3c08a → #8aa872 → #5e7c4a`                          | Play / primary     |
| `.cz-btn.mustard` | `#efc97a → #e3b25a → #b88830`                          | Build / reward     |
| `.cz-btn.terra`   | `#e8a088 → #d28464 → #a85a3e`                          | Alert / close      |
| `.cz-btn.denim`   | `#9aaec0 → #7a92a8 → #4f6a82`                          | Nav / info / settings |

### Badge (notification dot on button)
- Position: `top:-8px; right:-8px;`
- Size: `24px × 24px`, `border-radius:50%`
- Background: `var(--terracotta)`
- Border: `2.5px solid var(--ink)`
- Box-shadow: `0 2px 0 var(--ink)`
- Font: Kalam 700, 13px, color `var(--paper)`

### States
- Default → Pressed (3px down) → Disabled (`opacity:.55`, flatten shadow) → Locked (hatched paper-3 fill, lock icon)

---

## 5. HUD CHIPS (resource pills)

### Anatomy
- Display: `inline-flex; align-items:center; gap:8px`
- Background: `linear-gradient(180deg, var(--cream), var(--paper-2))`
- Border: `2.5px solid var(--ink)`
- Border-radius: `999px`
- Padding: `4px 16px 4px 4px` (left padding small — icon "pokes out")
- Box-shadow: `0 3px 0 var(--ink)`
- Font: Kalam 700, 16–18px, color `var(--ink)`
- Rotation: `-0.5deg` (alternate)

### Icon "sticker"
- Size: `30px × 30px`, `border-radius:50%`
- Border: `2.5px solid var(--ink)` (its own stroke — sits ON TOP of the pill)
- Background gradient by resource:
  - Coin: `linear-gradient(160deg, #f4d99a, #b88830)` — mustard radial
  - Heart: `linear-gradient(160deg, #e8a088, #a85a3e)` — terra
  - Star: `linear-gradient(160deg, #f4d99a, #b88830)` — mustard
  - Leaf/flower: `linear-gradient(160deg, #b8c8a8, #5e7c4a)` — moss

**Rule:** the icon has its own border so it reads as "stuck on" rather than "inside" the pill.

---

## 6. BOTTOM NAVIGATION

### Bar
- Position: bottom of screen, height `54px`
- Background: `linear-gradient(180deg, var(--denim), var(--denim-d))`
- Border-top: `2.5px solid var(--ink)`
- Layout: `flex; justify-content:space-around; align-items:center`

### Nav item (inactive, side)
- Size: `36×36`
- Border: `2px solid var(--ink)`, radius `8px`
- Background: `linear-gradient(180deg, #9aaec0, #6a829a)`
- Color: `var(--cream)` with `text-shadow: 0 1px 0 rgba(0,0,0,.3)`

### Nav item (center / Home pedestal)
- Size: `50×50`, radius `14px`
- Background: `linear-gradient(180deg, var(--cream), var(--mustard))` — only hot color in the bar
- Color: `var(--ink)`, no text-shadow
- `margin-top: -16px` (pedestal effect)
- Box-shadow: `0 3px 0 var(--ink)`
- Font-size: 22px

### Tab order (5 tabs)
`★ Areas` · `🏆 Trophies` · `⌂ Home (center)` · `👥 Friends` · `⚙ Settings`

---

## 7. CARDS, BANNERS, LEGENDS

### Card
- Background: `var(--paper)`
- Border: `2.5px solid var(--ink)`
- Border-radius: `14px`
- Box-shadow: `4px 4px 0 var(--ink)` (hard, no blur)
- Padding: `18px`
- Rotation: alternating subtle (`-0.3 / +0.4 / -0.2 deg`)

### Stage (the demo area inside a card)
- Background: `var(--paper-2)`
- Border: `2px dashed var(--ink)`
- Border-radius: `10px`
- Padding: `22px 18px`
- min-height: `120px`

### Banner (diary entry / narration)
- Background: `linear-gradient(180deg, var(--paper-2), var(--paper-3))`
- Border: `2.5px solid var(--ink)`, radius `14px`
- Box-shadow: `0 4px 0 var(--ink)`
- Padding: `18px 22px`
- Font: Gloria Hallelujah 20px, line-height 1.5, color `var(--ink)`
- Rotation: `-0.5deg`
- **Wax-seal corner**: 18×18 terracotta square, rotated 45°, with 2px ink border, positioned `left:14px; top:-9px`

### Legend / rule box
- Border: `2px dashed var(--ink)`, radius `12px`
- Background: `var(--paper-2)`
- Font: Gloria Hallelujah 17px, line-height 1.7
- `<b>` inside uses Caveat Brush at 22px

---

## 8. PHONE FRAME (for screen mockups)

- Outer: 320×640, `border:3px solid var(--ink)`, radius `36px`, padding `6px`, background `var(--ink)`, shadow `5px 6px 0 var(--ink)`
- Notch: 80×8, `top:8px`, centered, `var(--ink-soft)`, radius `8px`
- Screen: `inset: 22px 6px 6px`, radius `28px`, background `var(--cream)`

### Layout zones (inside screen, top-to-bottom)
1. **HUD chips** — `top:8px`, three chips, `justify-content:space-between`
2. **Scene** — flex:1, illustration owns this
3. **CTAs row** — `bottom:64px`, two buttons (Lvl + Tasks)
4. **Nav bar** — bottom 54px

---

## 9. SCENE ILLUSTRATIONS (placeholder language)

When real art isn't ready, build placeholder scenes with these CSS shape primitives:

### Cottage exterior palette
- Sky: `linear-gradient(180deg, #d4c8a0 0% 32%, #c8b88a 32% 38%, #b8a47a 38% 100%)`
- Cottage walls: `linear-gradient(180deg, #ede0c4, #d8c8a4)` — cream cob
- Roof: `linear-gradient(180deg, #c87060, #8a4838)` — terracotta tile, `clip-path: polygon(10% 100%, 50% 0%, 90% 100%)`
- Door: `linear-gradient(180deg, #8a5a3a, #5a3820)` with `border-radius: 14px 14px 0 0`
- Bushes: `radial-gradient(circle at 30% 40%, #a8c08a, #6e8a52)` rounded to `50% 50% 40% 40%`
- Path: `linear-gradient(180deg, #d8c8a4, #b8a884)` with trapezoid `clip-path`
- Sun: `radial-gradient(circle, #f4d99a, #e3b25a)` — top-right corner

### Interior palette
- Walls: `linear-gradient(180deg, #d8b89a 0% 60%, #b89878 60% 100%)`
- Floor: `repeating-linear-gradient(45deg, #b89878 0 14px, #a88868 14px 28px)`
- Rug: `radial-gradient(ellipse, #c87060 0% 40%, #a85040 40% 100%)` ellipse
- Windows: `linear-gradient(180deg, #c8d4dc, #889aa8)` with arched top (`border-radius: 18px 18px 0 0`)
- Wall art: `linear-gradient(180deg, #c8a87a, #a88860)` frame, with terracotta inner panel

**All scene elements use the same `2px–2.5px var(--ink)` stroke as UI elements.**

---

## 10. STORYTELLING / DIARY LOOP

The cozy game loop, baked into the system:

1. **Morning page** — Caveat Brush chapter title + Gloria Hallelujah narration on a banner card. Sets today's task.
2. **Play** — match-3 board. Pieces use higher saturation than UI (so they read), but stay within the cozy hue family.
3. **Reward = a line in the diary** — not just `+50 coins`. The win screen reveals one new line of narration.
4. **Decoration unlock** — placing the new object in the room triggers a sticker animation in the diary too.
5. **Mood marker / day stamp** — at end of session, player picks one of 5 stickers (sun, rain, heart, flower, star). That's the "rate this session" loop.

### Sticker tokens
- 48×48, `border-radius:50%`, `border:2.5px solid var(--ink)`, `box-shadow:0 3px 0 var(--ink)`
- Background = the same gradient as the matching accent (sun = mustard, rain = denim, heart = terra, flower = moss, star = rose)
- Font-size 22px for the glyph

---

## 11. HIERARCHY ON A SCREEN

Top-to-bottom visual weight, in order:

1. **Scene** — biggest, most saturated, owns the middle
2. **Primary CTA (Play / Level)** — moss, bottom-left
3. **Secondary CTA (Tasks / Build)** — mustard, bottom-right, often with terracotta "!" badge
4. **HUD chips** — top edge, light visual weight, tappable for top-up
5. **Nav** — very bottom edge, smallest visual weight

Never let UI cover the focal point of the illustration.

---

## 12. DON'T

- ❌ Pure white `#fff` or pure black `#000` anywhere
- ❌ System sans-serif (Inter, Roboto, Helvetica) for player-facing copy
- ❌ Saturated brand-gamey blue/red — keep palette warm & muted
- ❌ Perfectly straight elements — always nudge ±0.3 to ±1.2 degrees
- ❌ Multiple accent colors competing for the same role
- ❌ Blurred shadows — only hard offset shadows
- ❌ Web-style flat buttons or material elevation
- ❌ Filler content / data slop — every element earns its place

---

## 13. QUICK CSS RECIPES

### Primary button
```css
.cz-btn.moss {
  font-family: 'Caveat Brush', cursive;
  color: #f6efe1;
  text-shadow: 0 2px 0 rgba(58,42,28,.4);
  background: linear-gradient(180deg, #a3c08a 0%, #8aa872 50%, #5e7c4a 100%);
  border: 2.5px solid #3a2a1c;
  border-radius: 16px;
  padding: 12px 26px 8px;
  font-size: 28px;
  box-shadow:
    0 4px 0 #3a2a1c,
    inset 0 -5px 0 rgba(58,42,28,.18),
    inset 0 3px 0 rgba(255,255,255,.28);
  transform: rotate(-.8deg);
  cursor: pointer;
}
```

### HUD chip
```css
.cz-chip {
  display: inline-flex; align-items: center; gap: 8px;
  background: linear-gradient(180deg, #f8efd8, #ebe0c8);
  border: 2.5px solid #3a2a1c;
  border-radius: 999px;
  padding: 4px 16px 4px 4px;
  font-family: 'Kalam', cursive; font-weight: 700;
  color: #3a2a1c;
  box-shadow: 0 3px 0 #3a2a1c;
  font-size: 18px;
  transform: rotate(-.5deg);
}
.cz-chip .ic {
  width: 30px; height: 30px; border-radius: 50%;
  border: 2.5px solid #3a2a1c;
  display: inline-flex; align-items: center; justify-content: center;
}
.cz-chip .ic.coin {
  background: linear-gradient(160deg, #f4d99a, #b88830);
}
```

### Card
```css
.card {
  background: #f6efe1;
  border: 2.5px solid #3a2a1c;
  border-radius: 14px;
  padding: 18px;
  box-shadow: 4px 4px 0 #3a2a1c;
  transform: rotate(-.3deg);
}
```

---

## 14. FONT IMPORT

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Caveat+Brush&family=Caveat:wght@500;600;700&family=Kalam:wght@400;700&family=Gloria+Hallelujah&family=Patrick+Hand&display=swap" rel="stylesheet">
```

---

## 15. TONE OF VOICE

- Conversational, present-tense, gentle.
- Player narrates as themselves ("I planted six bulbs by the path") not as a third-person hero.
- Numbers exist but they're never the headline — the line of story is.
- Friendly, never urgent. No `LIMITED TIME!` or `BUY NOW!`.

Examples:
- ✅ "Day 12. The fountain finally works. Mira left a note on the porch."
- ✅ "Tap to plant the lavender →"
- ❌ "DAILY DEAL — 50% OFF — ENDS SOON"
- ❌ "VICTORY! +500 XP"

---

End of spec. v1 — KVTM 2.0.

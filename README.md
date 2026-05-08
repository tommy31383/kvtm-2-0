# KVTM 2.0 — Khu Vườn Trên Mây Reborn

Cozy puzzle + makeover + K-drama romance mobile game.
Royal Match pattern (75%) + Gardenscapes (15%) + romance narrative.
Target: Female 22-35 SEA + Anglo.

**Design system pivoted to Cozy Match-3 / Diary Game (v2.5)** — warm paper/ink + handwritten fonts + rotation + diary loop.

---

## File index

### 🎮 Playable
- `kvtm_2_0_game.html` — **MAIN PLAYABLE** (~6500 lines)
  - 5 phases done: skeleton + hub + sort vase 20 levels + triple tile 10 levels + polish
  - Cozy Match-3 design system applied
  - 7-day content scope playable end-to-end
  - Open in browser, hard-reload + `localStorage.clear()` for fresh state
- `assets/hub-bg.png` — animated sprite bg (8192×228, 36 frames @ 12fps) — currently unused

### 🧪 Prototypes (single-mechanic playables)
- `prototypes/sort_vase.html` — Sort Vase water-sort mechanic standalone
- `prototypes/triple_tile.html` — Triple Tile pile-to-slot mechanic
- `prototypes/cinematic_transform.html` — Decor before/after transformation cinematic

### 📐 Design docs
- `docs/kvtm_2_0_design.html` v2.5 — Master Design Doc
  - 14+ sections: Concept, Pillars, Art, UI/UX (1C Cozy Match-3), Cast, Story, Hub, Loop, Sort, Triple, 100 Maps, Wireframe, Economy, Tech, Sound, Roadmap
- `docs/kvtm_2_0_design_system.md` — **Canonical Cozy Match-3 spec** (15 sections)
  - Color tokens (paper/ink + 4 accents) · type scale · button anatomy · HUD chips · nav · cards · scene illustrations · diary loop · tone of voice · don't list · CSS recipes
- `docs/kvtm_2_0_mockup_v1.html` — Outdated mockup (Royal Match red/blue era)
- `docs/kvtm_2_0_mockup_v2.html` — Mockup 7 screens (pre Cozy pivot)
- `docs/kvtm_2_0_wireframe.html` — Hub-and-spoke flowchart 7 nodes 16 wires

### 📁 Related
- `related/khan_do_event_design.html` — Khăn Đỏ event design v1.3 (older KVTM 1.x event)
- `related/rework_quickfix_spec.html` — KVTM Rework Quick Fix v1.2

---

## Version history

- v1.0-1.1 — Initial concept (farm sim residue)
- v2.0 — Pivot to Royal Match pattern + 2 mechanics (Sort + Triple) + Mia/Leo K-drama
- v2.1-2.2 — 5 BLOCKERS fixed (art direction, economy, difficulty, lose state, touch targets)
- v2.3 — **Sort Vase = water-sort pattern fix** (was free-placement before)
- v2.4 — Royal Match navy/gold + Lilita One (REJECTED)
- v2.5 — **PIVOT to Cozy Match-3 / Diary Game** ← current canonical

---

## Pillars

1. **Variety** — 100+ map themes, sequential per map
2. **Addictive** — Royal Match ⭐ bridge currency + cinematic transformation
3. **Challenge** — Sort + Triple Tile difficulty curve

## Cast

- **Mia** (FL) — Player avatar, garden restorer
- **Leo** (ML) — Mysterious neighbor on balcony
- **Madame Elena** — Estate owner, 4-chapter K-drama anchor

## Mechanics

1. **Sort Vase** — Water-sort pattern (LIFO stacks, pour same-color flowers)
2. **Triple Tile** — Pile-to-slot, 3-match clear (Match 3D / 3 Tiles pattern)

## Tech stack

- HTML5 prototype phase (Phase 0-1)
- Unity port (Phase 2+)
- Mobile portrait 390×844, vertical lock, 44pt touch targets
- localStorage save in prototype, server save in Unity

---

## Status (as of v2.5)

✅ Playable 7-day content (30 levels + 25 decor + 4 story beats)
✅ Cozy Match-3 design system applied
✅ Sort Vase + Triple Tile engines functional
✅ Hub Dashboard with garden scene + decor task system
✅ Cinematic transformation flow
⏳ Story cutscenes (Phase 6)
⏳ Daily login reward calendar (Phase 6)
⏳ Tone-of-voice copy pass (Phase 6)
⏳ Mood marker stickers (Phase 6)

# KVTM 2.0 — Code Review & Optimization Report
**Date:** 2026-05-15
**Scope:** `kvtm_2_0_game.html` (7238 LOC), `engine/*.js` (4151 LOC)

---

## Executive Summary

| Severity | Count | Examples |
|---|---|---|
| 🔴 HIGH | 4 | Triple hub-mount, unscoped global state, listener leak risk, file size |
| 🟡 MED  | 6 | Repeated DOM queries, redundant SVG rebuild, inline styles in loops, brute-force timers |
| 🟢 LOW  | 5 | Console logs, magic numbers, dead code paths, `void el.offsetWidth` overuse |

**Key wins available (low effort):**
1. Collapse hub mount RAF+setTimeout×2 → single RAF + observer (saves 3 DOM passes/mount)
2. Cache DOM refs in `refreshStarsUI`, `_updateTimerDisplay` (called every second)
3. Skip SVG rebuild when state unchanged
4. Cleanup pattern for `setInterval` on scene unmount

**Big win (high effort):**
5. Split `kvtm_2_0_game.html` (290KB) into `src/css/`, `src/svg/`, `src/js/scenes/*` — current state blocks parallel edits, breaks editor performance.

---

## 🔴 HIGH SEVERITY

### H1. Triple-trigger hub mount [game.html:3073-3075](../kvtm_2_0_game.html#L3073)

```js
requestAnimationFrame(_hubMount);
setTimeout(_hubMount, 50);
setTimeout(_hubMount, 200);
```

**Issue:** Brute-force fix for race between DOM insertion and SVG/leaf builders.
Each call does:
- 2 `getElementById` lookups
- `document.getElementById('garden-main-svg')` existence check (full doc walk)
- Calls `Lives.updateUI()` + `Lives.startTicker()` (which clears+restarts interval)
- Each subsequent call is wasted work guarded by `if (!already-built)`.

**Fix:** Use single RAF + `MutationObserver` for guaranteed mount detection, OR rely on the idempotency guard and reduce to single RAF + one fallback timer:
```js
requestAnimationFrame(() => {
  _hubMount();
  // Fallback in case RAF fires before DOM commit (rare in Webkit/Safari)
  if (!document.getElementById('garden-main-svg')) {
    setTimeout(_hubMount, 100);
  }
});
```
**Impact:** -2 redundant mounts × every hub return. Reduces unnecessary `Lives.startTicker()` interval thrash.

---

### H2. `setInterval` lifecycle holes

Found 3 separate `setInterval` callers without explicit unmount cleanup chain:
- [game.html:4023](../kvtm_2_0_game.html#L4023) typewriter timer
- [game.html:5249](../kvtm_2_0_game.html#L5249) `_timerInterval` (level countdown)
- [game.html:6053](../kvtm_2_0_game.html#L6053) typewriter timer (second instance)

`_timerInterval` is cleared inside its own callback when `_gameOver` set, BUT if user navigates away mid-level via `Game.back()`, the interval keeps ticking and accumulates `_timeLeft--` against a no-op `_container.querySelector('#tt-timer')` that returns null.

**Fix:** Hook `Scenes.unmount()` (or `Router` unmount) to call a registered cleanup list:
```js
const _sceneCleanups = [];
function onSceneCleanup(fn) { _sceneCleanups.push(fn); }
function _runCleanups() { _sceneCleanups.forEach(fn => { try{fn()}catch{} }); _sceneCleanups.length = 0; }
// Then: setInterval(...) → onSceneCleanup(() => clearInterval(id));
```

**Impact:** Prevents drift, dangling timers, and false-positive `_triggerLose('time')` after scene exit.

---

### H3. Listener leak risk (35 addEventListener / 0 removeEventListener)

Grep confirms 35 `addEventListener` calls, **zero** `removeEventListener`. Most listeners are on elements that get GC'd when parent removed — so technically fine — but several attach to `window` / `document`:
- Browser autoplay gesture handler [game.html:4624](../kvtm_2_0_game.html#L4624)
- Various global click handlers

**Action:** Audit `addEventListener` calls with target `window` / `document` / `body`. Add removal on scene change.

```bash
grep -n "window\.addEventListener\|document\.addEventListener" kvtm_2_0_game.html
```

---

### H4. File size (290KB / 7238 LOC) blocks tooling

- Editor TS server / Prettier / git diff render slowly
- Claude reads in chunks → easy to miss context across sections
- CSS (lines 19-2038, ~2000 LOC) and SVG (2260-2443, ~180 LOC) are pure data with no JS coupling — prime extraction candidates

**See split plan in section 4.**

---

## 🟡 MEDIUM SEVERITY

### M1. Repeated `getElementById` in hot paths

`refreshStarsUI` ([game.html:2449](../kvtm_2_0_game.html#L2449)) called on every save + every level win:
- 4× `getElementById` + 1 `Save.get()` (which JSON.parse?)
- Each call also triggers forced reflow via `void el.offsetWidth`

`_updateTimerDisplay` ([game.html:5258](../kvtm_2_0_game.html#L5258)) runs every second:
- `_container.querySelector('#tt-timer')` → 60 queries/min

**Fix:** Cache DOM refs at scene mount; null them at unmount.

---

### M2. SVG rebuild on every hub return [game.html:2189](../kvtm_2_0_game.html#L2189)

`buildGardenSVG` builds ~250 lines of SVG markup via template literal + assigns `innerHTML`. The SVG **IS** state-dependent (slotDone[]/slotProg[] embedded as opacity flags) — so cache must be invalidated on decor task complete.

**Fix:** Memo by serialized state key:
```js
let _gardenCache = { key: null, html: null };
function buildGardenSVG(containerEl) {
  const key = JSON.stringify(Save.get().hub.decorTasksDone || []);
  if (_gardenCache.key === key && _gardenCache.html) {
    containerEl.innerHTML = _gardenCache.html;
    return;
  }
  // ...build svg...
  _gardenCache = { key, html: svg };
  containerEl.innerHTML = svg;
}
```
**Impact:** Hub re-entry: skips template literal eval + DOM parse of 250-line SVG.

---

### M3. `innerHTML` overuse for static UI

30+ `innerHTML = \`...\`` assignments. Most are one-shot mounts (fine), but a few inside event handlers risk XSS if user input flows in (currently safe — all values are app-controlled).

**Action:** Audit any `innerHTML` that interpolates user-provided strings (player names, etc). Use `textContent` or escape.

```bash
grep -nE "innerHTML.*\\\$\\{.*\\.name|innerHTML.*\\\$\\{.*input" kvtm_2_0_game.html
```

---

### M4. `void el.offsetWidth` reflow forcing pattern repeated 4×

Used to retrigger CSS animation by removing + re-adding class. Each instance forces synchronous layout. If chained (multiple star pops at once), measurable jank.

**Fix:** Use Web Animations API `el.animate(...)` for transient flourishes — no reflow needed:
```js
el.animate(
  [{transform:'scale(1)'},{transform:'scale(1.2)'},{transform:'scale(1)'}],
  {duration:400, easing:'ease-out'}
);
```

---

### M5. `localStorage` read+parse on every level load [game.html:4292](../kvtm_2_0_game.html#L4292)

`CACHE_LS_KEY` parsed each time. Tiny, but unnecessary if module caches in memory.

**Fix:** Read once at module init, mirror into in-memory map; write-through on update.

---

### M6. `engine/sort_blossom_render.js` good practices — keep these

- `_timers` Set + `_nodes` Set + `cancel()` ✅ proper teardown
- `will-change: transform, opacity` ✅
- `translate3d` for GPU ✅
- `backface-visibility: hidden` ✅

**No changes recommended.** This file is already well-optimized.

---

## 🟢 LOW SEVERITY

### L1. 13 `console.log` statements in production

Mostly `[Hub mount]`, AI engine logs. Keep guarded by a `DEBUG` flag:
```js
const DEBUG = location.search.includes('debug');
function log(...args) { if (DEBUG) console.log(...args); }
```

### L2. Magic numbers
- `setTimeout(..., 50)`, `setTimeout(..., 200)` — extract to `MOUNT_RETRY_MS`
- `setTimeout(..., 6000)` (diary auto-hide) — `DIARY_TIMEOUT`

### L3. Dead code paths
[game.html:5921](../kvtm_2_0_game.html#L5921) "Beat not found" fallback — verify still reachable.

### L4. `requestAnimationFrame` + `setTimeout(fn, 50)` + `setTimeout(fn, 200)` pattern repeats outside Hub mount too — same idiom, same waste.

### L5. Inline styles via `.style.cssText = ...` (render.js, ~12 sites)
String parse + style recalc per node spawn. Acceptable for transient effects but could use a `<template>` with classes for the static parts.

---

## 4. Split Plan for `kvtm_2_0_game.html`

**Target structure** (after split):

```
kvtm_2_0_game.html            ~500 LOC   (shell + script tags + entry point)
src/
├── css/
│   ├── core.css              ~400 LOC   (reset, typography, common)
│   ├── hub.css               ~600 LOC   (hub scene + cottage)
│   ├── level.css             ~500 LOC   (sort_blossom + UI)
│   └── companion.css         ~500 LOC   (companion box, typewriter, drawer)
├── svg/
│   └── cottage_garden.svg.js ~250 LOC   (template literal export)
├── js/
│   ├── scenes/
│   │   ├── hub.js            ~600 LOC   (Hub controller + tasks)
│   │   ├── level.js          ~700 LOC   (level mount + win/lose)
│   │   ├── name.js           ~150 LOC   (onboarding)
│   │   └── settings.js       ~200 LOC   (drawer)
│   ├── systems/
│   │   ├── save.js           ~200 LOC   (Save module)
│   │   ├── lives.js          ~100 LOC   (Lives ticker)
│   │   ├── companion.js      ~400 LOC   (AI + fallback prompts)
│   │   └── sfx.js            ~100 LOC   (sound + haptic)
│   ├── ui/
│   │   ├── toast.js          ~80 LOC
│   │   ├── typewriter.js     ~100 LOC
│   │   └── dev-panel.js      ~200 LOC
│   ├── router.js (exists)
│   └── core.js (exists)
```

**Build approach:** Mirror IdeaGame pattern — `scripts/build.js` concats modules into single output. OR keep modular and add `<script>` tags (no build step) — works on file:// + localhost.

**Recommended:** No-build approach (multiple `<script>` tags). Reasons:
- KVTM is single-developer, single-deploy artifact
- Build adds friction; current iteration loop is "edit + reload"
- Order of script tags = module dependency (manual but explicit)

**Migration order (low-risk first):**
1. Extract CSS (lines 19-2038) → `src/css/*.css` + `<link>` tags
2. Extract cottage SVG (2260-2443) → `src/svg/cottage_garden.svg.js` exporting template
3. Extract Save/Lives/Sfx (small, independent systems) → `src/js/systems/*.js`
4. Extract Companion (large but self-contained)
5. Extract scenes one at a time (Hub → Level → Name → Settings)
6. Final: extract dev panel, leaving `kvtm_2_0_game.html` as shell + Router init

**Risk mitigation:** Each step: run all 86 tests + smoke-play L1+L20+L25 in browser before next step.

---

## 5. Recommended fix order (this session)

Quick wins to apply now (~1h):
1. ✅ Hub mount triple → single RAF + retry
2. ✅ SVG cache memo
3. ✅ Cache DOM refs in `refreshStarsUI` + `_updateTimerDisplay`
4. ✅ Hook `setInterval` cleanups to scene unmount

Defer:
- File split (multi-session, structural)
- Listener audit (needs runtime profile)
- Inline-style cleanup (cosmetic)

---

## 6. Metrics baseline (to capture after fixes)

To measure impact, capture before/after on Chrome devtools Performance:
- Hub mount: time from `Router.go('hub')` to first paint
- Level mount: time from level select click to first pot interactive
- Memory: heap snapshot after 10 hub↔level transitions (delta should be flat)

Currently no metrics baseline — add a perf marker pass when applying fixes.

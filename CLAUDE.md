# CLAUDE.md — KVTM 2.0 project instructions

You are working on **Khu Vườn Trên Mây 2.0**, a casual mobile puzzle game prototype (Sort Blossom mechanic). This file is loaded automatically every session — read it before touching code.

## Before ANY change: read these

1. [docs/AGENT_RULES.md](docs/AGENT_RULES.md) — 15 hard rules for sync (game↔tool, local↔git, reasoning↔reality). NON-NEGOTIABLE.
2. [docs/LESSONS_LEARNED.md](docs/LESSONS_LEARNED.md) — past mistakes already burned by. Don't repeat.
3. [docs/sort_blossom_rules.md](docs/sort_blossom_rules.md) — game rules (Sort Blossom mechanic).

## Project structure

```
engine/                     ← shared by game + tools (source of truth)
  sort_blossom_engine.js    pure logic (BFS, validate, settle) — has unit tests
  sort_blossom_render.js    DOM/canvas renderer — has migrateBloomDurs()
  sort_blossom_data.js      level data (edited by tools/level_editor.html)
  sort_blossom.css          shared styles (edited by tools/bloom_test.html)

src/js/                     ← extracted modules (load via <script src>)
  core.js                   Save + Lives + Sfx + Haptic + migrateSave()
  router.js                 Game scene router

scripts/
  dev-server.js             Node HTTP server (localhost-only, X-Dev-Token gated)
  dev.ps1                   ONE-shot startup: kill stale → restart → open browser

tools/
  level_editor.html         level editor (POST /api/save-levels)
  bloom_test.html           sprite sheet + per-frame dur editor

test/                       ← `npm test`
  engine.test.js            engine logic tests (35)
  migration.test.js         schema migration tests (17)
  bloom_dur_roundtrip.test.js  save/load round-trip (14)

kvtm_2_0_game.html          main game entry (~7200 LOC, still being modularized)
```

## Mandatory commands

```powershell
npm run dev        # ONE command: kill stale Node, restart server, run tests, open game
npm test           # Run all unit tests (must be green before commit)
npm run gen        # Generate level(s) from spec — see "Level generation" below
```

## Level generation flow

Generate a single level or batch from spec JSON. Generator does:
- Validate spec (color count multiple of 3, pots 2..9, etc.)
- Distribute flowers across pots (avoiding trivial-win layouts)
- Run BFS solver to find minimum-move solution
- Compute moveLimit + starThresholds from difficulty preset
- Generate potLayout (x,y centers) for N pots
- Output level JSON or write directly to engine/sort_blossom_data.js

**Difficulty levers** (in spec):
| Field | Effect |
|---|---|
| `colors: [...]` | More colors = harder (must be multiple of 3 each) |
| `perColor: N` | More flowers per color = longer level |
| `pots: N` | 2..9; generator reserves 1 empty pot for maneuver |
| `queueDepth: N` | 0..6; hidden flowers waiting per pot |
| `difficulty: "easy"\|"medium"\|"hard"\|"brutal"` | tightens moveLimit + star gaps |
| `seed: N` | Deterministic randomness (omit for time-based) |
| `tutorial: true` | Marks level as tutorial |

**Commands:**
```powershell
# Single level from spec file
npm run gen -- --spec levels/specs/example.json

# Batch from curve file
npm run gen -- --batch levels/specs/curve_31_35.json

# Inline spec (quick test)
npm run gen -- --inline '{"id":99,"colors":["R","P","Y"],"perColor":6,"pots":4,"queueDepth":3,"difficulty":"medium"}'

# Apply directly to engine/sort_blossom_data.js (replaces matching id, appends new)
npm run gen -- --batch levels/specs/curve_31_35.json --write
```

**Layout presets** for N pots (2..9) live in `scripts/layout-pots.js`. Add new patterns there by extending `PRESETS`. Optional `jitter` field for organic feel:
```json
{ "id": 50, "...": "...", "jitter": 0.3 }
```

**When generating a new level batch as Claude:**
1. Write spec to `levels/specs/<name>.json` (NEVER edit data.js directly).
2. `npm run gen -- --batch levels/specs/<name>.json` → review output JSON.
3. If solver shows `(heuristic)` for high-ID levels, BFS gave up — moveLimit is estimated; play-test before shipping.
4. `npm run gen -- --batch levels/specs/<name>.json --write` → commits to data.js.
5. `npm test` (covered by pre-commit hook anyway).
6. Open game (`npm run dev`) → play through 2-3 of the new levels manually before commit.
7. Commit with `git add levels/specs engine/sort_blossom_data.js` — keep spec + result together.

The repo also has a Git pre-commit hook that runs `npm test` automatically — if it fails, commit blocked. Don't bypass with --no-verify.

## Hard rules quick reference (full text in docs/AGENT_RULES.md)

- **R1** File on disk = single source of truth. No "tool state" or "game state" independent of file.
- **R7** Edit `scripts/dev-server.js` → restart Node. Node has NO hot reload. Use `npm run dev`.
- **R8** Before nghi ngờ code, check 3 layers: `git status`, `git log -1 <file>`, `netstat -ano | findstr ":3456"`.
- **R9** Edit any asset loaded by browser → bump `?v=N` in HTML reference.
- **R10** Commit AND push in same response. No orphan local commits.
- **R12** "Check trước, sửa sau" — grep before editing files > 200 LOC, test regex on sample first.
- **R13** User says "không đổi gì" → verify from file (`grep`, `cat`), not from reasoning.

## Verification checklist (must pass before reporting "done")

- [ ] `npm test` green
- [ ] `git status` clean OR all uncommitted changes are intentional
- [ ] `git log -1` matches what was pushed (`git push` completed)
- [ ] If server code changed → terminal Node output shows new `Token (this run): <hex>`
- [ ] If asset changed → `?v=N` bumped in every HTML reference

## Anti-patterns (already burned by — DO NOT REPEAT)

- Put `let X = ...` AFTER `return {...}` inside an IIFE → TDZ crash. All `let`/`const` go BEFORE return.
- Use loose regex (`\s+P:\s*[^,]+`) on a file with multiple `P:` keys → hits wrong line. Use line-anchored or block-scoped patterns.
- Say "fix đã work, anh test đi" without restarting Node when server code changed → server still serves old code.
- Save tool sends `durations: scalar`, server checks `Array.isArray` → silent skip. Always verify save endpoint with `curl` after schema changes.
- Verify with "should work" reasoning → always verify from file content or test output.

## When in doubt

1. Re-read `docs/AGENT_RULES.md`.
2. Run `npm test`.
3. `git status` + `git log -1 <file>` to confirm state.
4. If still uncertain, ask user — don't guess.

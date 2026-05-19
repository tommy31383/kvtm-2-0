# 🦴 Spine Clone

**Universal** 2D sprite + skeletal animation editor for PC. Tauri 2 + PixiJS 8 + TypeScript.

Open any sprite sheet → cut atlas regions → build skeleton → animate → export. Works with **any game / project**. Output runtime-compatible with Spine 4.x.

> ⚠️ **Work in progress** — Phase 2 (full E2E editor workflow) is functional. See [`docs/DESIGN.md`](./docs/DESIGN.md) for the 7-phase roadmap (~7-13 months solo).

## Quick start

```bash
npm install                  # one-time
npm run dev                  # Vite dev server (browser) — http://localhost:1420
npm run tauri dev            # Native desktop window (first build ~3-5 min)
npm test                     # Vitest unit tests (currently 58 passing)
npm run build                # Production build (frontend only)
```

## E2E workflow

1. **🖼 Load Image** — pick a PNG/WebP sprite sheet
2. **🎨 Atlas mode** — drag mouse on image to cut regions; click region → edit X/Y/W/H in Properties panel
3. **🦴 Pose mode** — `+ Slot` to add slot to bone; Properties → "Attach" dropdown picks a region
4. **+ Anim** — create animation; scrub or **▶ Play** to preview
5. **💾 Save** → `.spineclone.json` (lossless project file)
6. **📤 Export Spine** → `.json` (Spine 4.x format — load in any spine-runtime: spine-pixi, spine-three, etc.)

## Architecture

```
src/
├── core/           Data model + pose evaluation (Spine-equivalent types)
│   ├── types.ts        Skeleton/Bone/Slot/Skin/Attachment/Animation/Timeline
│   ├── interpolation.ts  Linear/Stepped/Bezier curve evaluation
│   └── pose.ts         Animation timelines → world transforms
├── render/         PixiJS rendering bridge
│   └── PixiRenderer.ts  Skeleton → Container hierarchy + Sprite swap
├── io/             Format I/O
│   ├── customFormat.ts  Native .spineclone.json round-trip
│   └── spineExport.ts   → Spine 4.x JSON (runtime-compat)
├── store/          Editor state
│   └── DocumentStore.ts  Single source of truth + pub/sub events
├── ui/             Editor panels + canvas
│   ├── Editor.ts       Main orchestrator
│   └── AtlasView.ts    Atlas mode (region cutter)
└── main.ts         Bootstrap entry
src-tauri/          Rust backend (Tauri 2)
tests/              Vitest unit tests
public/sample-assets/   Generic demo sprite for testing
```

## Phase status

See [`docs/DESIGN.md`](./docs/DESIGN.md#7-phase-roadmap) for detail.

- ✅ **Phase 0** — Foundation (scaffold + hello bone)
- ✅ **Phase 1** — Core data + render + exporters (58 unit tests)
- 🚧 **Phase 2** — Editor UI (toolbar, atlas/pose modes, hierarchy, properties, atlas region tool, save/export) — **functional**
- ⬜ **Phase 3** — Animation keyframe editor + curve editor
- ⬜ **Phase 4** — Mesh attachments + IK constraints
- ⬜ **Phase 5** — Particle effects + shader filters
- ⬜ **Phase 6** — Atlas packer + runtime library
- ⬜ **Phase 7** — Editor polish (undo/redo, copy/paste, onion skin, shortcuts)

## Universal / game-agnostic

This tool produces standard formats. It does NOT hardcode any specific game.
- **`.spineclone.json`** — full editor project (lossless)
- **Spine 4.x JSON** — load in any spine-runtime
- **Atlas regions** — just rect coordinates on a sheet, usable anywhere

If you want to use the output in a specific game, write an adapter on the **runtime side** (your game engine). The editor stays generic.

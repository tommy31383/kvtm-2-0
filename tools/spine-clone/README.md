# 🦴 Spine Clone

PC-based 2D skeletal animation editor for KVTM and beyond. Tauri 2 + PixiJS 8 + TypeScript.

> ⚠️ **Work in progress** — Phase 1 complete (data model + render bridge). See [`docs/DESIGN.md`](./docs/DESIGN.md) for the full 7-phase roadmap (7-13 months solo).

## Quick start

```bash
npm install                  # one-time
npm run dev                  # Vite-only dev server (browser) — http://localhost:1420
npm run tauri dev            # Native desktop window (first build ~3-5 min)
npm test                     # Vitest unit tests (currently 54 passing)
npm run build                # Production build (frontend only)
```

## Architecture

```
src/
├── core/           Data model + pose evaluation (Spine-equivalent types)
│   ├── types.ts        Skeleton/Bone/Slot/Skin/Attachment/Animation/Timeline
│   ├── interpolation.ts  Linear/Stepped/Bezier curve eval
│   └── pose.ts         Animation timelines → world transforms
├── render/         PixiJS rendering bridge
│   └── PixiRenderer.ts  Skeleton → Container hierarchy + Sprite swap
├── io/             Importers + exporters
│   ├── kvtmImport.ts    KVTM _BLOOM_DATA → Skeleton+Atlas
│   ├── customFormat.ts  Native .spineclone.json round-trip
│   └── spineExport.ts   → Spine 4.x JSON (runtime-compat)
├── ui/             Editor panels (Phase 2+)
└── main.ts         Entry point
src-tauri/          Rust backend (file I/O, atlas packer)
tests/              Vitest unit tests
public/sample-assets/   KVTM bloom red sample for atlas import test
```

## Phase status

See [`docs/DESIGN.md`](./docs/DESIGN.md#7-phase-roadmap) for detail.

- ✅ **Phase 0** — Foundation (scaffold + hello bone + KVTM atlas import)
- ✅ **Phase 1** — Core data model + render bridge + exporters (~80%)
- ⬜ **Phase 2** — Skeleton editor (hierarchy panel, bone tools)
- ⬜ **Phase 3** — Animation timeline (keyframe editor, curve editor)
- ⬜ **Phase 4** — Mesh attachments + IK constraints
- ⬜ **Phase 5** — Particle effects + shader filters
- ⬜ **Phase 6** — Atlas packer + runtime library
- ⬜ **Phase 7** — KVTM integration (replace flipbook with bone anim)

## Sample data

`public/sample-assets/kvtm-bloom-red.json` + `flower_red_bloom.webp` — extracted
from KVTM `_BLOOM_DATA.R`. Used to validate the atlas import pipeline
end-to-end. Open the dev server and scrub the timeline slider to see the
imported bloom animation play.

# Spine Clone Tool — Design Document

> 2D skeletal animation editor for PC. Tauri + Rust + PixiJS + TypeScript.
> Goal: open-source Spine-equivalent tool. Output compatible with Spine JSON.

---

## 1. Goals

### MVP (Phase 1-3)
- Open + edit skeleton (bones, slots, region attachments)
- Animation timeline with keyframes (TRS per bone)
- Linear / Stepped / Bezier interpolation
- Atlas import + sprite assignment to slots
- Playback preview
- Save/load custom JSON + export Spine JSON

### Full (Phase 4-7)
- Mesh attachments (vertices + triangles + weighted deform)
- IK constraints (2-bone)
- Transform constraints
- Particle effects (emitter, lifetime, velocity, gravity, color-over-time)
- Shader filters (glow, tint, blur)
- Atlas packer (offline tool)
- KVTM integration (replace flipbook with bone anim)

### Non-goals (initially)
- Skin system (later)
- Path attachments (later)
- Audio events (later)
- Mobile/web runtime (later)

---

## 2. Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Desktop wrapper | **Tauri 2** (Rust) | Native, small bundle (~10MB), safer FS than Electron |
| Frontend | **TypeScript** | Type safety for complex data model |
| Renderer | **PixiJS v8** (WebGL) | Industry-standard 2D, handles 100s of sprites at 60fps |
| Bundler | **Vite** | Fast HMR, ESM-first |
| UI | Plain HTML/CSS + custom panels | Avoid framework lock-in; controlled DOM |
| State | Custom event-based store | Avoid Redux overhead; small surface area |
| Atlas packer | **Rust** (in `src-tauri/`) | Offline tool, perf matters for large packs |

---

## 3. Data Model

### Skeleton
```ts
interface Skeleton {
  name: string;
  version: string;        // schema version
  bones: Bone[];
  slots: Slot[];
  skins: Skin[];          // for now: 1 "default" skin
  animations: Animation[];
  events?: EventDef[];    // future
  ik?: IKConstraint[];    // future
  transform?: TransformConstraint[]; // future
}
```

### Bone
```ts
interface Bone {
  name: string;
  parent?: string;        // null = root
  length: number;         // visual length for editor
  // Setup pose transform (relative to parent)
  x: number;
  y: number;
  rotation: number;       // degrees
  scaleX: number;         // default 1
  scaleY: number;
  shearX?: number;
  shearY?: number;
  transformMode?: 'normal' | 'onlyTranslation' | 'noRotationOrReflection' | 'noScale' | 'noScaleOrReflection';
}
```

### Slot
```ts
interface Slot {
  name: string;
  bone: string;           // parent bone name
  attachment?: string;    // name of active attachment in skin
  color?: string;         // hex tint, default "ffffffff"
  blend?: 'normal' | 'additive' | 'multiply' | 'screen';
}
```

### Attachment (region)
```ts
interface RegionAttachment {
  type: 'region';
  name: string;
  path?: string;          // override texture path (defaults to attachment name)
  x: number;              // offset from slot's bone
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  width: number;          // unscaled image size
  height: number;
  color?: string;
}
```

### Attachment (mesh, future)
```ts
interface MeshAttachment {
  type: 'mesh';
  vertices: number[];     // x,y pairs (or bone-weighted: [boneCount, b1,w1,x1,y1, b2,w2,x2,y2, ...])
  uvs: number[];
  triangles: number[];
  hull: number;           // hull vertex count
}
```

### Animation
```ts
interface Animation {
  name: string;
  duration: number;       // seconds
  bones: { [boneName: string]: BoneTimeline };
  slots: { [slotName: string]: SlotTimeline };
  events?: EventKey[];    // future
  drawOrder?: DrawOrderKey[]; // future
}

interface BoneTimeline {
  rotate?: TimelineKey<number>[];
  translate?: TimelineKey<{x:number, y:number}>[];
  scale?: TimelineKey<{x:number, y:number}>[];
  shear?: TimelineKey<{x:number, y:number}>[];
}

interface SlotTimeline {
  attachment?: TimelineKey<string|null>[];  // attachment swap (stepped)
  color?: TimelineKey<string>[];             // tint
}

interface TimelineKey<T> {
  time: number;           // seconds
  value: T;
  curve?: 'linear' | 'stepped' | [number, number, number, number]; // bezier: [cx1, cy1, cx2, cy2]
}
```

---

## 4. File Format

### Custom format (`.skeleton.json`)
1:1 with the data model above. JSON, human-readable, version-tagged.

### Spine-compatible export (`.json`)
Matches official Spine 4.x JSON schema:
- https://en.esotericsoftware.com/spine-json-format
- Allows playback in any spine-* runtime (spine-pixi, spine-three, spine-threejs, etc.)

**Mapping**: 1:1 for region attachments, animations, slots. Mesh + IK have direct Spine equivalents. Particle/effect = custom extension (Spine doesn't support natively — needs custom runtime).

### Atlas format
Spine atlas v4 (text):
```
sprites.png
size: 1024, 1024
filter: Linear, Linear
scale: 1
flower_0
  bounds: 100, 200, 80, 96
  rotate: 90
  index: -1
flower_1
  ...
```

---

## 5. Project Structure

```
tools/spine-clone/
├── src-tauri/                   # Rust backend
│   ├── src/
│   │   ├── main.rs
│   │   ├── atlas_packer.rs      # offline atlas packer
│   │   └── file_io.rs           # safer FS API for editor
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── icons/
├── src/                          # TS frontend
│   ├── core/
│   │   ├── skeleton.ts          # Skeleton, Bone, Slot, Attachment types
│   │   ├── animation.ts         # Animation, Timeline, Keyframe
│   │   ├── pose.ts              # Apply animation → world transforms
│   │   ├── interpolation.ts     # Linear, Stepped, Bezier
│   │   └── events.ts            # Internal pub/sub
│   ├── render/
│   │   ├── PixiRenderer.ts      # Skeleton → Pixi Container hierarchy
│   │   ├── BoneGraphic.ts       # Visual bone indicator (line + dot)
│   │   └── AttachmentSprite.ts  # Region → Pixi Sprite
│   ├── ui/
│   │   ├── App.ts               # Root layout
│   │   ├── panels/
│   │   │   ├── HierarchyPanel.ts    # Tree of bones/slots
│   │   │   ├── TimelinePanel.ts     # Keyframes
│   │   │   ├── PropertiesPanel.ts   # Selected bone/slot props
│   │   │   ├── CanvasPanel.ts       # PixiJS canvas + tools
│   │   │   └── AssetPanel.ts        # Atlas images
│   │   ├── tools/
│   │   │   ├── SelectTool.ts
│   │   │   ├── BoneCreateTool.ts
│   │   │   └── RotateTool.ts
│   │   └── styles.css
│   ├── io/
│   │   ├── customFormat.ts      # Load/save .skeleton.json
│   │   ├── spineExport.ts       # Export Spine 4.x JSON
│   │   ├── spineImport.ts       # Import Spine JSON
│   │   └── atlasParser.ts       # Parse .atlas text
│   ├── store/
│   │   └── DocumentStore.ts     # Single source of truth, undo/redo stack
│   ├── particles/               # Phase 5
│   │   └── ParticleEmitter.ts
│   ├── main.ts                  # Entry point
│   └── vite-env.d.ts
├── public/
│   └── index.html
├── tests/                        # Vitest unit tests
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

---

## 6. Render Architecture

```
PixiJS Application
  └─ Stage (Container)
      └─ Skeleton (Container)              ← skeleton root transform
          ├─ Bone "torso" (Container)      ← bone transform applied
          │   ├─ BoneGraphic (Graphics)    ← editor overlay (toggleable)
          │   └─ Bone "head" (Container)
          │       ├─ Slot "face" (Container)
          │       │   └─ Sprite (Sprite)   ← region attachment
          │       └─ BoneGraphic
          ├─ Bone "arm-L" (Container)
          │   └─ ...
          └─ Slot "body" (Container)
              └─ Sprite
```

Pose application:
1. For each bone, compute local transform from setup pose + animation keyframes (interpolated)
2. Walk bone tree, accumulate world transform
3. Apply world transform to Pixi Container
4. Sprites in slots inherit from their bone's Container

---

## 7. Phase Roadmap

### Phase 0 — Foundation (1-2 weeks) ✅ DONE 2026-05-19
- [x] Design doc (this file)
- [x] Project scaffold (Tauri 2 + Vite + TS + PixiJS 8)
- [x] "Hello bone" demo (1 sprite + slider rotation)
- [x] Atlas import test (load KVTM `_BLOOM_DATA` red color)
- [x] Rust 1.95 + VS Build Tools 2022 + MSVC 14.44 installed
- [x] cargo check passes (Tauri deps compile in 2m31s)

### Phase 1 — Core data + render (1-2 months) ✅ MOSTLY DONE 2026-05-19
- [x] Skeleton/Bone/Slot/Attachment data model (`src/core/types.ts`)
- [x] Interpolation — Linear/Stepped/Bezier (`src/core/interpolation.ts`)
- [x] Pose evaluator + 2D affine matrix (`src/core/pose.ts`)
- [x] PixiRenderer — skeleton ↔ Pixi scene bridge (`src/render/PixiRenderer.ts`)
- [x] KVTM importer (`src/io/kvtmImport.ts`)
- [x] Custom format I/O (`src/io/customFormat.ts`)
- [x] Spine 4.x JSON exporter (`src/io/spineExport.ts`)
- [x] **54 unit tests** passing (Vitest)
- [ ] Native Tauri window launch (build in progress)
- [ ] Spine JSON IMPORTER (read .json from other tools)
- [ ] Atlas `.atlas` text parser (Spine's text format)
- [ ] Animation playback loop with `requestAnimationFrame`

### Phase 2 — Skeleton editor (1-2 months)
- Hierarchy panel + bone tree
- Properties panel (TRS inputs)
- Canvas tools: create bone (click-drag), parent/unparent, delete
- Atlas import + attachment assignment

### Phase 3 — Animation timeline (1-2 months)
- Timeline panel UI
- Keyframe insert/edit/delete
- Playback engine (rAF + interpolation)
- Linear/Stepped/Bezier curves
- Multiple animations per skeleton

### Phase 4 — Mesh + IK (1-2 months)
- Mesh attachment (vertices + triangles)
- Weighted vertices (bone influences)
- 2-bone IK constraint
- Transform constraint

### Phase 5 — Particles + Effects (1 month)
- ParticleEmitter component
- Effect timeline (trigger particles on keyframe)
- Shader filters (glow/tint/blur via Pixi filters)

### Phase 6 — Export pipeline (2-3 weeks)
- Spine 4.x JSON export
- Atlas packer (Rust, offline CLI + Tauri-invoked)
- Runtime library for KVTM (TS, separate package)

### Phase 7 — KVTM integration + polish (1 month)
- Migrate KVTM hoa: flipbook → bone anim
- Undo/redo
- Copy/paste keyframes
- Onion skin (show prev/next frames faded)
- Snap-to-grid / snap-to-bone
- Documentation + video tutorial

**Total: 7-13 months solo, full-time.**

---

## 8. Open Questions

1. **Render performance**: Should PixiRenderer use sprite-per-attachment or batch via mesh? (Decide at Phase 1 prototype)
2. **Undo/redo strategy**: Command pattern vs. snapshot-based? (Phase 2 decision)
3. **Particle format**: Match Spine extension if any, or invent? (Phase 5)
4. **Atlas packer algorithm**: MaxRects vs. Skyline vs. Guillotine? (Phase 6, simple MaxRects to start)
5. **KVTM bloom migration**: One bone (current) or multi-bone (cánh/lá riêng)? (Phase 7 — depends on artist re-export)

---

## 9. References

- Spine official format: https://en.esotericsoftware.com/spine-json-format
- Spine runtime (JS): https://github.com/EsotericSoftware/spine-runtimes/tree/4.2/spine-ts
- DragonBones format: https://github.com/DragonBones/DragonBonesJS
- PixiJS v8 docs: https://pixijs.com/8.x/guides
- Tauri 2 docs: https://v2.tauri.app/
- Rive (modern alternative): https://rive.app/community/doc/format/

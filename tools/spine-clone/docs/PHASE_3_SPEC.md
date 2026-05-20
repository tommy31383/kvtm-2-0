# Phase 3 Spec — Timeline Editor + Command Pattern

> **Status**: Draft v1.0 — 2026-05-20
> **Owner**: Tommy
> **Prerequisite**: Phase 2.5 stability fixes (file I/O try-catch, Zod validation)
> **Estimated effort**: 4-6 weeks (1 dev)

---

## 0. Goals & Non-goals

### Goals
1. User có thể **tạo/sửa/xóa keyframe** trực tiếp từ timeline UI
2. **Curve editor visual** (bezier handles) cho easing
3. **Undo/Redo** mọi mutation (Ctrl+Z/Y) — required UX
4. **Copy/paste keyframes** (Ctrl+C/V) — multi-select aware
5. **Animation crossfade** (mix duration giữa 2 animations)
6. **Onion skin** cơ bản (prev/next frame ghost)

### Non-goals (defer to Phase 4+)
- Mesh keyframes (deferred — chưa có mesh attachment render)
- IK target keyframes (deferred — chưa có IK solver)
- Event timeline UI (Phase 5)
- Draw order timeline UI (Phase 5)
- Audio events
- Multi-user collab

---

## 1. Architecture — Command Pattern

### 1.1 Vì sao bắt buộc

Hiện tại `DocumentStore.setBone()` (file `src/store/DocumentStore.ts:124`) dùng `Object.assign(bone, patch)` mutate in-place. Không có cách lấy lại state cũ → không undo được.

### 1.2 Command interface

```ts
// src/store/commands/Command.ts (NEW FILE)

export interface Command {
  /** Human-readable label, hiển thị trong undo history panel */
  readonly label: string;

  /** Apply mutation. Idempotent — gọi nhiều lần kết quả như 1 lần. */
  do(store: DocumentStore): void;

  /** Revert mutation. Phải khôi phục EXACT state trước do(). */
  undo(store: DocumentStore): void;

  /** Optional: merge với command trước (vd: drag chuột → 1 undo unit) */
  coalesceWith?(prev: Command): Command | null;

  /** Timestamp để decay coalesce window (default 500ms) */
  readonly createdAt: number;
}
```

### 1.3 History stack

```ts
// src/store/CommandHistory.ts (NEW FILE)

export class CommandHistory {
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];
  private readonly limit: number;
  private readonly coalesceWindowMs: number;

  constructor(opts: { limit?: number; coalesceWindowMs?: number } = {}) {
    this.limit = opts.limit ?? 200;
    this.coalesceWindowMs = opts.coalesceWindowMs ?? 500;
  }

  execute(store: DocumentStore, cmd: Command): void {
    cmd.do(store);
    this.redoStack = [];  // bất kỳ command mới đều clear redo

    // Coalesce check
    const prev = this.undoStack[this.undoStack.length - 1];
    if (
      prev &&
      cmd.createdAt - prev.createdAt < this.coalesceWindowMs &&
      cmd.coalesceWith
    ) {
      const merged = cmd.coalesceWith(prev);
      if (merged) {
        this.undoStack[this.undoStack.length - 1] = merged;
        return;
      }
    }

    this.undoStack.push(cmd);
    if (this.undoStack.length > this.limit) this.undoStack.shift();
  }

  undo(store: DocumentStore): boolean {
    const cmd = this.undoStack.pop();
    if (!cmd) return false;
    cmd.undo(store);
    this.redoStack.push(cmd);
    return true;
  }

  redo(store: DocumentStore): boolean {
    const cmd = this.redoStack.pop();
    if (!cmd) return false;
    cmd.do(store);
    this.undoStack.push(cmd);
    return true;
  }

  get canUndo() { return this.undoStack.length > 0; }
  get canRedo() { return this.redoStack.length > 0; }
  get undoLabel() { return this.undoStack[this.undoStack.length - 1]?.label; }
  get redoLabel() { return this.redoStack[this.redoStack.length - 1]?.label; }
  clear() { this.undoStack = []; this.redoStack = []; }
}
```

### 1.4 Refactor DocumentStore

**Before** (`src/store/DocumentStore.ts:124-129`):
```ts
setBone(boneName: string, patch: Partial<Bone>) {
  const bone = this.state.skeleton.bones.find(b => b.name === boneName);
  if (!bone) throw new Error(`bone not found: ${boneName}`);
  Object.assign(bone, patch);  // ❌ no undo capability
  this.emit('bone-changed');
}
```

**After**:
```ts
// Direct mutation moved to internal _applyBonePatch() — only commands call this.
_applyBonePatch(boneName: string, patch: Partial<Bone>) {
  const bone = this.state.skeleton.bones.find(b => b.name === boneName);
  if (!bone) throw new Error(`bone not found: ${boneName}`);
  Object.assign(bone, patch);
  this.emit('bone-changed', { boneName });  // typed payload
}

// Public API now creates a command
setBone(boneName: string, patch: Partial<Bone>) {
  this.history.execute(this, new SetBoneCommand(boneName, patch));
}
```

### 1.5 Command catalog (Phase 3)

| Command | Coalesce? | File |
|---|---|---|
| `SetBoneCommand` | ✅ same bone+field within 500ms | `commands/SetBoneCommand.ts` |
| `InsertKeyframeCommand` | ❌ | `commands/InsertKeyframeCommand.ts` |
| `DeleteKeyframeCommand` | ❌ | `commands/DeleteKeyframeCommand.ts` |
| `MoveKeyframeCommand` | ✅ same key, drag gesture | `commands/MoveKeyframeCommand.ts` |
| `SetKeyframeValueCommand` | ✅ same key+field | `commands/SetKeyframeValueCommand.ts` |
| `SetKeyframeCurveCommand` | ✅ same key | `commands/SetKeyframeCurveCommand.ts` |
| `PasteKeyframesCommand` | ❌ | `commands/PasteKeyframesCommand.ts` |
| `CreateAnimationCommand` | ❌ | `commands/CreateAnimationCommand.ts` |
| `DeleteAnimationCommand` | ❌ | `commands/DeleteAnimationCommand.ts` |
| `RenameAnimationCommand` | ❌ | `commands/RenameAnimationCommand.ts` |

### 1.6 Example: SetBoneCommand

```ts
// src/store/commands/SetBoneCommand.ts

import type { Command } from './Command.js';
import type { Bone } from '../../core/types.js';
import type { DocumentStore } from '../DocumentStore.js';

export class SetBoneCommand implements Command {
  readonly label: string;
  readonly createdAt = performance.now();
  private prevValues: Partial<Bone> = {};

  constructor(
    private readonly boneName: string,
    private readonly patch: Partial<Bone>,
  ) {
    const fields = Object.keys(patch).join(',');
    this.label = `Set ${boneName}.${fields}`;
  }

  do(store: DocumentStore): void {
    const bone = store.skeleton.bones.find(b => b.name === this.boneName);
    if (!bone) throw new Error(`bone not found: ${this.boneName}`);
    // Snapshot only fields being changed
    for (const k of Object.keys(this.patch)) {
      (this.prevValues as any)[k] = (bone as any)[k];
    }
    store._applyBonePatch(this.boneName, this.patch);
  }

  undo(store: DocumentStore): void {
    store._applyBonePatch(this.boneName, this.prevValues);
  }

  coalesceWith(prev: Command): Command | null {
    if (!(prev instanceof SetBoneCommand)) return null;
    if (prev.boneName !== this.boneName) return null;
    // Same fields? Then this absorbs prev — keep prev.prevValues as snapshot,
    // this.patch as final value.
    const prevFields = Object.keys(prev.patch).sort().join(',');
    const thisFields = Object.keys(this.patch).sort().join(',');
    if (prevFields !== thisFields) return null;
    const merged = new SetBoneCommand(this.boneName, this.patch);
    merged.prevValues = prev.prevValues;  // keep original snapshot
    return merged;
  }
}
```

---

## 2. Timeline UI

### 2.1 Layout (ASCII mockup)

```
┌─────────────────────────────────────────────────────────────────────┐
│ [Animations ▼] [idle ▼] [+] [⨯] [▶ Play] [⟲ Loop] Mix:[100ms]      │
├─────────────────────────────────────────────────────────────────────┤
│ Time:  0.0s    0.5s    1.0s    1.5s    2.0s    [ruler ticks]      │
│        │       │       │       │       │                            │
│ ▼ arm                                                                │
│   rotate     ◆──────────◆────────◆                                  │
│   translate  ◆──────────────────◆                                   │
│   scale      ◆────────────────────────────◆                         │
│ ▼ leg                                                                │
│   rotate     ◆──╲╱──◆          ◆                                    │
│                                                                      │
│ [Cursor at 0.74s]──────│                                            │
└─────────────────────────────────────────────────────────────────────┘
│ Curve Editor (selected key: arm.rotate @ 0.5s)                      │
│  ╭──────╮                                                            │
│  │  ●   │   Curve: [Linear ▼] [Stepped] [Bezier]                    │
│  │   ╲  │   Easing presets: easeIn easeOut easeInOut elastic       │
│  │    ●─│                                                            │
│  ╰──────╯                                                            │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 Keyframe diamond states

| State | Visual | Meaning |
|---|---|---|
| Normal | ◆ outlined | Linear curve |
| Stepped | ◧ half-fill | Stepped (no interp) |
| Bezier | ◆ filled | Custom curve |
| Selected | ◆ blue glow | User selected |
| Multi-select | ◆ blue glow + box | Range select |
| Dragging | ◆ moving + ghost | Active drag |

### 2.3 Interactions

| Action | Trigger | Command emitted |
|---|---|---|
| Add keyframe | Right-click row → "Add key at T" OR `K` hotkey at playhead | `InsertKeyframeCommand` |
| Delete keyframe | Click key + `Del` OR right-click → Delete | `DeleteKeyframeCommand` |
| Move keyframe time | Drag key horizontally | `MoveKeyframeCommand` (coalesced) |
| Change value | Edit value in Properties panel while key selected | `SetKeyframeValueCommand` (coalesced) |
| Change curve | Curve editor dropdown OR drag bezier handles | `SetKeyframeCurveCommand` (coalesced on drag) |
| Multi-select | Drag rubber-band OR Shift+click | UI state, no command |
| Copy keys | Ctrl+C with selection | Clipboard (JSON) |
| Paste keys | Ctrl+V at playhead | `PasteKeyframesCommand` |
| Scrub time | Drag playhead | `setTime()` (no command — UI state) |
| Zoom timeline | Mouse wheel on ruler | UI state |
| Pan timeline | Middle-drag or space+drag | UI state |

### 2.4 Hotkeys

| Key | Action |
|---|---|
| `K` | Insert key at playhead for selected bone/timeline |
| `Del` / `Backspace` | Delete selected keys |
| `Ctrl+Z` / `Ctrl+Y` | Undo / Redo |
| `Ctrl+Shift+Z` | Redo (alt) |
| `Ctrl+C` / `Ctrl+V` | Copy / Paste keys |
| `Ctrl+A` | Select all keys in current animation |
| `Space` | Play/pause |
| `Home` / `End` | Jump to start/end |
| `,` / `.` | Prev/next keyframe |
| `Shift+K` | Insert key on ALL timelines of selected bone |

---

## 3. Curve Editor

### 3.1 Data model (đã có)

`src/core/types.ts:135`:
```ts
export type CurveType = 'linear' | 'stepped' | [number, number, number, number];
```

Bezier = `[cx1, cy1, cx2, cy2]` — 2 control points trong unit square (Spine-compatible).

### 3.2 Visual

- Canvas 200×200px
- Grid 10×10
- Input curve = bottom-left (0,0), output = top-right (1,1)
- 2 control points draggable (cx1,cy1) và (cx2,cy2)
- Tangent lines từ (0,0)→(cx1,cy1) và (1,1)→(cx2,cy2)
- Real-time preview line cong (60 sample points)

### 3.3 Presets

```ts
const PRESETS: Record<string, [number, number, number, number]> = {
  easeIn:        [0.42, 0,    1,    1],
  easeOut:       [0,    0,    0.58, 1],
  easeInOut:     [0.42, 0,    0.58, 1],
  easeInQuad:    [0.55, 0.085, 0.68, 0.53],
  easeOutQuad:   [0.25, 0.46, 0.45, 0.94],
  easeInOutQuad: [0.455, 0.03, 0.515, 0.955],
  easeInCubic:   [0.55, 0.055, 0.675, 0.19],
  easeOutCubic:  [0.215, 0.61, 0.355, 1],
  easeInOutCubic:[0.645, 0.045, 0.355, 1],
  elastic:       [0.5, -0.5, 0.5, 1.5],  // overshoot
  bounce:        [0.68, -0.55, 0.265, 1.55],
};
```

### 3.4 Implementation note

Bezier evaluator đã tồn tại trong `src/core/interpolation.ts`. Curve editor chỉ cần:
1. Render canvas với current curve
2. Hit-test 2 control points (8px tolerance)
3. Drag → emit `SetKeyframeCurveCommand`

---

## 4. Crossfade (Animation Mixing)

### 4.1 Use case

User switch từ `idle` → `walk` — không snap, mà blend qua 200ms.

### 4.2 Data model addition

```ts
// src/core/types.ts — extend
export interface Skeleton {
  // ... existing ...
  mixTimes?: { [fromAnim: string]: { [toAnim: string]: number } };  // seconds
  defaultMix?: number;  // fallback, default 0
}
```

### 4.3 Runtime blend

```ts
// During mixing, render = lerp(poseFromA, poseFromB, t/mixDuration)
// Where pose = TRS per bone evaluated from each animation independently.
```

UI: matrix table trong Animation panel:
```
     │ idle │ walk │ jump │
─────┼──────┼──────┼──────┤
idle │  —   │ 200ms│ 100ms│
walk │ 200ms│  —   │ 150ms│
jump │ 100ms│ 150ms│  —   │
```

---

## 5. Onion Skin

### 5.1 Concept

Hiển thị ghost của skeleton ở t-Δ và t+Δ với opacity giảm.

### 5.2 UI

Toggle button + 2 sliders:
- Prev frames count (0-5)
- Next frames count (0-5)
- Frame step (10ms / 50ms / 100ms / 500ms)
- Opacity (default 0.3)

### 5.3 Implementation

```ts
// PixiRenderer: render N+1 skeletons per frame
// Main: at currentTime, opacity 1.0
// Ghosts: at currentTime ± k*step, opacity * (1 - k/N)
// Ghost color tint: red for past, green for future (Spine convention)
```

⚠️ **Perf concern**: 11 ghosts × N bones = 11N sprites. Mitigation:
- Only render ghosts when animation is paused (not during playback)
- Disable in 60fps preview mode

---

## 6. File Changes Summary

### New files (~12)
```
src/store/commands/
├── Command.ts                       (interface + base class)
├── SetBoneCommand.ts
├── InsertKeyframeCommand.ts
├── DeleteKeyframeCommand.ts
├── MoveKeyframeCommand.ts
├── SetKeyframeValueCommand.ts
├── SetKeyframeCurveCommand.ts
├── PasteKeyframesCommand.ts
├── CreateAnimationCommand.ts
├── DeleteAnimationCommand.ts
└── RenameAnimationCommand.ts

src/store/CommandHistory.ts
src/ui/TimelinePanel.ts                (new — replace existing stub)
src/ui/CurveEditorPanel.ts             (new)
src/ui/OnionSkinControl.ts             (new)
src/render/OnionSkinRenderer.ts        (new)
```

### Modified files
```
src/store/DocumentStore.ts             (add history, _applyBonePatch, typed events)
src/core/types.ts                      (add mixTimes, defaultMix)
src/ui/Editor.ts                       (wire hotkeys, panels)
src/render/PixiRenderer.ts             (support mix blend, ghost render)
```

### New tests (~8)
```
tests/commands/
├── SetBoneCommand.test.ts             (do, undo, coalesce)
├── InsertKeyframeCommand.test.ts
├── MoveKeyframeCommand.test.ts
└── PasteKeyframesCommand.test.ts

tests/CommandHistory.test.ts           (stack, limit, redo clear, coalesce window)
tests/TimelinePanel.test.ts            (DOM interactions via JSDOM)
tests/curveEditor.test.ts              (preset values, hit-test)
tests/mixing.test.ts                   (blend math)
```

---

## 7. Implementation Order (5-6 weeks)

### Week 1 — Foundation
- [ ] `Command.ts` interface
- [ ] `CommandHistory.ts` + tests
- [ ] Refactor `DocumentStore` → add `_applyBonePatch`, typed events
- [ ] `SetBoneCommand` + test (coalesce edge cases)
- [ ] Wire Ctrl+Z/Y hotkeys
- [ ] **Milestone**: existing setBone() flows through commands, undo works

### Week 2 — Keyframe CRUD
- [ ] `InsertKeyframeCommand` / `DeleteKeyframeCommand` + tests
- [ ] Timeline ruler + scrubber rebuild (canvas-based)
- [ ] Keyframe rendering (diamond shapes per row)
- [ ] Click-to-select, Shift+click multi-select, rubber-band
- [ ] Right-click context menu
- [ ] **Milestone**: User add/delete keys, undo works

### Week 3 — Move / Edit
- [ ] `MoveKeyframeCommand` with drag coalesce
- [ ] `SetKeyframeValueCommand` from Properties panel
- [ ] Snap-to-grid option (0.1s grid)
- [ ] Multi-key drag (preserve relative timing)
- [ ] **Milestone**: full keyframe editing

### Week 4 — Curve editor
- [ ] `CurveEditorPanel.ts` — canvas + control points
- [ ] 11 easing presets
- [ ] `SetKeyframeCurveCommand`
- [ ] Visual feedback in timeline (curve hint between keys)
- [ ] **Milestone**: bezier curves editable

### Week 5 — Copy/Paste + Crossfade
- [ ] `PasteKeyframesCommand` + clipboard (JSON serialize)
- [ ] Selection box for Ctrl+A
- [ ] Mixing UI matrix
- [ ] Runtime mix blend in renderer
- [ ] **Milestone**: copy/paste, crossfade work

### Week 6 — Onion skin + Polish
- [ ] Onion skin renderer
- [ ] Animation create/delete/rename commands
- [ ] Undo history panel (sidebar)
- [ ] Performance: profile + optimize
- [ ] Documentation update
- [ ] **Milestone**: Phase 3 done

---

## 8. Acceptance Criteria

Phase 3 ships when:

1. ✅ User load skeleton → create new animation → add 5 keyframes → play preview → save → reload → identical playback
2. ✅ Every mutation (bone, keyframe) reversible via Ctrl+Z
3. ✅ Undo stack survives ≥200 operations without memory growth issue
4. ✅ Drag keyframe = 1 undo unit (not 60 micro-mutations)
5. ✅ Bezier curve editor: drag handle → live preview → snap to preset
6. ✅ Copy keys from anim A, paste to anim B at playhead time
7. ✅ Mix from idle→walk visible (no snap)
8. ✅ Onion skin shows 3 prev + 3 next ghost when paused
9. ✅ All existing 87 tests still pass + 8 new test files green
10. ✅ Export Spine JSON → import in Spine official → animations play correctly

---

## 9. Open questions

1. **Curve editor live update during drag** — emit command on `mouseup` only, or throttled during drag? → **Decision needed**
2. **Undo across project load** — clear history on `setProject()`? → **Recommend YES** (current decision)
3. **Coalesce window 500ms enough?** — Photoshop uses 1000ms, Figma uses 250ms. → **Default 500ms, expose setting**
4. **Onion skin during playback** — disable or render at low FPS? → **Disable by default**
5. **Animation mix file format** — store in skeleton JSON or separate file? → **In skeleton** (Spine-compat extension)

---

## 10. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Command coalesce bugs cause data loss | Medium | High | Extensive unit tests + integration test với 1000-step undo |
| Onion skin perf tanks 60fps | High | Medium | Disable during playback, profile early |
| Curve editor UX confusing (CSS cubic-bezier hard) | Medium | Medium | Add tooltip, presets prominent |
| Bezier endpoint clamp (cy can go negative) | Low | Medium | Allow but warn (elastic uses it) |
| Memory: 200 undo × 100 bone snapshots = 20k objects | Low | Low | Snapshot only changed fields (already in spec §1.6) |

---

## 11. Future hooks (Phase 4-5 prep)

Spec này thiết kế sao cho Phase 4 dễ add:
- `IKConstraint` keyframes → new `SlotTimeline.ikMix` field, reuse curve system
- Mesh deform keyframes → new `MeshTimeline.deform` with vertex array
- Event keyframes → separate Events row trong timeline UI
- Draw order → separate Draw Order row

State Machine (Phase 5) sẽ là layer riêng — **không động** vào Animation timeline system.

---

**End of Phase 3 Spec v1.0**

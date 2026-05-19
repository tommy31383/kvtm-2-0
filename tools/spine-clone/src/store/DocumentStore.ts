// DocumentStore — single source of truth for editor state.
//
// Holds the active project (skeleton + atlas) + UI state (selection, current
// animation, playback time). Subscribers (panels, renderer) listen for change
// events and re-render selectively.
//
// Design choice: event-based pub/sub over Redux. Smaller surface area, no
// boilerplate, matches the imperative DOM/Pixi update pattern.
//
// Future: undo/redo via Command pattern (Phase 2 enhancement). Each mutator
// method will create a Command and push to history stack.

import type { Skeleton, Atlas } from '../core/types.js';

export type Selection =
  | { type: 'none' }
  | { type: 'bone'; name: string }
  | { type: 'slot'; name: string }
  | { type: 'attachment'; slot: string; name: string };

export type StoreEvent =
  | 'project-changed'         // skeleton / atlas swapped wholesale
  | 'selection-changed'
  | 'animation-changed'       // current animation switched
  | 'time-changed'            // playback time scrubbed
  | 'bone-changed'            // bone properties edited
  | 'slot-changed'
  | 'attachment-changed'
  | 'playback-state-changed'; // playing/paused

export interface DocumentState {
  skeleton: Skeleton;
  atlas: Atlas;
  selection: Selection;
  currentAnimation: string | undefined;
  currentTimeSec: number;
  playing: boolean;
}

type Listener = () => void;

export class DocumentStore {
  private state: DocumentState;
  private listeners = new Map<StoreEvent, Set<Listener>>();

  constructor(initial: { skeleton: Skeleton; atlas: Atlas }) {
    this.state = {
      skeleton: initial.skeleton,
      atlas: initial.atlas,
      selection: { type: 'none' },
      // Don't auto-select an animation — Spine "icon" anims (duration 0) often
      // HIDE most slots at t=0, making the skeleton appear empty. Default to
      // setup pose (no animation) so the user sees the natural skeleton state.
      currentAnimation: undefined,
      currentTimeSec: 0,
      playing: false,
    };
  }

  // ── Read API ────────────────────────────────────────────────
  get skeleton(): Skeleton { return this.state.skeleton; }
  get atlas(): Atlas { return this.state.atlas; }
  get selection(): Selection { return this.state.selection; }
  get currentAnimation(): string | undefined { return this.state.currentAnimation; }
  get currentTimeSec(): number { return this.state.currentTimeSec; }
  get playing(): boolean { return this.state.playing; }

  // Animation duration helper — used by timeline panel
  get currentDuration(): number {
    const anim = this.state.currentAnimation
      ? this.state.skeleton.animations[this.state.currentAnimation]
      : undefined;
    return anim?.duration ?? 0;
  }

  // ── Mutation API ────────────────────────────────────────────
  setProject(skeleton: Skeleton, atlas: Atlas) {
    this.state.skeleton = skeleton;
    this.state.atlas = atlas;
    this.state.selection = { type: 'none' };
    // Setup pose default — see constructor comment
    this.state.currentAnimation = undefined;
    this.state.currentTimeSec = 0;
    this.state.playing = false;
    this.emit('project-changed');
    this.emit('selection-changed');
    this.emit('animation-changed');
    this.emit('time-changed');
  }

  setSelection(sel: Selection) {
    if (this.selectionEquals(this.state.selection, sel)) return;
    this.state.selection = sel;
    this.emit('selection-changed');
  }

  setCurrentAnimation(name: string | undefined) {
    if (this.state.currentAnimation === name) return;
    this.state.currentAnimation = name;
    this.state.currentTimeSec = 0;
    this.emit('animation-changed');
    this.emit('time-changed');
  }

  setTime(t: number) {
    const dur = this.currentDuration;
    const clamped = Math.max(0, Math.min(dur, t));
    if (this.state.currentTimeSec === clamped) return;
    this.state.currentTimeSec = clamped;
    this.emit('time-changed');
  }

  setPlaying(playing: boolean) {
    if (this.state.playing === playing) return;
    this.state.playing = playing;
    this.emit('playback-state-changed');
  }

  /**
   * Update a bone property (e.g. setBone('arm', { rotation: 45 })).
   * Mutates in place + emits bone-changed. Phase 2 undo/redo will replace
   * direct mutation with Command pattern.
   */
  setBone(boneName: string, patch: Partial<import('../core/types.js').Bone>) {
    const bone = this.state.skeleton.bones.find(b => b.name === boneName);
    if (!bone) throw new Error(`bone not found: ${boneName}`);
    Object.assign(bone, patch);
    this.emit('bone-changed');
  }

  // ── Subscription API ────────────────────────────────────────
  on(event: StoreEvent, fn: Listener): () => void {
    let set = this.listeners.get(event);
    if (!set) { set = new Set(); this.listeners.set(event, set); }
    set.add(fn);
    return () => { set!.delete(fn); };
  }

  private emit(event: StoreEvent) {
    const set = this.listeners.get(event);
    if (set) set.forEach(fn => {
      try { fn(); } catch (err) { console.error(`[store] ${event} listener error:`, err); }
    });
  }

  private selectionEquals(a: Selection, b: Selection): boolean {
    if (a.type !== b.type) return false;
    if (a.type === 'bone' && b.type === 'bone') return a.name === b.name;
    if (a.type === 'slot' && b.type === 'slot') return a.name === b.name;
    if (a.type === 'attachment' && b.type === 'attachment') return a.slot === b.slot && a.name === b.name;
    return true;  // both 'none'
  }
}

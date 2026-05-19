// PixiRenderer — bridges spine-clone data model to PixiJS scene graph.
//
// Architecture:
//   - 1 Pixi Container per bone (containers hold transforms)
//   - 1 Pixi Container per slot (child of slot.bone's container)
//   - 1 Pixi Sprite per slot (child of slot container, swapped per attachment)
//   - Texture cache: keyed by atlas region name → Texture(source, frame)
//
// Update cycle (call render() each frame with new time `t`):
//   1. evaluatePose(skeleton, animName, t) → WorldTransforms + slot attachments
//   2. For each bone, set its Container's .position/.rotation/.scale from
//      the decomposed local transform (Pixi handles parent inheritance via
//      the container hierarchy — we feed LOCAL transforms, not world)
//   3. For each slot, swap sprite texture if attachment changed
//
// We feed LOCAL transforms because Pixi already multiplies parent's matrix
// when rendering. Decomposing world is only useful when bones aren't nested
// in Pixi's tree — but here they ARE nested, so local is correct.

import {
  Application, Container, Sprite, Texture, Rectangle, Graphics,
} from 'pixi.js';
import type { Skeleton, Atlas, RegionAttachment } from '../core/types.js';
import { evaluateLocalTransform } from '../core/pose.js';

export interface PixiRendererOptions {
  /** Show small ⊕ marker at each bone's origin. */
  showBoneGizmos?: boolean;
  /** Color of the bone origin marker. */
  boneColor?: number;
}

export class PixiRenderer {
  readonly root: Container;
  readonly app: Application;
  readonly skeleton: Skeleton;

  private atlas: Atlas;
  private sheetTexture: Texture;
  private regionTextures = new Map<string, Texture>();

  // One Container per bone, keyed by bone name. Parent container = parent bone's Container.
  private boneContainers = new Map<string, Container>();
  // One Container per slot (child of slot.bone's Container).
  private slotContainers = new Map<string, Container>();
  // One Sprite per slot for the active attachment.
  private slotSprites = new Map<string, Sprite>();
  // Track current attachment name so we only swap textures when it changes.
  private currentAttachment = new Map<string, string | null | undefined>();
  // Bone gizmo Graphics for editor display.
  private boneGizmos = new Map<string, Graphics>();

  private options: Required<PixiRendererOptions>;

  constructor(
    app: Application,
    skeleton: Skeleton,
    atlas: Atlas,
    sheetTexture: Texture,
    options: PixiRendererOptions = {},
  ) {
    this.app = app;
    this.skeleton = skeleton;
    this.atlas = atlas;
    this.sheetTexture = sheetTexture;
    this.options = {
      showBoneGizmos: options.showBoneGizmos ?? true,
      boneColor: options.boneColor ?? 0xff8a3d,
    };

    this.root = new Container();
    this.root.label = 'skeleton-root';

    this.buildAtlasTextures();
    this.buildBoneTree();
    this.buildSlots();
  }

  /** Pre-create a Texture for every atlas region (sub-rect of the sheet). */
  private buildAtlasTextures() {
    for (const page of this.atlas.pages) {
      for (const region of page.regions) {
        const tex = new Texture({
          source: this.sheetTexture.source,
          frame: new Rectangle(region.x, region.y, region.width, region.height),
        });
        this.regionTextures.set(region.name, tex);
      }
    }
  }

  /** Build Pixi Container hierarchy mirroring the bone tree. */
  private buildBoneTree() {
    // Two-pass: first create all containers, then parent them.
    for (const b of this.skeleton.bones) {
      const c = new Container();
      c.label = `bone:${b.name}`;
      this.boneContainers.set(b.name, c);

      if (this.options.showBoneGizmos) {
        const g = new Graphics();
        g.circle(0, 0, 4).fill({ color: this.options.boneColor, alpha: 0.8 });
        g.circle(0, 0, 1.5).fill({ color: 0xffffff });
        c.addChild(g);
        this.boneGizmos.set(b.name, g);
      }
    }
    // Parent each bone's container under its parent (or root for bones with no parent).
    for (const b of this.skeleton.bones) {
      const c = this.boneContainers.get(b.name)!;
      if (b.parent) {
        const p = this.boneContainers.get(b.parent);
        if (!p) throw new Error(`bone parent not found: ${b.parent}`);
        p.addChild(c);
      } else {
        this.root.addChild(c);
      }
    }
  }

  /** Build slot containers + sprite holders, parented under each slot's bone. */
  private buildSlots() {
    for (const slot of this.skeleton.slots) {
      const boneC = this.boneContainers.get(slot.bone);
      if (!boneC) throw new Error(`slot bone not found: ${slot.bone}`);
      const sc = new Container();
      sc.label = `slot:${slot.name}`;
      boneC.addChild(sc);
      this.slotContainers.set(slot.name, sc);

      // Sprite — texture set per-frame via setAttachment.
      const sp = new Sprite();
      sp.label = `attach:${slot.name}`;
      // KVTM convention: bottom-center anchor so flowers grow from stem.
      sp.anchor.set(0.5, 1.0);
      sc.addChild(sp);
      this.slotSprites.set(slot.name, sp);

      // Setup-pose attachment
      if (slot.attachment) {
        this.setAttachment(slot.name, slot.attachment);
      }
    }
  }

  /** Update the sprite of `slotName` to show `attachmentName`. */
  setAttachment(slotName: string, attachmentName: string | null | undefined) {
    const current = this.currentAttachment.get(slotName);
    if (current === attachmentName) return;       // no change
    this.currentAttachment.set(slotName, attachmentName);

    const sprite = this.slotSprites.get(slotName);
    if (!sprite) return;

    if (!attachmentName) {
      sprite.visible = false;
      return;
    }
    // Resolve attachment def → atlas region path
    const slot = this.skeleton.slots.find(s => s.name === slotName);
    if (!slot) return;
    const skin = this.skeleton.skins[0]; // Phase 1: default skin only
    const att = skin?.attachments[slotName]?.[attachmentName] as RegionAttachment | undefined;
    if (!att || att.type !== 'region') {
      sprite.visible = false;
      return;
    }
    const tex = this.regionTextures.get(att.path ?? attachmentName);
    if (!tex) {
      sprite.visible = false;
      return;
    }
    sprite.texture = tex;
    sprite.x = att.x;
    sprite.y = att.y;
    sprite.rotation = (att.rotation * Math.PI) / 180;
    sprite.scale.set(att.scaleX, att.scaleY);
    sprite.visible = true;
  }

  /**
   * Render at time `t` seconds using animation `animName` (undefined → setup pose).
   * Updates bone Container transforms + slot attachment swaps.
   */
  render(animName: string | undefined, t: number) {
    const anim = animName ? this.skeleton.animations[animName] : undefined;

    // 1. Update bone local transforms
    for (const bone of this.skeleton.bones) {
      const c = this.boneContainers.get(bone.name);
      if (!c) continue;
      const local = evaluateLocalTransform(bone, anim, t);
      c.x = local.x;
      c.y = local.y;
      c.rotation = (local.rotation * Math.PI) / 180;
      c.scale.set(local.scaleX, local.scaleY);
    }

    // 2. Update slot attachments from animation
    for (const slot of this.skeleton.slots) {
      let active: string | null | undefined = slot.attachment;
      const tl = anim?.slots?.[slot.name];
      if (tl?.attachment && tl.attachment.length) {
        let v: string | null | undefined = tl.attachment[0].value;
        for (const k of tl.attachment) {
          if (k.time <= t) v = k.value;
          else break;
        }
        active = v;
      }
      this.setAttachment(slot.name, active);
    }
  }

  /** Toggle visibility of bone gizmos (orange dots). */
  setBoneGizmosVisible(visible: boolean) {
    this.options.showBoneGizmos = visible;
    this.boneGizmos.forEach(g => { g.visible = visible; });
  }

  /** Tear-down: remove from stage + free textures. */
  destroy() {
    this.regionTextures.forEach(t => t.destroy());
    this.regionTextures.clear();
    this.root.destroy({ children: true });
  }
}

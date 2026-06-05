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
  private sheetTexture?: Texture;
  private regionTextures = new Map<string, Texture>();

  // One Container per bone, keyed by bone name. Parent container = parent bone's Container.
  private boneContainers = new Map<string, Container>();
  // One Container per slot (child of slot.bone's Container).
  private slotContainers = new Map<string, Container>();
  // Slot visuals: sprite (for textured attachments) + placeholder (when no texture)
  private slotSprites = new Map<string, Sprite>();
  private slotPlaceholders = new Map<string, Graphics>();
  // Track current attachment name so we only swap textures when it changes.
  private currentAttachment = new Map<string, string | null | undefined>();
  // Bone gizmo Graphics for editor display.
  private boneGizmos = new Map<string, Graphics>();

  private options: Required<PixiRendererOptions>;

  constructor(
    app: Application,
    skeleton: Skeleton,
    atlas: Atlas,
    sheetTexture: Texture | undefined,
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

  /** Pre-create a Texture for every atlas region (sub-rect of the sheet).
   *  For rotated regions (packed 90° to fit tighter), the frame in the atlas
   *  is h-wide × w-tall — swap dimensions when creating the Texture. The
   *  sprite then needs counter-rotation by -90° (handled in setAttachment). */
  private buildAtlasTextures() {
    if (!this.sheetTexture) return;
    this.regionTextures.clear();
    for (const page of this.atlas.pages) {
      for (const region of page.regions) {
        const w = region.rotate ? region.height : region.width;
        const h = region.rotate ? region.width  : region.height;
        const tex = new Texture({
          source: this.sheetTexture.source,
          frame: new Rectangle(region.x, region.y, w, h),
        });
        this.regionTextures.set(region.name, tex);
      }
    }
  }

  /**
   * Draw a Spine-style bone gizmo: a wedge from origin → length tip + origin
   * dot. Length 0 (or unset) → just the origin dot.
   */
  private drawBoneGizmo(g: Graphics, length: number): void {
    g.clear();
    const col = this.options.boneColor;
    if (length > 0) {
      // Wedge: triangular body from origin to tip — width tapers from 4px at
      // base to 0 at tip (Spine convention so direction is visible).
      const w = Math.max(3, Math.min(6, length * 0.15));
      g.poly([0, -w / 2, length, 0, 0, w / 2]).fill({ color: col, alpha: 0.55 });
      g.stroke({ color: col, width: 1, alpha: 0.9 });
      // Tip dot
      g.circle(length, 0, 2).fill({ color: 0xffffff });
    }
    // Origin dot (always)
    g.circle(0, 0, 4).fill({ color: col, alpha: 0.9 });
    g.circle(0, 0, 1.5).fill({ color: 0xffffff });
  }

  /** Look up region metadata (for rotation flag) by name. */
  private findRegion(name: string) {
    for (const page of this.atlas.pages) {
      for (const r of page.regions) {
        if (r.name === name) return r;
      }
    }
    return undefined;
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
        this.drawBoneGizmo(g, b.length || 0);
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
      sp.anchor.set(0.5, 0.5); // Spine center pivot
      sc.addChild(sp);
      this.slotSprites.set(slot.name, sp);

      // Placeholder rect — shown when attachment has no texture (no atlas/png loaded)
      const ph = new Graphics();
      ph.label = `placeholder:${slot.name}`;
      ph.visible = false;
      sc.addChild(ph);
      this.slotPlaceholders.set(slot.name, ph);

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
    const placeholder = this.slotPlaceholders.get(slotName);
    if (!sprite || !placeholder) return;

    if (!attachmentName) {
      sprite.visible = false;
      placeholder.visible = false;
      return;
    }
    const skin = this.skeleton.skins[0]; // Phase 1: default skin only
    const att = skin?.attachments[slotName]?.[attachmentName] as RegionAttachment | undefined;
    if (!att || att.type !== 'region') {
      sprite.visible = false;
      placeholder.visible = false;
      return;
    }
    const regionName = att.path ?? attachmentName;
    const tex = this.regionTextures.get(regionName);
    if (tex) {
      // Has texture — show real sprite at attachment's render size.
      sprite.texture = tex;
      // Spine Y-up → Pixi Y-down: negate attachment Y offset
      sprite.x = att.x;
      sprite.y = -att.y;
      // attachment.width/height = skeleton-space pixel size. If 0/missing,
      // use the texture's natural size.
      const renderW = (att.width  && att.width  > 0) ? att.width  : tex.width;
      const renderH = (att.height && att.height > 0) ? att.height : tex.height;
      sprite.width  = renderW * (att.scaleX || 1);
      sprite.height = renderH * (att.scaleY || 1);
      // Combine Spine attachment rotation (negated for Y-down) + atlas pack rotation.
      // Atlas-rotated regions (rotate=true): packed 90° CW, texture is rotated,
      // sprite needs counter -90°.
      const region = this.findRegion(regionName);
      const atlasRotDeg = region?.rotate ? -90 : 0;
      sprite.rotation = ((-(att.rotation || 0) + atlasRotDeg) * Math.PI) / 180;
      sprite.visible = true;
      placeholder.visible = false;
    } else {
      // No texture — show colored placeholder rect at attachment dimensions
      sprite.visible = false;
      placeholder.clear();
      const w = att.width || 32;
      const h = att.height || 32;
      // Hash-based color from name so each attachment is distinguishable
      const hue = hashHue(attachmentName);
      const fill = hslToHex(hue, 60, 40);
      const stroke = hslToHex(hue, 70, 65);
      placeholder.rect(-w/2 + att.x, -h/2 + att.y, w, h)
        .fill({ color: fill, alpha: 0.4 })
        .stroke({ color: stroke, width: 1.5, alpha: 0.9 });
      placeholder.rotation = (att.rotation * Math.PI) / 180;
      placeholder.scale.set(att.scaleX, att.scaleY);
      placeholder.visible = true;
    }
  }

  /**
   * Render at time `t` seconds using animation `animName` (undefined → setup pose).
   * Updates bone Container transforms + slot attachment swaps.
   */
  render(animName: string | undefined, t: number) {
    const anim = animName ? this.skeleton.animations[animName] : undefined;

    // 1. Update bone local transforms + redraw gizmo if length changed
    for (const bone of this.skeleton.bones) {
      const c = this.boneContainers.get(bone.name);
      if (!c) continue;
      const local = evaluateLocalTransform(bone, anim, t);
      c.x = local.x;
      c.y = local.y;
      c.rotation = (local.rotation * Math.PI) / 180;
      c.scale.set(local.scaleX, local.scaleY);
      const g = this.boneGizmos.get(bone.name);
      if (g) this.drawBoneGizmo(g, bone.length || 0);
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

// ── Placeholder color helpers ──────────────────────────────────
function hashHue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h) % 360;
}
function hslToHex(h: number, s: number, l: number): number {
  s /= 100; l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const r = Math.round(255 * f(0));
  const g = Math.round(255 * f(8));
  const b = Math.round(255 * f(4));
  return (r << 16) | (g << 8) | b;
}


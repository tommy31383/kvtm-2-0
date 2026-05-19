// Spine Clone — Phase 0 prototype entry
//
// What this validates so far:
//   - Phase 0.3 "Hello bone": PixiJS Container parent/child = bone hierarchy
//   - Phase 0.4 KVTM atlas import: load existing _BLOOM_DATA, render frames
//     as RegionAttachments cycling through a "bloom" animation
//
// Scrub the timeline slider to step through bloom frames — each frame is a
// different module from the atlas, swapped via attachment timeline (stepped).

import { Application, Container, Graphics, Sprite, Texture, Rectangle, Assets } from 'pixi.js';
import { loadKvtmSample } from './io/kvtmImport.js';
import type { ImportResult } from './io/kvtmImport.js';
import type { Skeleton, RegionAttachment } from './core/types.js';

const canvasHost = document.getElementById('canvas-host') as HTMLDivElement;
const rotSlider  = document.getElementById('rot-slider') as HTMLInputElement;
const rotVal     = document.getElementById('rot-val') as HTMLSpanElement;
const scaleSlider = document.getElementById('scale-slider') as HTMLInputElement;
const scaleVal    = document.getElementById('scale-val') as HTMLSpanElement;
const resetBtn   = document.getElementById('reset-btn') as HTMLButtonElement;
const statusMsg  = document.getElementById('status-msg') as HTMLSpanElement;
const propRot    = document.getElementById('prop-rot') as HTMLSpanElement;
const propScale  = document.getElementById('prop-scale') as HTMLSpanElement;
const boneTree   = document.getElementById('bone-tree') as HTMLUListElement;

async function boot() {
  const app = new Application();
  await app.init({
    background: 0x0c0f15,
    resizeTo: canvasHost,
    antialias: true,
    autoDensity: true,
    resolution: window.devicePixelRatio || 1,
  });
  canvasHost.appendChild(app.canvas);

  // World root — centered in canvas
  const world = new Container();
  app.stage.addChild(world);
  const recenter = () => {
    world.x = canvasHost.clientWidth / 2;
    world.y = canvasHost.clientHeight / 2 + 100; // a bit lower so flower has room above
  };
  recenter();
  window.addEventListener('resize', recenter);

  // Center axes for reference
  const axes = new Graphics();
  axes.moveTo(-400, 0).lineTo(400, 0).stroke({ color: 0x60a5fa, width: 1, alpha: 0.12 });
  axes.moveTo(0, -400).lineTo(0, 400).stroke({ color: 0x60a5fa, width: 1, alpha: 0.12 });
  world.addChild(axes);

  // Root bone (visual only)
  const rootBone = new Container();
  world.addChild(rootBone);
  const boneGraphic = new Graphics();
  boneGraphic.circle(0, 0, 5).fill({ color: 0xff8a3d, alpha: 0.9 });
  boneGraphic.circle(0, 0, 2).fill({ color: 0xffffff });
  rootBone.addChild(boneGraphic);

  // ── Phase 0.4: load KVTM sample bloom data + sheet ────────────
  statusMsg.textContent = '⏳ Loading KVTM bloom sample...';
  let importResult: ImportResult;
  let sheetTexture: Texture;
  try {
    importResult = await loadKvtmSample('/sample-assets/kvtm-bloom-red.json', 'flower_red_bloom.webp');
    sheetTexture = await Assets.load<Texture>('/sample-assets/flower_red_bloom.webp');
  } catch (err: any) {
    statusMsg.textContent = '❌ Load sample failed: ' + (err?.message || String(err));
    return;
  }

  const skeleton: Skeleton = importResult.skeleton;
  console.log('[spine-clone] imported skeleton:', skeleton);
  console.log('[spine-clone] atlas regions:', importResult.atlas.pages[0].regions.length);

  // Update hierarchy panel
  boneTree.innerHTML = '';
  skeleton.bones.forEach(b => {
    const li = document.createElement('li');
    li.className = 'tree-item' + (b.name === 'root' ? ' selected' : '');
    li.textContent = b.name;
    boneTree.appendChild(li);
  });
  skeleton.slots.forEach(s => {
    const li = document.createElement('li');
    li.className = 'tree-item';
    li.style.paddingLeft = '20px';
    li.textContent = `📎 ${s.name}`;
    boneTree.appendChild(li);
  });

  // ── Render: a sprite child of rootBone, swapped each frame ───
  const flowerSlot = new Container();
  rootBone.addChild(flowerSlot);

  const attachmentSprite = new Sprite();
  attachmentSprite.anchor.set(0.5, 1.0); // bottom-center pivot (KVTM convention)
  flowerSlot.addChild(attachmentSprite);

  // Helper: swap sprite to a named module's atlas region
  function setAttachment(name: string) {
    const att = skeleton.skins[0].attachments.flower[name] as RegionAttachment | undefined;
    const region = importResult.atlas.pages[0].regions.find(r => r.name === name);
    if (!att || !region) {
      console.warn('attachment not found:', name);
      return;
    }
    const tex = new Texture({
      source: sheetTexture.source,
      frame: new Rectangle(region.x, region.y, region.width, region.height),
    });
    attachmentSprite.texture = tex;
    attachmentSprite.x = att.x;
    attachmentSprite.y = att.y;
  }

  // ── Build a timeline scrubber from the "bloom" anim ───────────
  const bloomAnim = skeleton.animations['bloom'];
  if (!bloomAnim || !bloomAnim.slots.flower?.attachment) {
    statusMsg.textContent = '❌ no bloom animation in sample';
    return;
  }
  const keys = bloomAnim.slots.flower.attachment;

  // Replace the rot/scale sliders' duty: rot = play position, scale = scale ;)
  rotSlider.min = '0';
  rotSlider.max = String(bloomAnim.duration * 1000); // ms
  rotSlider.step = '10';
  rotSlider.value = '0';

  function applyFromSliders() {
    const tMs = parseFloat(rotSlider.value);
    const tSec = tMs / 1000;
    // Pick latest key whose time <= tSec (stepped)
    let frameName: string | null = keys[0].value;
    for (const k of keys) {
      if (k.time <= tSec) frameName = k.value;
      else break;
    }
    if (frameName) setAttachment(frameName);

    const sc = parseFloat(scaleSlider.value);
    flowerSlot.scale.set(sc);
    rotVal.textContent = `${tMs.toFixed(0)}ms`;
    scaleVal.textContent = sc.toFixed(2);
    propRot.textContent = frameName || '—';
    propScale.textContent = sc.toFixed(2);
  }
  rotSlider.addEventListener('input', applyFromSliders);
  scaleSlider.addEventListener('input', applyFromSliders);
  resetBtn.addEventListener('click', () => {
    rotSlider.value = '0';
    scaleSlider.value = '1';
    applyFromSliders();
  });

  // Relabel the slider in DOM
  const rotLabel = rotSlider.parentElement;
  if (rotLabel && rotLabel.firstChild) {
    rotLabel.firstChild.textContent = `Time `;
  }

  applyFromSliders();
  statusMsg.textContent = `✅ KVTM bloom imported · ${skeleton.bones.length} bone · ${skeleton.slots.length} slot · ${Object.keys(skeleton.skins[0].attachments.flower).length} attachments · "bloom" anim ${bloomAnim.duration.toFixed(2)}s`;
}

window.addEventListener('DOMContentLoaded', () => {
  boot().catch(err => {
    console.error(err);
    statusMsg.textContent = '❌ ' + (err?.message || String(err));
  });
});

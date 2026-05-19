// Spine Clone — Phase 1 entry
//
// What this validates:
//   - Phase 0.3 Hello bone: PixiJS Container parent/child = bone hierarchy
//   - Phase 0.4 KVTM import: load _BLOOM_DATA, convert to Skeleton+Atlas
//   - Phase 1 PixiRenderer: bridge skeleton ↔ Pixi scene graph cleanly
//   - Phase 1 Pose evaluator: animation timelines drive bone transforms
//
// Scrub timeline slider → renderer reads skeleton.animations[bloom] at time t
// → swaps the "flower" slot's attachment via stepped timeline.

import { Application, Container, Graphics, Texture, Assets } from 'pixi.js';
import { loadKvtmSample } from './io/kvtmImport.js';
import { PixiRenderer } from './render/PixiRenderer.js';

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

  // World root — centered in canvas, a bit below center so flower has room above
  const world = new Container();
  app.stage.addChild(world);
  const recenter = () => {
    world.x = canvasHost.clientWidth / 2;
    world.y = canvasHost.clientHeight / 2 + 80;
  };
  recenter();
  window.addEventListener('resize', recenter);

  // Reference axes
  const axes = new Graphics();
  axes.moveTo(-400, 0).lineTo(400, 0).stroke({ color: 0x60a5fa, width: 1, alpha: 0.12 });
  axes.moveTo(0, -400).lineTo(0, 400).stroke({ color: 0x60a5fa, width: 1, alpha: 0.12 });
  world.addChild(axes);

  // ── Load KVTM sample ──────────────────────────────────────────
  statusMsg.textContent = '⏳ Loading KVTM bloom sample...';
  let importResult;
  let sheetTexture: Texture;
  try {
    importResult = await loadKvtmSample('/sample-assets/kvtm-bloom-red.json', 'flower_red_bloom.webp');
    sheetTexture = await Assets.load<Texture>('/sample-assets/flower_red_bloom.webp');
  } catch (err: any) {
    statusMsg.textContent = '❌ Load sample failed: ' + (err?.message || String(err));
    return;
  }
  const { skeleton, atlas } = importResult;

  // ── Mount renderer ────────────────────────────────────────────
  const renderer = new PixiRenderer(app, skeleton, atlas, sheetTexture, { showBoneGizmos: true });
  world.addChild(renderer.root);

  // Hierarchy panel
  boneTree.innerHTML = '';
  skeleton.bones.forEach(b => {
    const li = document.createElement('li');
    li.className = 'tree-item' + (b.name === 'root' ? ' selected' : '');
    li.textContent = `🦴 ${b.name}`;
    boneTree.appendChild(li);
  });
  skeleton.slots.forEach(s => {
    const li = document.createElement('li');
    li.className = 'tree-item';
    li.style.paddingLeft = '20px';
    li.textContent = `📎 ${s.name}`;
    boneTree.appendChild(li);
  });

  // ── Timeline + scale controls ────────────────────────────────
  const bloomAnim = skeleton.animations['bloom'];
  if (!bloomAnim) {
    statusMsg.textContent = '❌ no "bloom" animation in sample';
    return;
  }
  // Relabel rot slider → time scrub
  const rotLabel = rotSlider.parentElement;
  if (rotLabel) {
    const firstText = Array.from(rotLabel.childNodes).find(n => n.nodeType === Node.TEXT_NODE);
    if (firstText) firstText.textContent = 'Time ';
  }
  rotSlider.min = '0';
  rotSlider.max = String(bloomAnim.duration * 1000);
  rotSlider.step = '10';
  rotSlider.value = '0';

  function applyFromSliders() {
    const tMs = parseFloat(rotSlider.value);
    const tSec = tMs / 1000;
    const sc = parseFloat(scaleSlider.value);
    // Scale: apply to root container's scale
    renderer.root.scale.set(sc);
    renderer.render('bloom', tSec);
    rotVal.textContent = `${tMs.toFixed(0)}ms`;
    scaleVal.textContent = sc.toFixed(2);
    propRot.textContent = `${tMs.toFixed(0)}ms / ${(bloomAnim.duration * 1000).toFixed(0)}ms`;
    propScale.textContent = sc.toFixed(2);
  }
  rotSlider.addEventListener('input', applyFromSliders);
  scaleSlider.addEventListener('input', applyFromSliders);
  resetBtn.addEventListener('click', () => {
    rotSlider.value = '0';
    scaleSlider.value = '1';
    applyFromSliders();
  });

  applyFromSliders();

  const totalAttachments = Object.keys(skeleton.skins[0].attachments.flower).length;
  statusMsg.textContent = `✅ KVTM imported · ${skeleton.bones.length} bone · ${skeleton.slots.length} slot · ${totalAttachments} attachments · "bloom" ${bloomAnim.duration.toFixed(2)}s · PixiRenderer mounted`;
}

window.addEventListener('DOMContentLoaded', () => {
  boot().catch(err => {
    console.error(err);
    statusMsg.textContent = '❌ ' + (err?.message || String(err));
  });
});

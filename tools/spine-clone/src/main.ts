// Spine Clone — Phase 0 prototype entry
//
// "Hello bone": render a placeholder skeleton with 1 root bone + 1 attachment.
// Slider rotates the bone → attachment follows because it's a child of the
// bone's Pixi Container. Validates: PixiJS render path + parent/child transform
// inheritance (foundation for full bone hierarchy in Phase 1).

import { Application, Container, Graphics } from 'pixi.js';

const canvasHost = document.getElementById('canvas-host') as HTMLDivElement;
const rotSlider  = document.getElementById('rot-slider') as HTMLInputElement;
const rotVal     = document.getElementById('rot-val') as HTMLSpanElement;
const scaleSlider = document.getElementById('scale-slider') as HTMLInputElement;
const scaleVal    = document.getElementById('scale-val') as HTMLSpanElement;
const resetBtn   = document.getElementById('reset-btn') as HTMLButtonElement;
const statusMsg  = document.getElementById('status-msg') as HTMLSpanElement;
const propRot    = document.getElementById('prop-rot') as HTMLSpanElement;
const propScale  = document.getElementById('prop-scale') as HTMLSpanElement;

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
    world.x = app.renderer.width / 2 / (window.devicePixelRatio || 1);
    world.y = app.renderer.height / 2 / (window.devicePixelRatio || 1);
  };
  recenter();
  window.addEventListener('resize', recenter);

  // Bone — child of world. Visual: line (length) + dot at pivot.
  const bone = new Container();
  world.addChild(bone);

  const boneGraphic = new Graphics();
  const BONE_LEN = 100;
  boneGraphic.moveTo(0, 0).lineTo(BONE_LEN, 0).stroke({ color: 0xff8a3d, width: 2 });
  boneGraphic.circle(0, 0, 5).fill({ color: 0xff8a3d, alpha: 0.9 });
  boneGraphic.circle(0, 0, 2).fill({ color: 0xffffff });
  bone.addChild(boneGraphic);

  // Attachment — placeholder "flower" graphic, child of bone.
  // In real skeleton: Slot → RegionAttachment → Sprite. For Phase 0 mock with Graphics.
  const attach = new Graphics();
  const FLOWER_R = 28;
  attach.circle(BONE_LEN, 0, FLOWER_R).fill({ color: 0xe8455a });
  // Petal hint — 6 small circles around center
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    const px = BONE_LEN + Math.cos(angle) * FLOWER_R * 0.7;
    const py = Math.sin(angle) * FLOWER_R * 0.7;
    attach.circle(px, py, FLOWER_R * 0.35).fill({ color: 0xff6b80, alpha: 0.85 });
  }
  attach.circle(BONE_LEN, 0, FLOWER_R * 0.3).fill({ color: 0xfbbf24 });
  bone.addChild(attach);

  // Center axes for reference
  const axes = new Graphics();
  axes.moveTo(-300, 0).lineTo(300, 0).stroke({ color: 0x60a5fa, width: 1, alpha: 0.15 });
  axes.moveTo(0, -300).lineTo(0, 300).stroke({ color: 0x60a5fa, width: 1, alpha: 0.15 });
  world.addChildAt(axes, 0);

  // Bind sliders
  function syncFromSliders() {
    const degs = parseFloat(rotSlider.value);
    const sc = parseFloat(scaleSlider.value);
    bone.angle = degs;      // PixiJS .angle = degrees
    bone.scale.set(sc);
    rotVal.textContent = `${degs}°`;
    scaleVal.textContent = sc.toFixed(2);
    propRot.textContent = `${degs}°`;
    propScale.textContent = sc.toFixed(2);
  }
  rotSlider.addEventListener('input', syncFromSliders);
  scaleSlider.addEventListener('input', syncFromSliders);
  resetBtn.addEventListener('click', () => {
    rotSlider.value = '0';
    scaleSlider.value = '1';
    syncFromSliders();
  });

  syncFromSliders();
  statusMsg.textContent = `PixiJS ${(window as any).PIXI?.VERSION || 'v8'} · WebGL ready · Phase 0 hello-bone`;
}

window.addEventListener('DOMContentLoaded', () => {
  boot().catch(err => {
    console.error(err);
    statusMsg.textContent = '❌ ' + (err?.message || String(err));
  });
});

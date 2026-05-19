// Spine Clone — editor entry point.
// All UI orchestration lives in src/ui/Editor.ts.

import { Editor } from './ui/Editor.js';
import { dbg } from './ui/debug.js';
import { isTauri } from './io/fileApi.js';

window.addEventListener('DOMContentLoaded', () => {
  dbg.init();
  dbg.info(`🦴 Spine Clone starting · Tauri=${isTauri()}`);
  dbg.info(`User agent: ${navigator.userAgent.slice(0, 80)}`);

  const editor = new Editor();
  editor.init()
    .then(() => dbg.ok('✅ Editor.init() complete — try clicking buttons or drag-drop'))
    .catch(err => {
      console.error('Editor.init failed:', err);
      const msg = document.getElementById('status-msg');
      if (msg) msg.textContent = '❌ Init failed: ' + (err?.message || String(err));
    });
  // Expose for debugging
  (window as any).editor = editor;
  (window as any).dbg = dbg;
});

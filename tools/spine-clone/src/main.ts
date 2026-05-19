// Spine Clone — editor entry point.
// All UI orchestration lives in src/ui/Editor.ts.

import { Editor } from './ui/Editor.js';

window.addEventListener('DOMContentLoaded', () => {
  const editor = new Editor();
  editor.init().catch(err => {
    console.error(err);
    const msg = document.getElementById('status-msg');
    if (msg) msg.textContent = '❌ ' + (err?.message || String(err));
  });
  // Expose for debugging
  (window as any).editor = editor;
});

// Editor — orchestrates the whole spine-clone editor UI.
//
// Owns:
//   - DocumentStore (single source of truth)
//   - PixiJS Application (shared canvas)
//   - PixiRenderer (pose mode) + AtlasView (atlas mode) — only one mounted at a time
//   - All HTML panels (hierarchy, modules, animations, properties)
//   - Toolbar action handlers
//
// Mode switching: when user clicks 🎨 Atlas, the pose renderer is removed and
// AtlasView is mounted. When 🦴 Pose, vice versa. The DocumentStore is shared,
// so edits in atlas mode (e.g. creating regions) reflect immediately when
// switching back to pose mode (e.g. as new attachment options).

import { Application, Container, Texture, Assets } from 'pixi.js';
import { DocumentStore } from '../store/DocumentStore.js';
import { AtlasView } from './AtlasView.js';
import { serializeProject, parseProject } from '../io/customFormat.js';
import { exportToSpineJson } from '../io/spineExport.js';
import { parseSpineJson } from '../io/spineImport.js';
import { parseAtlas } from '../io/atlasParser.js';
import { openFilePicker, saveTextFile, isTauri } from '../io/fileApi.js';
import { loadSpineFromText } from '../render/SpineRenderer.js';
import type { Spine } from '@esotericsoftware/spine-pixi-v8';
import { evaluatePose } from '../core/pose.js';
import type {
  Atlas, RegionAttachment, Bone, Slot,
} from '../core/types.js';
import { makeEmptySkeleton } from '../core/types.js';

/**
 * Resolve a relative path against a base file path (mimics Node's path.resolve).
 * Handles Windows backslash + forward slash separators.
 *   resolveRelativePath('E:/a/b/c/file.atlas', '../sheet.png')
 *     → 'E:/a/b/sheet.png'
 */
function resolveRelativePath(basePath: string, relPath: string): string {
  // Normalize to forward slashes for parsing
  const baseNorm = basePath.replace(/\\/g, '/');
  const relNorm  = relPath.replace(/\\/g, '/');
  // If rel is absolute (has drive letter or starts with /), return as-is
  if (/^[a-z]:\//i.test(relNorm) || relNorm.startsWith('/')) {
    return relNorm.replace(/\//g, basePath.includes('\\') ? '\\' : '/');
  }
  // Get base directory (strip filename)
  const baseDir = baseNorm.substring(0, baseNorm.lastIndexOf('/'));
  // Combine + normalize ../ and ./
  const parts = (baseDir + '/' + relNorm).split('/');
  const result: string[] = [];
  for (const p of parts) {
    if (p === '..') result.pop();
    else if (p !== '.' && p !== '') result.push(p);
  }
  // Restore drive letter root for Windows
  const joined = result.join('/');
  const out = /^[a-z]:/i.test(joined) ? joined : '/' + joined;
  return basePath.includes('\\') ? out.replace(/\//g, '\\') : out;
}

/** Guess MIME type from filename extension. Shared with fileApi.ts. */
function guessMime(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  switch (ext) {
    case 'png':  return 'image/png';
    case 'webp': return 'image/webp';
    case 'jpg':
    case 'jpeg': return 'image/jpeg';
    case 'gif':  return 'image/gif';
    case 'json': return 'application/json';
    case 'atlas': return 'text/plain';
    default: return 'application/octet-stream';
  }
}

type Mode = 'atlas' | 'pose';

export class Editor {
  private store: DocumentStore;
  private app!: Application;
  private worldContainer!: Container;
  private mode: Mode = 'pose';
  // Official Spine display object (replaces our home-grown PixiRenderer).
  // Wraps spine-pixi-v8 runtime which handles bones, meshes, IK, mixing, etc.
  private spine: Spine | null = null;
  // Loaded source files kept so we can re-instantiate Spine when needed
  private loadedAtlasText: string | null = null;
  private loadedSkeletonText: string | null = null;
  private atlasView: AtlasView | null = null;
  private sheetTexture: Texture | undefined;
  private playbackRaf: number | null = null;
  private playbackStartMs = 0;
  private playbackStartTimeSec = 0;

  constructor() {
    // Start with an empty project
    const emptySkel = makeEmptySkeleton('Untitled');
    this.store = new DocumentStore({
      skeleton: emptySkel,
      atlas: { pages: [] },
    });
  }

  async init() {
    await this.initPixi();
    this.bindToolbar();
    this.bindMode();
    this.bindHierarchyActions();
    this.bindPlayback();
    this.setupDragDrop();
    this.subscribeStore();
    this.renderAll();
    this.setMode('pose');
    this.setStatus('Ready. 📥 Kéo file thả vào canvas, hoặc 🦴 Open Spine / 🖼 Load Image / 🎁 Demo.');
  }

  // ── Pixi setup ──────────────────────────────────────────────
  private async initPixi() {
    const host = document.getElementById('canvas-host') as HTMLDivElement;
    this.app = new Application();
    await this.app.init({
      background: 0x0c0f15,
      resizeTo: host,
      antialias: true,
      autoDensity: true,
      resolution: window.devicePixelRatio || 1,
    });
    host.appendChild(this.app.canvas);

    this.worldContainer = new Container();
    this.worldContainer.label = 'world';
    this.app.stage.addChild(this.worldContainer);
    this.recenter();
    window.addEventListener('resize', () => this.recenter());
  }

  private recenter() {
    const host = document.getElementById('canvas-host') as HTMLDivElement;
    if (this.mode === 'pose') {
      this.worldContainer.x = host.clientWidth / 2;
      this.worldContainer.y = host.clientHeight / 2 + 60;
    } else {
      // Atlas mode: top-left origin so sheet image sits in upper-left
      this.worldContainer.x = 20;
      this.worldContainer.y = 20;
    }
  }

  // ── Mode switch ─────────────────────────────────────────────
  // Always rebuilds — caller decides when to call. Don't optimize away the
  // rebuild because that breaks "reload after new skeleton imported".
  setMode(mode: Mode) {
    this.mode = mode;
    // Tear down current view
    if (this.spine) {
      this.worldContainer.removeChild(this.spine);
      this.spine.destroy();
      this.spine = null;
    }
    if (this.atlasView) {
      this.worldContainer.removeChild(this.atlasView.root);
      this.atlasView.destroy();
      this.atlasView = null;
    }

    // Build the appropriate view
    if (mode === 'pose') {
      // Use official spine-pixi runtime — handles bones, meshes, IK, mixing.
      // Needs all 3: skeleton JSON text + atlas text + sheet texture.
      if (this.loadedSkeletonText && this.loadedAtlasText && this.sheetTexture) {
        try {
          const result = loadSpineFromText(
            this.loadedSkeletonText,
            this.loadedAtlasText,
            this.sheetTexture,
          );
          this.spine = result.spine;
          this.worldContainer.addChild(this.spine);
          // Apply current animation (or setup pose if none)
          this.applyCurrentAnimation();
          // Auto-fit so skeleton fills viewport
          requestAnimationFrame(() => this.fitToView());
        } catch (err: any) {
          console.error('[setMode] spine-pixi load failed:', err);
          this.setStatus('❌ spine-pixi load failed: ' + (err?.message ?? err));
        }
      } else {
        console.log('[setMode] pose: skeleton/atlas/texture not all loaded — skipping spine render');
      }
    } else {
      this.atlasView = new AtlasView(this.app, this.store.atlas, {
        onRegionCreated: r => this.handleRegionCreated(r),
        onRegionSelected: name => this.store.setSelection(
          name ? { type: 'attachment', slot: '__atlas__', name } : { type: 'none' }
        ),
        onRegionEdited: (name, patch) => this.handleRegionEdited(name, patch),
      });
      this.atlasView.setSheet(this.sheetTexture);
      this.worldContainer.addChild(this.atlasView.root);
    }

    // Toggle tool UI
    (document.getElementById('atlas-tools') as HTMLElement).style.display = mode === 'atlas' ? 'flex' : 'none';
    (document.getElementById('pose-tools') as HTMLElement).style.display = mode === 'pose' ? 'flex' : 'none';
    (document.getElementById('btn-mode-atlas') as HTMLElement).classList.toggle('active', mode === 'atlas');
    (document.getElementById('btn-mode-pose') as HTMLElement).classList.toggle('active', mode === 'pose');

    this.recenter();
  }

  // ── Toolbar wiring ──────────────────────────────────────────
  private bindToolbar() {
    // All buttons now use Tauri's native file dialog when in WebView, with
    // automatic fallback to <input type="file"> when running in plain browser.
    // Log every click so user can see in DevTools the flow is working.
    const wrap = (label: string, fn: () => Promise<void> | void) => async () => {
      console.log(`[Editor] click: ${label}`);
      try { await fn(); }
      catch (err: any) {
        console.error(`[Editor] ${label} failed:`, err);
        this.setStatus(`❌ ${label}: ${err?.message ?? err}`);
        alert(`Lỗi ${label}: ${err?.message ?? err}`);
      }
    };
    // TEST button — dump bone positions + check render state
    document.getElementById('btn-test-dialog')!.onclick = wrap('TEST', async () => {
      const sk = this.store.skeleton;
      console.log(`=== DIAGNOSTIC: ${sk.name} ===`);
      console.log(`bones=${sk.bones.length} slots=${sk.slots.length} regions=${this.store.atlas.pages[0]?.regions.length ?? 0}`);
      console.log(`sheetTexture: ${this.sheetTexture ? this.sheetTexture.width+'x'+this.sheetTexture.height : 'NONE'}`);
      console.log(`mode=${this.mode} worldContainer scale=${this.worldContainer.scale.x.toFixed(2)} pos=(${this.worldContainer.x.toFixed(0)},${this.worldContainer.y.toFixed(0)})`);

      // Evaluate pose + dump 10 bone positions
      const pose = evaluatePose(sk, this.store.currentAnimation, this.store.currentTimeSec);
      const positions: Array<[string, number, number]> = [];
      for (const bone of sk.bones) {
        const w = pose.bones[bone.name];
        positions.push([bone.name, w.tx, w.ty]);
      }
      console.log(`first 10 bone world positions:`);
      positions.slice(0, 10).forEach(([n, x, y]) => console.log(`  ${n}: (${x.toFixed(1)}, ${y.toFixed(1)})`));

      // Check spine-pixi runtime state
      if (this.spine) {
        const sd = this.spine.skeleton.data;
        console.log(`spine-pixi: skeleton "${sd.name ?? 'unnamed'}", ${sd.bones.length} bones, ${sd.slots.length} slots, ${sd.animations.length} anims`);
        console.log(`  current track: ${this.spine.state.tracks[0]?.animation?.name ?? '(empty)'} t=${this.spine.state.tracks[0]?.trackTime?.toFixed(2) ?? '?'}s`);
        const b: any = this.spine.getBounds();
        const rb = b.rectangle ?? b;
        console.log(`  bounds: (${rb.x?.toFixed(0) ?? '?'}, ${rb.y?.toFixed(0) ?? '?'}) ${rb.width?.toFixed(0) ?? '?'}×${rb.height?.toFixed(0) ?? '?'}`);
      } else {
        console.log('spine-pixi runtime: not loaded');
      }
    });
    document.getElementById('btn-new')!.onclick        = wrap('New',          () => this.newProject());
    document.getElementById('btn-load-image')!.onclick = wrap('Load Image',   () => this.pickAndLoadImage());
    document.getElementById('btn-load-spine')!.onclick = wrap('Open Spine',   () => this.pickAndLoadSpine());
    document.getElementById('btn-load-project')!.onclick = wrap('Open',       () => this.pickAndLoadProject());
    document.getElementById('btn-load-sample')!.onclick  = wrap('Demo',       () => this.loadDemo());
    document.getElementById('btn-save')!.onclick         = wrap('Save',       () => this.saveProject());
    document.getElementById('btn-export-spine')!.onclick = wrap('Export Spine', () => this.exportSpine());
    console.log('[Editor] toolbar bound · isTauri =', isTauri());
  }

  private async pickAndLoadImage() {
    const files = await openFilePicker({
      multiple: false,
      title: 'Chọn image sheet',
      filters: [{ name: 'Image', extensions: ['png', 'webp', 'jpg', 'jpeg'] }],
    });
    if (files[0]) await this.loadImageFromFile(files[0]);
  }

  private async pickAndLoadSpine() {
    const files = await openFilePicker({
      multiple: true,
      title: 'Chọn .spine-json + .atlas + .png',
      filters: [{ name: 'Spine files', extensions: ['spine-json', 'json', 'atlas', 'png', 'webp', 'jpg'] }],
    });
    if (files.length) await this.loadSpineProject(files);
  }

  private async pickAndLoadProject() {
    const files = await openFilePicker({
      multiple: false,
      title: 'Open Spine Clone project',
      filters: [{ name: 'Project', extensions: ['json', 'spineclone'] }],
    });
    if (files[0]) await this.loadProjectFromFile(files[0]);
  }

  private bindMode() {
    document.getElementById('btn-mode-atlas')!.onclick = () => this.setMode('atlas');
    document.getElementById('btn-mode-pose')!.onclick = () => this.setMode('pose');
    document.getElementById('btn-draw-region')!.onclick = () => this.setAtlasTool('draw');
    document.getElementById('btn-select-region')!.onclick = () => this.setAtlasTool('select');
  }

  private bindHierarchyActions() {
    document.getElementById('btn-add-bone')!.onclick = () => this.addBone();
    document.getElementById('btn-add-slot')!.onclick = () => this.addSlot();
    document.getElementById('btn-delete-item')!.onclick = () => this.deleteSelected();
    document.getElementById('btn-add-anim')!.onclick = () => this.addAnimation();
    document.getElementById('btn-delete-anim')!.onclick = () => this.deleteSelectedAnimation();
  }

  /**
   * Drag-drop support — uses BOTH:
   *   1) Tauri's native drag-drop event API (works in WebView, OS-level)
   *   2) HTML drag-drop events (fallback for plain browser dev)
   *
   * Tauri 2 by default captures drag-drop at the OS level and emits its own
   * events with FILE PATHS (not File objects). We read the paths via fs plugin
   * to construct File objects, then dispatch through the unified handler.
   */
  private async setupDragDrop() {
    const host = document.getElementById('canvas-host') as HTMLElement;

    // ── (1) Tauri native drag-drop events ──────────────────────
    if (isTauri()) {
      try {
        const { getCurrentWebview } = await import('@tauri-apps/api/webview');
        const { readFile } = await import('@tauri-apps/plugin-fs');
        console.log('[dragdrop] Tauri webview drag-drop listener attached');
        getCurrentWebview().onDragDropEvent(async (event) => {
          const payload: any = event.payload;
          console.log(`[dragdrop] tauri event type=${payload.type}`);
          if (payload.type === 'enter' || payload.type === 'over') {
            host.classList.add('drag-over');
          } else if (payload.type === 'leave') {
            host.classList.remove('drag-over');
          } else if (payload.type === 'drop') {
            host.classList.remove('drag-over');
            const paths: string[] = payload.paths ?? [];
            console.log(`[dragdrop] dropped ${paths.length} path(s):`, paths);
            const files: File[] = [];
            for (const p of paths) {
              try {
                const bytes = await readFile(p);
                const name = p.replace(/^.*[\\/]/, '');
                const f = new File([bytes], name, { type: guessMime(name) });
                (f as any)._tauriPath = p;
                files.push(f);
              } catch (e) {
                console.error('[dragdrop] read failed for', p, e);
              }
            }
            if (files.length) this.handleDroppedFiles(files);
          }
        });
      } catch (err) {
        console.error('[dragdrop] Tauri listener setup failed:', err);
      }
    }

    // ── (2) HTML drag-drop fallback (plain browser dev) ─────────
    const prevent = (e: DragEvent) => { e.preventDefault(); e.stopPropagation(); };
    let dragDepth = 0;
    document.addEventListener('dragenter', e => {
      prevent(e);
      dragDepth++;
      host.classList.add('drag-over');
    });
    document.addEventListener('dragover', e => {
      prevent(e);
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    });
    document.addEventListener('dragleave', e => {
      prevent(e);
      dragDepth--;
      if (dragDepth <= 0) {
        dragDepth = 0;
        host.classList.remove('drag-over');
      }
    });
    document.addEventListener('drop', e => {
      prevent(e);
      dragDepth = 0;
      host.classList.remove('drag-over');
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length) this.handleDroppedFiles(files);
    });
  }

  /**
   * Classify dropped files + dispatch to the right loader.
   * BEFORE classification, auto-discover sibling files in same folder via
   * Tauri fs — so user can drop just .atlas and we'll find .spine-json + .png.
   */
  private async handleDroppedFiles(files: File[]) {
    // Auto-discover sibling Spine files when user drops only 1-2 partial files
    files = await this.discoverSiblings(files);

    const images = files.filter(f => f.type.startsWith('image/') ||
      /\.(png|webp|jpg|jpeg|gif)$/i.test(f.name));
    const atlases = files.filter(f => /\.atlas$/i.test(f.name));
    const spineJsons = files.filter(f => /\.spine-json$/i.test(f.name));
    const customJsons = files.filter(f => /\.spineclone\.json$/i.test(f.name));
    const plainJsons = files.filter(f =>
      /\.json$/i.test(f.name) &&
      !/\.spine-json$/i.test(f.name) &&
      !/\.spineclone\.json$/i.test(f.name)
    );

    const fileNames = files.map(f => f.name).join(', ');
    this.setStatus(`📥 Dropped ${files.length} file(s): ${fileNames}`);

    // 1) Spine bundle (.atlas + .spine-json or .json + image)
    if (atlases.length || spineJsons.length) {
      await this.loadSpineProject(files);
      return;
    }

    // 2) Single custom project file
    if (customJsons.length === 1 && files.length === 1) {
      await this.loadProjectFromFile(customJsons[0]);
      return;
    }

    // 3) Plain .json — could be spine-clone or Spine JSON. Sniff content.
    if (plainJsons.length === 1 && files.length === 1) {
      await this.loadGenericJson(plainJsons[0]);
      return;
    }

    // 4) .json + image bundle → try spine
    if (plainJsons.length && images.length) {
      await this.loadSpineProject(files);
      return;
    }

    // 5) Single image → set as atlas sheet (keep current skeleton)
    if (images.length === 1 && files.length === 1) {
      await this.loadImageFromFile(images[0]);
      return;
    }

    // 6) Multiple images, no JSON → use first as sheet
    if (images.length >= 1 && atlases.length === 0 && spineJsons.length === 0 && plainJsons.length === 0) {
      await this.loadImageFromFile(images[0]);
      if (images.length > 1) {
        this.setStatus(`⚠️ Loaded "${images[0].name}". Multi-image support coming Phase 4 (multi-page atlas).`);
      }
      return;
    }

    this.setStatus(`❌ Unknown file combination: ${images.length} img, ${atlases.length} atlas, ${spineJsons.length} spine-json, ${plainJsons.length} json`);
  }

  /**
   * Auto-discover Spine sibling files in the same folder via Tauri fs.
   * Use case: user dropped only 1 file (multi-drag flaky), we find siblings
   * with matching basename in the same folder AND in parent (for "../sheet.png"
   * atlas refs).
   *
   * Strategy: try direct readFile on candidate paths. Avoid readDir which has
   * stricter permission requirements + can fail on some folders.
   */
  private async discoverSiblings(files: File[]): Promise<File[]> {
    if (!isTauri() || files.length === 0) return files;

    const anchor = files.find(f =>
      (f as any)._tauriPath &&
      /\.(atlas|spine-json|json|png|webp|jpg|jpeg)$/i.test(f.name)
    );
    if (!anchor) {
      console.log('[siblings] no anchor file with _tauriPath, skipping discovery');
      return files;
    }

    const anchorPath = (anchor as any)._tauriPath as string;
    const sep = anchorPath.includes('\\') ? '\\' : '/';
    const dir = anchorPath.substring(0, anchorPath.lastIndexOf(sep));
    const parentDir = dir.substring(0, dir.lastIndexOf(sep));
    const baseName = anchor.name.replace(/\.(spine-json|atlas|json|png|webp|jpg|jpeg)$/i, '');
    console.log(`[siblings] anchor="${anchor.name}" base="${baseName}" dir="${dir}"`);

    let readFile: any;
    try {
      const fsMod = await import('@tauri-apps/plugin-fs');
      readFile = fsMod.readFile;
    } catch (e) {
      console.warn('[siblings] cannot load plugin-fs:', e);
      return files;
    }

    const presentNames = new Set(files.map(f => f.name.toLowerCase()));

    // Try candidates: basename + each known Spine-related extension
    // Search both SAME dir AND PARENT dir (atlas often refs "../sheet.png")
    const exts = ['.spine-json', '.atlas', '.png', '.webp', '.jpg', '.jpeg'];
    const searchDirs = [dir, parentDir].filter(d => d.length > 1);

    for (const searchDir of searchDirs) {
      for (const ext of exts) {
        const candidateName = baseName + ext;
        if (presentNames.has(candidateName.toLowerCase())) continue;
        const candidatePath = searchDir + sep + candidateName;
        try {
          const bytes = await readFile(candidatePath);
          const blob = new Blob([bytes], { type: guessMime(candidateName) });
          const f = new File([blob], candidateName, { type: blob.type });
          (f as any)._tauriPath = candidatePath;
          files.push(f);
          presentNames.add(candidateName.toLowerCase());
          console.log(`[siblings] ✅ found ${candidateName} in ${searchDir} (${bytes.byteLength}B)`);
        } catch {
          // not found — silent skip (most candidates won't exist)
        }
      }
    }

    return files;
  }

  /**
   * Try to parse a single .json file as either spine-clone project OR Spine
   * 4.x JSON skeleton (sniff first then dispatch).
   */
  private async loadGenericJson(file: File) {
    const text = await file.text();
    try {
      const obj = JSON.parse(text);
      if (obj?.schema === 'spine-clone-project') {
        await this.loadProjectFromFile(file);
        return;
      }
      if (Array.isArray(obj?.bones)) {
        // Spine 4.x JSON — load skeleton-only (no atlas yet)
        const { parseSpineJson } = await import('../io/spineImport.js');
        const skeleton = parseSpineJson(text);
        skeleton.name = file.name.replace(/\.(spine-json|json)$/i, '');
        this.sheetTexture = undefined;
        this.store.setProject(skeleton, { pages: [] });
        this.setProjectName(skeleton.name);
        this.setMode('pose');
        this.setStatus(`🦴 Loaded skeleton "${skeleton.name}" · ${skeleton.bones.length} bone. ⚠️ Drop .atlas + image kế tiếp để có texture.`);
        return;
      }
      throw new Error('Unknown JSON format (not spine-clone-project, not Spine 4.x)');
    } catch (err: any) {
      this.setStatus('❌ ' + (err?.message || String(err)));
    }
  }

  private bindPlayback() {
    const timeSlider = document.getElementById('time-slider') as HTMLInputElement;
    const scaleSlider = document.getElementById('scale-slider') as HTMLInputElement;
    const playBtn = document.getElementById('btn-play') as HTMLButtonElement;
    const fitBtn = document.getElementById('btn-fit') as HTMLButtonElement;

    timeSlider.addEventListener('input', () => {
      const t = parseFloat(timeSlider.value) / 1000;
      this.store.setTime(t);
    });
    scaleSlider.addEventListener('input', () => {
      const sc = parseFloat(scaleSlider.value);
      this.worldContainer.scale.set(sc);
      (document.getElementById('scale-val') as HTMLElement).textContent = sc.toFixed(2);
    });
    playBtn.addEventListener('click', () => this.togglePlay());
    fitBtn.addEventListener('click', () => this.fitToView());
  }

  /**
   * Compute skeleton + attachment bounds, zoom + pan worldContainer to fit.
   *
   * Strategy: walk every visible slot at current pose, compute its world
   * transform via parent bone matrix + attachment offset/size. Accounts for
   * actual sprite extent (not just bone origin), so layout fills the canvas
   * properly.
   */
  private fitToView() {
    if (!this.spine) return;
    const host = document.getElementById('canvas-host') as HTMLDivElement;
    const W = host.clientWidth, H = host.clientHeight;
    if (W < 10 || H < 10) return;

    // Reset world transform so getBounds returns the spine display's natural
    // dimensions (in its local Pixi coord space). Then derive scale + pan.
    this.worldContainer.scale.set(1);
    this.worldContainer.x = 0;
    this.worldContainer.y = 0;

    // Force spine to update world transforms (Pixi may not have ticked yet)
    try {
      this.spine.update(0);
    } catch {}

    // Pixi v8 getBounds returns Bounds object with x/y/width/height
    const b = this.spine.getBounds();
    const rb: any = (b as any).rectangle ?? b;
    const minX = rb.x ?? rb.minX ?? 0;
    const minY = rb.y ?? rb.minY ?? 0;
    const bw = Math.max(1, rb.width  ?? ((rb.maxX ?? 0) - minX));
    const bh = Math.max(1, rb.height ?? ((rb.maxY ?? 0) - minY));
    if (!isFinite(minX) || bw < 2 || bh < 2) {
      console.warn(`[fitToView] no valid bounds (bw=${bw}, bh=${bh})`);
      this.worldContainer.scale.set(1);
      this.worldContainer.x = W / 2;
      this.worldContainer.y = H / 2;
      return;
    }

    const pad = 1.1;
    const scale = Math.min(W / (bw * pad), H / (bh * pad));
    const clampedScale = Math.max(0.05, Math.min(3, scale));
    const centerX = minX + bw / 2;
    const centerY = minY + bh / 2;
    const maxX = minX + bw;
    const maxY = minY + bh;
    this.worldContainer.scale.set(clampedScale);
    this.worldContainer.x = W / 2 - centerX * clampedScale;
    this.worldContainer.y = H / 2 - centerY * clampedScale;

    const slider = document.getElementById('scale-slider') as HTMLInputElement;
    const valEl  = document.getElementById('scale-val') as HTMLElement;
    if (slider) slider.value = String(clampedScale);
    if (valEl)  valEl.textContent = clampedScale.toFixed(2);

    console.log(`[fitToView] bounds X[${minX.toFixed(0)}..${maxX.toFixed(0)}] Y[${minY.toFixed(0)}..${maxY.toFixed(0)}] size ${bw.toFixed(0)}×${bh.toFixed(0)} → scale=${clampedScale.toFixed(2)}`);
  }

  private togglePlay() {
    if (this.store.playing) {
      this.store.setPlaying(false);
      if (this.playbackRaf) cancelAnimationFrame(this.playbackRaf);
      this.playbackRaf = null;
      (document.getElementById('btn-play') as HTMLElement).textContent = '▶';
    } else {
      this.store.setPlaying(true);
      this.playbackStartMs = performance.now();
      this.playbackStartTimeSec = this.store.currentTimeSec;
      (document.getElementById('btn-play') as HTMLElement).textContent = '⏸';
      const tick = (now: number) => {
        if (!this.store.playing) return;
        const elapsed = (now - this.playbackStartMs) / 1000;
        const dur = this.store.currentDuration;
        let t = this.playbackStartTimeSec + elapsed;
        if (dur > 0) t = t % dur;  // loop
        this.store.setTime(t);
        this.playbackRaf = requestAnimationFrame(tick);
      };
      this.playbackRaf = requestAnimationFrame(tick);
    }
  }

  // ── Project operations ──────────────────────────────────────
  newProject() {
    if (!confirm('Tạo project mới? Mọi thay đổi chưa lưu sẽ mất.')) return;
    this.sheetTexture = undefined;
    this.store.setProject(makeEmptySkeleton('Untitled'), { pages: [] });
    this.setProjectName('Untitled');
    this.setStatus('✅ New project');
    this.setMode('pose');
  }

  private async loadImageFromFile(file: File) {
    this.setStatus(`⏳ Loading ${file.name}...`);
    try {
      const url = URL.createObjectURL(file);
      const tex = await Assets.load<Texture>(url);
      this.sheetTexture = tex;
      // Replace or create the first atlas page
      const atlas = this.store.atlas;
      const newAtlas: Atlas = {
        pages: [{
          name: file.name,
          width: tex.width,
          height: tex.height,
          format: 'RGBA8888',
          filter: ['Linear', 'Linear'],
          regions: atlas.pages[0]?.regions ?? [],
        }],
      };
      this.store.setProject(this.store.skeleton, newAtlas);
      this.setProjectName(this.store.skeleton.name);
      this.setMode('atlas');
      this.setStatus(`✅ ${file.name} ${tex.width}×${tex.height} · drag chuột để tạo regions`);
    } catch (err: any) {
      this.setStatus('❌ ' + (err?.message || String(err)));
    }
  }

  /** Load a generic demo sprite sheet so user can test workflow immediately. */
  private async loadDemo() {
    this.setStatus('⏳ Loading demo sprite...');
    try {
      const tex = await Assets.load<Texture>('/sample-assets/sample_sprite.webp');
      this.sheetTexture = tex;
      const skeleton = makeEmptySkeleton('demo');
      const atlas: Atlas = {
        pages: [{
          name: 'sample_sprite.webp',
          width: tex.width,
          height: tex.height,
          format: 'RGBA8888',
          filter: ['Linear', 'Linear'],
          regions: [],
        }],
      };
      this.store.setProject(skeleton, atlas);
      this.setProjectName(skeleton.name);
      this.setMode('atlas');
      this.setStatus(`🎁 Demo sheet ${tex.width}×${tex.height} loaded. Drag chuột trên ảnh để cắt region.`);
    } catch (err: any) {
      this.setStatus('❌ ' + (err?.message || String(err)));
    }
  }

  /**
   * Load a Spine project from user-selected files. Expects user to multi-select:
   *   - one .json / .spine-json (skeleton)
   *   - one .atlas (region coordinates)
   *   - one or more image files (.png/.webp) referenced by the atlas
   *
   * The skeleton + atlas don't have to be in matching path order — we look up
   * the texture by the atlas page name (first page's image file).
   */
  private async loadSpineProject(files: File[]) {
    this.setStatus(`⏳ Loading ${files.length} Spine files...`);
    try {
      const findFile = (predicate: (f: File) => boolean) => files.find(predicate);
      const skelFile = findFile(f =>
        f.name.endsWith('.spine-json') ||
        (f.name.endsWith('.json') && !f.name.endsWith('.spineclone.json'))
      );
      const atlasFile = findFile(f => f.name.endsWith('.atlas'));
      if (!skelFile) throw new Error('Cần ít nhất 1 file .spine-json hoặc .json');

      // Parse skeleton (always) + atlas (optional)
      const skelText = await skelFile.text();
      const skeleton = parseSpineJson(skelText);
      const atlasTextLocal = atlasFile ? await atlasFile.text() : null;
      const atlas = atlasTextLocal
        ? parseAtlas(atlasTextLocal)
        : { pages: [] };
      // Stash raw texts for spine-pixi runtime (used by setMode('pose'))
      this.loadedSkeletonText = skelText;
      this.loadedAtlasText = atlasTextLocal;
      console.log(`[loadSpine] skeleton: ${skeleton.bones.length} bones, ${skeleton.slots.length} slots`);
      console.log(`[loadSpine] atlas: ${atlas.pages.length} pages, ${atlas.pages[0]?.regions.length ?? 0} regions`);

      // Set skeleton name from filename (strip .spine-json/.json)
      skeleton.name = skelFile.name.replace(/\.(spine-json|json)$/i, '');

      // Find texture image — 3 strategies in order:
      //   1) Image file included in the drop (matched by basename)
      //   2) Any image in the drop (fallback)
      //   3) Auto-resolve the atlas's image reference relative to atlas file's
      //      absolute path via Tauri fs (handles "../sprites.png" pattern that
      //      Spine commonly uses)
      let tex: Texture | undefined;
      if (atlas.pages[0]) {
        const pageImagePath = atlas.pages[0].name;            // e.g. "../pots_set_00.png"
        const pageImageBase = pageImagePath.replace(/^.*[\\/]/, '');

        // Strategy 1+2: in-drop image
        let imgFile = findFile(f =>
          (f.type.startsWith('image/') || /\.(png|webp|jpg|jpeg)$/i.test(f.name)) &&
          f.name.toLowerCase() === pageImageBase.toLowerCase()
        ) ?? findFile(f => f.type.startsWith('image/'));

        // Strategy 3: Tauri fs auto-resolve relative path
        if (!imgFile && atlasFile && (atlasFile as any)._tauriPath && isTauri()) {
          const atlasPath = (atlasFile as any)._tauriPath as string;
          const resolved = resolveRelativePath(atlasPath, pageImagePath);
          console.log(`[loadSpine] auto-resolve image: ${pageImagePath} → ${resolved}`);
          try {
            const { readFile } = await import('@tauri-apps/plugin-fs');
            const bytes = await readFile(resolved);
            const blob = new Blob([bytes], { type: guessMime(resolved) });
            imgFile = new File([blob], pageImageBase, { type: blob.type });
            (imgFile as any)._tauriPath = resolved;
            console.log(`[loadSpine] ✅ auto-loaded image ${pageImageBase} (${bytes.byteLength}B)`);
          } catch (e) {
            console.warn(`[loadSpine] auto-resolve failed:`, e);
          }
        }

        if (imgFile) {
          console.log(`[loadSpine] loading image "${imgFile.name}" (${imgFile.size}B, type=${imgFile.type})`);
          const url = URL.createObjectURL(imgFile);
          try {
            // Bulletproof image load: use HTMLImageElement + Texture.from() instead
            // of Assets.load() which can fail on blob: URLs in some Pixi v8 builds.
            const imgEl = new Image();
            await new Promise<void>((resolve, reject) => {
              imgEl.onload = () => resolve();
              imgEl.onerror = () => reject(new Error(`Image decode failed: ${imgFile.name}`));
              imgEl.src = url;
            });
            console.log(`[loadSpine] image decoded: ${imgEl.naturalWidth}×${imgEl.naturalHeight}`);
            tex = Texture.from(imgEl);
            // Wait one frame to ensure GPU upload
            await new Promise(r => requestAnimationFrame(r));
            console.log(`[loadSpine] ✅ texture ready: ${tex.width}×${tex.height}`);
          } catch (err: any) {
            console.error(`[loadSpine] image load failed:`, err);
            // Don't throw — let skeleton + atlas load without texture
            // (placeholders will render instead). User sees clear status.
            tex = undefined;
          }
          if (tex) {
            atlas.pages[0].name = imgFile.name;
            if (!atlas.pages[0].width) atlas.pages[0].width = tex.width;
            if (!atlas.pages[0].height) atlas.pages[0].height = tex.height;
          }
        }
      }

      this.sheetTexture = tex;
      this.store.setProject(skeleton, atlas);
      this.setProjectName(skeleton.name);
      this.setMode('pose');
      const stats = [
        `${skeleton.bones.length} bone`,
        `${skeleton.slots.length} slot`,
        `${atlas.pages[0]?.regions.length ?? 0} regions`,
        `${Object.keys(skeleton.animations).length} anim`,
      ].join(' · ');
      this.setStatus(`🦴 Loaded "${skeleton.name}" · ${stats}${tex ? '' : ' · ⚠️ no image (atlas regions visible but no texture)'}`);
    } catch (err: any) {
      console.error(err);
      this.setStatus('❌ ' + (err?.message || String(err)));
    }
  }

  private async loadProjectFromFile(file: File) {
    this.setStatus(`⏳ Opening ${file.name}...`);
    try {
      const text = await file.text();
      const project = parseProject(text);
      // Sheet image is referenced by name only — user must load it separately
      // unless we embed/base64 (Phase 3 enhancement).
      this.sheetTexture = undefined;
      this.store.setProject(project.skeleton, project.atlas);
      this.setProjectName(project.skeleton.name);
      this.setMode('pose');
      const regionsN = project.atlas.pages[0]?.regions.length ?? 0;
      this.setStatus(`📂 Opened "${project.skeleton.name}" · ${project.skeleton.bones.length} bone · ${regionsN} regions · ${Object.keys(project.skeleton.animations).length} anim. 🖼 Load Image để gắn sheet.`);
    } catch (err: any) {
      this.setStatus('❌ ' + (err?.message || String(err)));
    }
  }

  async saveProject() {
    const json = serializeProject(this.store.skeleton, this.store.atlas);
    const ok = await saveTextFile(json, `${this.store.skeleton.name || 'project'}.spineclone.json`, {
      title: 'Save Spine Clone project',
      filters: [{ name: 'Spine Clone project', extensions: ['spineclone.json', 'json'] }],
    });
    if (ok) this.setStatus(`💾 Saved ${this.store.skeleton.name}.spineclone.json`);
  }

  async exportSpine() {
    const json = exportToSpineJson(this.store.skeleton);
    const ok = await saveTextFile(json, `${this.store.skeleton.name || 'skeleton'}.json`, {
      title: 'Export Spine 4.x JSON',
      filters: [{ name: 'Spine JSON', extensions: ['json'] }],
    });
    if (ok) this.setStatus(`📤 Exported Spine 4.x JSON`);
  }

  // ── Atlas region operations ────────────────────────────────
  private handleRegionCreated(r: import('../core/types.js').AtlasRegion) {
    if (!this.store.atlas.pages.length) return;
    this.store.atlas.pages[0].regions.push(r);
    this.renderModuleList();
    this.atlasView?.setAtlas(this.store.atlas);
    this.setStatus(`✅ Created region "${r.name}" (${r.width}×${r.height})`);
  }

  private handleRegionEdited(name: string, patch: any) {
    const r = this.store.atlas.pages[0]?.regions.find(r => r.name === name);
    if (!r) return;
    Object.assign(r, patch);
    this.renderModuleList();
    this.renderProperties();
  }

  private setAtlasTool(tool: 'draw' | 'select') {
    this.atlasView?.setTool(tool);
    document.getElementById('btn-draw-region')!.classList.toggle('active', tool === 'draw');
    document.getElementById('btn-select-region')!.classList.toggle('active', tool === 'select');
  }

  // ── Hierarchy operations ────────────────────────────────────
  private addBone() {
    const sel = this.store.selection;
    const parentName = sel.type === 'bone' ? sel.name : 'root';
    const baseName = `bone_${this.store.skeleton.bones.length}`;
    const newBone: Bone = {
      name: baseName, parent: parentName, length: 30,
      x: 30, y: 0, rotation: 0, scaleX: 1, scaleY: 1,
    };
    this.store.skeleton.bones.push(newBone);
    this.renderHierarchy();
    this.store.setSelection({ type: 'bone', name: baseName });
    this.refreshRenderer();
    this.setStatus(`✅ Added bone "${baseName}" under "${parentName}"`);
  }

  private addSlot() {
    const sel = this.store.selection;
    const boneName = sel.type === 'bone' ? sel.name : 'root';
    const baseName = `slot_${this.store.skeleton.slots.length}`;
    const newSlot: Slot = { name: baseName, bone: boneName };
    this.store.skeleton.slots.push(newSlot);
    // Ensure default skin has an empty attachments entry for this slot
    if (!this.store.skeleton.skins[0].attachments[baseName]) {
      this.store.skeleton.skins[0].attachments[baseName] = {};
    }
    this.renderHierarchy();
    this.store.setSelection({ type: 'slot', name: baseName });
    this.refreshRenderer();
    this.setStatus(`✅ Added slot "${baseName}" on "${boneName}"`);
  }

  private deleteSelected() {
    const sel = this.store.selection;
    if (sel.type === 'bone') {
      if (sel.name === 'root') { alert('Cannot delete root bone'); return; }
      this.store.skeleton.bones = this.store.skeleton.bones.filter(b => b.name !== sel.name);
      // Cascade: re-parent or drop children + drop slots on this bone
      this.store.skeleton.bones.forEach(b => { if (b.parent === sel.name) b.parent = 'root'; });
      this.store.skeleton.slots = this.store.skeleton.slots.filter(s => s.bone !== sel.name);
      this.store.setSelection({ type: 'none' });
      this.renderHierarchy();
      this.refreshRenderer();
      this.setStatus(`🗑 Deleted bone "${sel.name}"`);
    } else if (sel.type === 'slot') {
      this.store.skeleton.slots = this.store.skeleton.slots.filter(s => s.name !== sel.name);
      delete this.store.skeleton.skins[0].attachments[sel.name];
      this.store.setSelection({ type: 'none' });
      this.renderHierarchy();
      this.refreshRenderer();
      this.setStatus(`🗑 Deleted slot "${sel.name}"`);
    }
  }

  private addAnimation() {
    const baseName = `anim_${Object.keys(this.store.skeleton.animations).length}`;
    this.store.skeleton.animations[baseName] = {
      name: baseName, duration: 1, bones: {}, slots: {},
    };
    this.renderAnimList();
    this.store.setCurrentAnimation(baseName);
    this.setStatus(`✅ Added animation "${baseName}"`);
  }

  private deleteSelectedAnimation() {
    const cur = this.store.currentAnimation;
    if (!cur) return;
    if (!confirm(`Delete animation "${cur}"?`)) return;
    delete this.store.skeleton.animations[cur];
    const remaining = Object.keys(this.store.skeleton.animations);
    this.store.setCurrentAnimation(remaining[0]);
    this.renderAnimList();
    this.setStatus(`🗑 Deleted animation "${cur}"`);
  }

  // ── Store subscription ─────────────────────────────────────
  private subscribeStore() {
    this.store.on('project-changed', () => {
      this.refreshRenderer();
      this.renderAll();
    });
    this.store.on('selection-changed', () => {
      this.renderHierarchy();
      this.renderProperties();
    });
    this.store.on('animation-changed', () => {
      this.renderAnimList();
      this.updateTimeSlider();
      // Push new animation to spine-pixi runtime
      this.applyCurrentAnimation();
    });
    this.store.on('time-changed', () => {
      this.updateTimeSlider();
      // Manual time scrub: set spine track time + apply (only when not auto-playing)
      if (this.spine && !this.store.playing) {
        const track = this.spine.state.tracks[0];
        if (track && this.store.currentAnimation) {
          track.trackTime = this.store.currentTimeSec;
          this.spine.update(0);
        }
      }
    });
    this.store.on('bone-changed', () => {
      this.renderProperties();
    });
  }

  private refreshRenderer() {
    // Rebuild renderer when skeleton/atlas structure changes
    if (this.mode === 'pose') this.setMode('pose');
    if (this.mode === 'atlas') this.atlasView?.setAtlas(this.store.atlas);
  }

  // ── Panels ──────────────────────────────────────────────────
  private renderAll() {
    this.renderHierarchy();
    this.renderModuleList();
    this.renderAnimList();
    this.renderProperties();
    this.updateStats();
  }

  private renderHierarchy() {
    const tree = document.getElementById('hierarchy-tree') as HTMLUListElement;
    tree.innerHTML = '';
    // Build bone tree
    const sel = this.store.selection;
    const bonesByParent = new Map<string | undefined, Bone[]>();
    for (const b of this.store.skeleton.bones) {
      const key = b.parent;
      if (!bonesByParent.has(key)) bonesByParent.set(key, []);
      bonesByParent.get(key)!.push(b);
    }
    const renderBone = (b: Bone, depth: number) => {
      const li = document.createElement('li');
      li.className = 'tree-item';
      if (sel.type === 'bone' && sel.name === b.name) li.classList.add('selected');
      li.style.paddingLeft = (8 + depth * 14) + 'px';
      li.innerHTML = `🦴 ${b.name}`;
      li.onclick = () => this.store.setSelection({ type: 'bone', name: b.name });
      tree.appendChild(li);
      // Children
      const children = bonesByParent.get(b.name) || [];
      children.forEach(c => renderBone(c, depth + 1));
      // Slots on this bone
      this.store.skeleton.slots
        .filter(s => s.bone === b.name)
        .forEach(s => {
          const sli = document.createElement('li');
          sli.className = 'tree-item';
          if (sel.type === 'slot' && sel.name === s.name) sli.classList.add('selected');
          sli.style.paddingLeft = (8 + (depth + 1) * 14) + 'px';
          sli.innerHTML = `📎 ${s.name}${s.attachment ? ` <span class="tag">${s.attachment}</span>` : ''}`;
          sli.onclick = () => this.store.setSelection({ type: 'slot', name: s.name });
          tree.appendChild(sli);
        });
    };
    const roots = bonesByParent.get(undefined) || [];
    roots.forEach(b => renderBone(b, 0));
  }

  private renderModuleList() {
    const list = document.getElementById('module-list') as HTMLUListElement;
    list.innerHTML = '';
    const regions = this.store.atlas.pages[0]?.regions ?? [];
    (document.getElementById('module-count') as HTMLElement).textContent = `${regions.length} modules`;
    regions.forEach(r => {
      const li = document.createElement('li');
      li.className = 'tree-item';
      const rotIcon = r.rotate ? '<span style="color:#a855f7;" title="rotated 90° in atlas">↻</span> ' : '';
      const color = r.rotate ? '#a855f7' : '#60a5fa';
      li.innerHTML = `<span style="color:${color};">▭</span> ${rotIcon}${r.name} <span class="tag">${r.width}×${r.height}</span>`;
      li.onclick = () => {
        this.atlasView?.selectRegion(r.name);
      };
      list.appendChild(li);
    });
  }

  private renderAnimList() {
    const list = document.getElementById('animation-list') as HTMLUListElement;
    list.innerHTML = '';
    const cur = this.store.currentAnimation;

    // Setup Pose entry (no animation — show skeleton at default state)
    const setupLi = document.createElement('li');
    setupLi.className = 'tree-item';
    if (!cur) setupLi.classList.add('selected');
    setupLi.innerHTML = `🦴 <em>Setup Pose</em> <span class="tag">default</span>`;
    setupLi.onclick = () => this.selectSetupPose();
    list.appendChild(setupLi);

    Object.keys(this.store.skeleton.animations).forEach(name => {
      const li = document.createElement('li');
      li.className = 'tree-item';
      if (name === cur) li.classList.add('selected');
      const anim = this.store.skeleton.animations[name];
      li.innerHTML = `🎬 ${name} <span class="tag">${anim.duration.toFixed(2)}s</span>`;
      li.onclick = () => this.selectAndPlayAnimation(name);
      list.appendChild(li);
    });
  }

  /**
   * Push the store's currentAnimation to the spine-pixi runtime.
   * Setup Pose (undefined) → setEmptyAnimation + setToSetupPose
   * Otherwise → setAnimation(track=0, name, loop=true)
   */
  private applyCurrentAnimation() {
    if (!this.spine) return;
    const animName = this.store.currentAnimation;
    if (animName) {
      try {
        this.spine.state.setAnimation(0, animName, true);
      } catch (err) {
        console.warn('[applyCurrentAnimation] failed:', err);
      }
    } else {
      // Setup pose: clear any track + reset skeleton
      this.spine.state.setEmptyAnimation(0, 0);
      (this.spine.skeleton as any).setToSetupPose?.();
    }
  }

  /** Select "Setup Pose" — clear current animation, show skeleton at defaults. */
  private selectSetupPose() {
    console.log('[anim] setup pose');
    if (this.store.playing) {
      this.store.setPlaying(false);
      if (this.playbackRaf) { cancelAnimationFrame(this.playbackRaf); this.playbackRaf = null; }
      (document.getElementById('btn-play') as HTMLElement).textContent = '▶';
    }
    this.store.setCurrentAnimation(undefined);
    if (this.mode !== 'pose') this.setMode('pose');
  }

  /**
   * Click anim in list → switch to Pose mode (so anim is visible), set as
   * current, reset to t=0, auto-play. One-click anim preview.
   */
  private selectAndPlayAnimation(name: string) {
    console.log(`[anim] select+play: ${name}`);
    // Stop any current playback so togglePlay() starts fresh
    if (this.store.playing) {
      this.store.setPlaying(false);
      if (this.playbackRaf) { cancelAnimationFrame(this.playbackRaf); this.playbackRaf = null; }
    }
    this.store.setCurrentAnimation(name);    // resets time to 0, emits events
    if (this.mode !== 'pose') this.setMode('pose');
    // Start playback
    this.togglePlay();
  }

  private renderProperties() {
    const empty = document.getElementById('props-empty') as HTMLElement;
    const content = document.getElementById('props-content') as HTMLElement;
    const sel = this.store.selection;
    if (sel.type === 'none') {
      empty.style.display = 'block';
      content.style.display = 'none';
      content.innerHTML = '';
      return;
    }
    empty.style.display = 'none';
    content.style.display = 'block';

    if (sel.type === 'bone') {
      const bone = this.store.skeleton.bones.find(b => b.name === sel.name);
      if (!bone) return;
      content.innerHTML = `
        <div class="prop-section">Bone</div>
        <div class="prop-row"><label>Name</label><input id="p-name" value="${bone.name}"></div>
        <div class="prop-row"><label>Parent</label><input id="p-parent" value="${bone.parent ?? ''}"></div>
        <div class="prop-row"><label>X</label><input id="p-x" type="number" value="${bone.x}" step="1"></div>
        <div class="prop-row"><label>Y</label><input id="p-y" type="number" value="${bone.y}" step="1"></div>
        <div class="prop-row"><label>Rotation</label><input id="p-rot" type="number" value="${bone.rotation}" step="1"></div>
        <div class="prop-row"><label>Scale X</label><input id="p-sx" type="number" value="${bone.scaleX}" step="0.1"></div>
        <div class="prop-row"><label>Scale Y</label><input id="p-sy" type="number" value="${bone.scaleY}" step="0.1"></div>
        <div class="prop-row"><label>Length</label><input id="p-len" type="number" value="${bone.length}" step="1"></div>
      `;
      const bind = (id: string, k: keyof Bone, parse: (s: string) => any) => {
        const el = document.getElementById(id) as HTMLInputElement;
        el.addEventListener('input', () => {
          this.store.setBone(bone.name, { [k]: parse(el.value) } as any);
        });
      };
      bind('p-x', 'x', parseFloat);
      bind('p-y', 'y', parseFloat);
      bind('p-rot', 'rotation', parseFloat);
      bind('p-sx', 'scaleX', parseFloat);
      bind('p-sy', 'scaleY', parseFloat);
      bind('p-len', 'length', parseFloat);
    } else if (sel.type === 'slot') {
      const slot = this.store.skeleton.slots.find(s => s.name === sel.name);
      if (!slot) return;
      const regions = this.store.atlas.pages[0]?.regions ?? [];
      content.innerHTML = `
        <div class="prop-section">Slot</div>
        <div class="prop-row"><label>Name</label><input id="p-name" value="${slot.name}" disabled></div>
        <div class="prop-row"><label>Bone</label><input id="p-bone" value="${slot.bone}" disabled></div>
        <div class="prop-row"><label>Attach</label>
          <select id="p-att" style="width:100%;height:22px;background:var(--bg-2);color:var(--text);border:1px solid var(--border);border-radius:3px;font-size:11px;">
            <option value="">(none)</option>
            ${regions.map(r => `<option value="${r.name}" ${slot.attachment === r.name ? 'selected' : ''}>${r.name}</option>`).join('')}
          </select>
        </div>
        <div class="muted" style="margin-top:8px;font-size:10px;">Chọn module để gán làm attachment cho slot này. Module phải đã được tạo trong Atlas tab.</div>
      `;
      const att = document.getElementById('p-att') as HTMLSelectElement;
      att.addEventListener('change', () => {
        slot.attachment = att.value || undefined;
        // Ensure attachment entry exists in skin
        if (att.value && !this.store.skeleton.skins[0].attachments[slot.name]?.[att.value]) {
          const r = regions.find(r => r.name === att.value);
          if (r) {
            const newAtt: RegionAttachment = {
              type: 'region', name: r.name, path: r.name,
              x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1,
              width: r.width, height: r.height,
            };
            if (!this.store.skeleton.skins[0].attachments[slot.name]) {
              this.store.skeleton.skins[0].attachments[slot.name] = {};
            }
            this.store.skeleton.skins[0].attachments[slot.name][r.name] = newAtt;
          }
        }
        this.refreshRenderer();
        this.renderHierarchy();
      });
    } else if (sel.type === 'attachment' && sel.slot === '__atlas__') {
      // Atlas region selection
      const r = this.store.atlas.pages[0]?.regions.find(r => r.name === sel.name);
      if (!r) return;
      content.innerHTML = `
        <div class="prop-section">Region</div>
        <div class="prop-row"><label>Name</label><input id="p-name" value="${r.name}"></div>
        <div class="prop-row"><label>X</label><input id="p-x" type="number" value="${r.x}" step="1"></div>
        <div class="prop-row"><label>Y</label><input id="p-y" type="number" value="${r.y}" step="1"></div>
        <div class="prop-row"><label>Width</label><input id="p-w" type="number" value="${r.width}" step="1"></div>
        <div class="prop-row"><label>Height</label><input id="p-h" type="number" value="${r.height}" step="1"></div>
      `;
      const bind = (id: string, k: keyof typeof r, parse: (s: string) => any) => {
        const el = document.getElementById(id) as HTMLInputElement;
        el.addEventListener('input', () => {
          (r as any)[k] = parse(el.value);
          this.atlasView?.setAtlas(this.store.atlas);
          this.renderModuleList();
        });
      };
      bind('p-x', 'x', parseFloat);
      bind('p-y', 'y', parseFloat);
      bind('p-w', 'width', parseFloat);
      bind('p-h', 'height', parseFloat);
      const nameEl = document.getElementById('p-name') as HTMLInputElement;
      nameEl.addEventListener('change', () => {
        // Rename atlas region — also rename in slot attachment refs (Phase 3+)
        r.name = nameEl.value;
        this.atlasView?.setAtlas(this.store.atlas);
        this.renderModuleList();
      });
    }
  }

  private updateTimeSlider() {
    const slider = document.getElementById('time-slider') as HTMLInputElement;
    const val = document.getElementById('time-val') as HTMLElement;
    const dur = this.store.currentDuration;
    slider.max = String(dur * 1000);
    slider.value = String(this.store.currentTimeSec * 1000);
    val.textContent = `${(this.store.currentTimeSec * 1000).toFixed(0)}ms / ${(dur * 1000).toFixed(0)}ms`;
  }

  private updateStats() {
    const sk = this.store.skeleton;
    const stats = document.getElementById('status-stats') as HTMLElement;
    stats.textContent = `${sk.bones.length} bone · ${sk.slots.length} slot · ${this.store.atlas.pages[0]?.regions.length ?? 0} module · ${Object.keys(sk.animations).length} anim`;
  }

  private setStatus(msg: string) {
    (document.getElementById('status-msg') as HTMLElement).textContent = msg;
    this.updateStats();
  }

  private setProjectName(name: string) {
    (document.getElementById('project-name') as HTMLElement).textContent = name;
    document.title = `${name} — Spine Clone`;
  }
}

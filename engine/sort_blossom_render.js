/**
 * KVTM 2.0 — Sort Blossom DOM render helpers
 * Used by tool and game. Builds pot DOM + paints flowers using shared CSS classes.
 *
 * Usage:
 *   const cell = SortBlossomRender.buildPotCell({ idx, pot, assetPath });
 *   container.appendChild(cell);
 *   SortBlossomRender.paintActive(cell, pot);
 */
(function (global) {
  'use strict';

  const COLORS = {
    R: { name: 'Red',      img: 'flower_red.webp',      bloom: 'flower_red_bloom.webp',      rectsFile: 'bloom_rects_red.json'      },
    P: { name: 'Pink',     img: 'flower_pink.webp',     bloom: 'flower_pink_bloom.webp',     rectsFile: 'bloom_rects_pink.json'     },
    Y: { name: 'Yellow',   img: 'flower_yellow.webp',   bloom: 'flower_yellow_bloom.webp',   rectsFile: 'bloom_rects_yellow.json'   },
    V: { name: 'Purple',   img: 'flower_purple.webp',   bloom: 'flower_purple_bloom.webp',   rectsFile: 'bloom_rects_purple.json'   },
    W: { name: 'White',    img: 'flower_white.webp',    bloom: 'flower_white_bloom.webp',    rectsFile: 'bloom_rects_white.json'    },
    O: { name: 'Orange',   img: 'flower_orange.webp',   bloom: 'flower_orange_bloom.webp',   rectsFile: 'bloom_rects_orange.json'   },
    B: { name: 'Blue',     img: 'flower_blue.webp',     bloom: 'flower_blue_bloom.webp',     rectsFile: 'bloom_rects_blue.json'     },
    C: { name: 'Camellia', img: 'flower_camellia.webp', bloom: 'flower_camellia_bloom.webp', rectsFile: 'bloom_rects_camellia.json' },
  };

  // Bloom sprite sheet config — 5 cols × 2 rows = 10 frames
  const BLOOM_COLS = 5;
  const BLOOM_ROWS = 2;
  const BLOOM_FRAMES = 10;
  const BLOOM_DURATION_MS = 1800;

  const POS_LABEL = ['L', 'C', 'R'];

  /**
   * Build a pot DOM cell with:
   *   - pot-back image
   *   - active-flowers visual layer (3 fanned imgs based on pot.active)
   *   - active-row hit zones (3 columns)
   *   - pot-front image
   *   - queue preview / queue strip
   *
   * @param {Object} opts
   * @param {number} opts.idx
   * @param {{active: (string|null)[], queue: string[]}} opts.pot
   * @param {string} opts.assetPath     e.g. 'assets/sort_blossom/'
   * @param {boolean} opts.showPosLabel
   * @param {boolean} opts.showQueue
   * @param {number} opts.queueMax     max queue cells to render (editor); pass 0 to render only filled
   */
  function buildPotCell({ idx, pot, assetPath, showPosLabel = false, showQueue = true, queueMax = 6, showIndex = false, showQueuePreview = true }) {
    const cell = document.createElement('div');
    cell.className = 'sb-pot-cell';
    cell.dataset.idx = idx;

    const indexHTML = showIndex ? `<span class="sb-pot-index">Pot #${idx}</span>` : '';
    const flowersHTML = [0,1,2].map(p => {
      const f = pot.active[p];
      if (!f) return '';
      const src = assetPath + COLORS[f].img;
      return `<img src="${src}" data-pos="${p}" draggable="false">`;
    }).join('');
    const slotsHTML = [0,1,2].map(p => `
      <div class="sb-active-slot" data-pos="${p}">
        ${showPosLabel ? `<span class="sb-pos-label">${POS_LABEL[p]}</span>` : ''}
      </div>
    `).join('');

    const queuePreviewHTML = showQueuePreview ? renderQueuePreview(pot, assetPath) : '';
    const queueHTML = showQueue ? renderQueueStrip(pot.queue, queueMax, assetPath) : '';

    cell.innerHTML = `
      ${indexHTML}
      <div class="sb-pot-visual">
        <img class="sb-pot-back" src="${assetPath}pot_empty.webp" draggable="false">
        <div class="sb-queue-preview">${queuePreviewHTML}</div>
        <div class="sb-active-flowers">${flowersHTML}</div>
        <div class="sb-active-row">${slotsHTML}</div>
        <img class="sb-pot-front" src="${assetPath}pot_front.webp" draggable="false">
      </div>
      ${queueHTML}
    `;
    return cell;
  }

  function renderQueuePreview(pot, assetPath) {
    return [0,1,2].map(p => {
      if (pot.active[p] !== null) return '';
      const f = pot.queue[p];
      if (!f) return '';
      const c = COLORS[f];
      return `<img class="sb-queue-bud" data-pos="${p}" data-color="${f}" draggable="false" src="${assetPath}${c.img}">`;
    }).join('');
  }

  // Embedded bloom rects — no fetch needed, works on file:// and localhost
  const _BLOOM_RECTS = {
    R: [[120,156,177,280],[362,153,197,283],[617,150,207,285],[882,144,214,292],[1211,147,224,290],[78,644,230,292],[339,640,228,295],[596,636,240,297],[876,627,248,309],[1225,628,245,309]],
    P: [[118,166,180,260],[368,162,184,264],[621,153,189,270],[883,143,239,284],[1212,151,249,276],[99,634,207,299],[349,635,222,300],[605,628,237,304],[876,625,276,310],[1208,615,269,318]],
    Y: [[122,147,176,265],[364,150,189,260],[622,140,186,271],[880,137,228,278],[1201,135,242,279],[81,621,217,323],[327,621,240,328],[582,619,266,332],[868,614,253,332],[1195,608,269,338]],
    V: [[122,148,161,291],[360,148,180,298],[624,129,182,314],[876,128,212,312],[1207,135,213,307],[113,617,169,312],[360,608,181,321],[614,611,198,320],[862,611,222,322],[1215,614,215,315]],
    W: [[115,167,193,251],[341,163,202,253],[602,149,204,270],[869,140,241,279],[1195,140,259,279],[71,623,225,284],[345,619,204,289],[608,616,208,292],[860,619,226,289],[1191,616,243,290]],
    O: [[117,152,187,268],[343,148,203,276],[614,138,192,281],[864,138,250,282],[1204,140,256,282],[85,618,213,296],[340,618,207,297],[592,616,226,299],[858,616,232,297],[1201,610,243,303]],
    B: [[116,168,181,251],[345,156,204,261],[595,136,223,282],[862,140,254,280],[1191,141,267,282],[84,630,206,276],[329,621,226,286],[587,619,231,291],[850,615,240,294],[1199,619,252,290]],
    C: [[110,151,183,271],[340,149,213,274],[596,144,206,284],[838,140,308,285],[1195,139,270,295],[76,615,214,293],[327,609,216,299],[576,615,248,293],[840,616,256,288],[1191,616,260,291]],
  };

  // Cache: sheet Image per color
  const _bloomCache = {};   // color → { sheet: Image, rects: [[x,y,w,h],...] } | false
  function _probeBloom(color, assetPath, cb) {
    if (color in _bloomCache) return cb(_bloomCache[color]);
    const c = COLORS[color];
    const sheet = new Image();
    sheet.onload  = () => { _bloomCache[color] = { sheet, rects: _BLOOM_RECTS[color] || null }; cb(_bloomCache[color]); };
    sheet.onerror = () => { _bloomCache[color] = false; cb(false); };
    sheet.src = assetPath + c.bloom;
  }
  function _probeBloomLegacy(color, assetPath, cb) {
    if (color in _bloomCache) return cb(_bloomCache[color]);
    const probe = new Image();
    probe.onload  = () => { _bloomCache[color] = true;  cb(true); };
    probe.onerror = () => { _bloomCache[color] = false; cb(false); };
    probe.src = assetPath + COLORS[color].bloom;
  }
  /** Show bloom bud (frame 0) on queue preview imgs using canvas. */
  function upgradeQueueBuds(cell, assetPath) {
    cell.querySelectorAll('.sb-queue-bud').forEach(imgEl => {
      const color = imgEl.dataset.color;
      if (!color || !COLORS[color]) return;
      _probeBloom(color, assetPath, (cached) => {
        if (!cached) return;
        const { sheet, rects } = cached;
        const rect = imgEl.getBoundingClientRect();
        const dw = rect.width || 26, dh = rect.height || 26;
        if (!dw || !dh) return;

        // Draw bud (frame 0) onto a canvas and use as data-url for the img
        const oc = document.createElement('canvas');
        oc.width = Math.round(dw); oc.height = Math.round(dh);
        const ctx = oc.getContext('2d');
        if (rects && rects[0]) {
          const [sx, sy, sw, sh] = rects[0];
          ctx.drawImage(sheet, sx, sy, sw, sh, 0, 0, oc.width, oc.height);
        } else {
          const fw = sheet.naturalWidth / BLOOM_COLS;
          const fh = sheet.naturalHeight / BLOOM_ROWS;
          ctx.drawImage(sheet, 0, 0, fw, fh, 0, 0, oc.width, oc.height);
        }
        try { imgEl.src = oc.toDataURL(); } catch(e) { /* tainted canvas on file:// — keep static img */ }
      });
    });
  }

  function renderQueueStrip(queue, queueMax, assetPath) {
    let inner = `<div class="sb-queue-label">Queue (${queue.length}/${queueMax})</div>`;
    for (let i = 0; i < queueMax; i++) {
      if (i < queue.length) {
        const c = COLORS[queue[i]];
        inner += `<div class="sb-queue-flower" data-qidx="${i}"><img src="${assetPath}${c.img}" draggable="false"></div>`;
      } else {
        inner += `<div class="sb-queue-empty" data-qidx="${i}">+</div>`;
      }
    }
    return `<div class="sb-queue-strip">${inner}</div>`;
  }

  /**
   * Update existing pot cell's flowers (active + queue) without rebuilding.
   * Call after state changes.
   */
  function paintActive(cell, pot, assetPath) {
    if (!cell) return;
    const flowersEl = cell.querySelector('.sb-active-flowers');
    if (flowersEl) {
      flowersEl.innerHTML = '';
      [0,1,2].forEach(p => {
        const f = pot.active[p];
        if (!f) return;
        const img = document.createElement('img');
        img.src = assetPath + COLORS[f].img;
        img.draggable = false;
        img.dataset.pos = String(p);
        flowersEl.appendChild(img);
      });
    }
    const previewEl = cell.querySelector('.sb-queue-preview');
    if (previewEl) {
      previewEl.innerHTML = renderQueuePreview(pot, assetPath);
      // Upgrade to bloom-sheet frame 1 (bud) on next frame (after layout)
      requestAnimationFrame(() => upgradeQueueBuds(cell, assetPath));
    }
  }

  function paintQueue(cell, pot, assetPath, queueMax = 6) {
    if (!cell) return;
    const old = cell.querySelector('.sb-queue-strip');
    if (!old) return;
    const newHTML = renderQueueStrip(pot.queue, queueMax, assetPath);
    const tmp = document.createElement('div');
    tmp.innerHTML = newHTML;
    old.parentNode.replaceChild(tmp.firstElementChild, old);
  }

  function paintAll(cell, pot, assetPath, queueMax = 6) {
    paintActive(cell, pot, assetPath);
    paintQueue(cell, pot, assetPath, queueMax);
  }

  /** Mark a slot's flower as lifted (selected). Pass {pot,pos} or null. */
  function setSelected(cells, selected) {
    cells.forEach((cell, i) => {
      cell.classList.toggle('sb-selected', selected && selected.pot === i);
      const flowers = cell.querySelectorAll('.sb-active-flowers img');
      flowers.forEach(img => {
        const p = parseInt(img.dataset.pos, 10);
        img.classList.toggle('sb-lifted',
          selected && selected.pot === i && selected.pos === p);
      });
    });
  }

  /** Play vanish animation on cell's active flowers. */
  function playVanish(cell, onDone) {
    if (!cell) { onDone && onDone(); return; }
    const flowers = cell.querySelectorAll('.sb-active-flowers img');
    flowers.forEach(img => img.classList.add('sb-vanish'));
    setTimeout(() => { onDone && onDone(); }, 420);
  }

  /**
   * Animate a flower flying from source slot to dest slot with arc bezier flight.
   * Source flower is hidden during flight. Caller commits state change & repaints onDone.
   *
   * @param {Object} opts
   * @param {HTMLElement} opts.srcCell   source pot cell
   * @param {HTMLElement} opts.destCell  dest pot cell
   * @param {number} opts.srcPos         0/1/2
   * @param {number} opts.destPos        0/1/2
   * @param {string} opts.color          flower color key (R/P/Y/V/W/O/B/C)
   * @param {string} opts.assetPath      'assets/sort_blossom/'
   * @param {Function} opts.onLand       called when flower lands (commit state here)
   * @param {Function} opts.onDone       called after land bounce settles
   */
  /**
   * Smooth rAF-driven arc flight (60fps, ~24 frames over 400ms).
   * Parabolic Y arc + linear X + easeInOutCubic time mapping → silky smooth.
   */
  /**
   * Flight animation with 3 modes for A/B testing.
   * Mode B: Web Animations API arc (browser-native compositor, GPU-smooth)
   * Mode C: Float drift, NO arc (smoothest possible, linear-eased translate)
   * Mode D: Crossfade replace, NO travel (instant fade A→B + sparkle trail)
   */
  function animateFlight(opts) {
    let mode = opts.mode || (typeof window !== 'undefined' && window._flightMode) ||
               (typeof localStorage !== 'undefined' && localStorage.getItem('kvtm_flight_mode')) || 'R';
    // Random: roll one of B/C/D each call
    if (mode === 'R') {
      mode = ['B', 'C', 'D'][Math.floor(Math.random() * 3)];
    }
    if (mode === 'C') return animateFlightDrift(opts);
    if (mode === 'D') return animateFlightCrossfade(opts);
    return animateFlightArc(opts);
  }

  /** Mode B — Web Animations API arc. Compositor-driven, GPU smooth. */
  function animateFlightArc({ srcCell, destCell, srcPos, destPos, color, assetPath, onLand, onDone, duration = 550 }) {
    const ctx = _prepFlight(srcCell, destCell, srcPos, destPos, color, assetPath);
    if (!ctx) { onLand && onLand(); onDone && onDone(); return; }
    const { fly, srcImg, startX, startY, endX, endY } = ctx;

    const midX = (startX + endX) / 2;
    const peakY = Math.min(startY, endY) - Math.max(48, Math.hypot(endX - startX, endY - startY) * 0.3);

    const anim = fly.animate([
      { transform: `translate3d(${startX}px, ${startY}px, 0) scale(1.1)`, offset: 0 },
      { transform: `translate3d(${midX}px, ${peakY}px, 0) scale(1.14)`, offset: 0.4 },
      { transform: `translate3d(${endX}px, ${endY}px, 0) scale(1.0)`, offset: 1 }
    ], {
      duration,
      easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
      fill: 'forwards',
    });

    anim.onfinish = () => _finalizeFlight(fly, destCell, onLand, onDone);
    _fadeOutSource(srcImg);
  }

  /** Mode C — Smooth float drift, no arc. Pure linear-eased translate. */
  function animateFlightDrift({ srcCell, destCell, srcPos, destPos, color, assetPath, onLand, onDone, duration = 480 }) {
    const ctx = _prepFlight(srcCell, destCell, srcPos, destPos, color, assetPath);
    if (!ctx) { onLand && onLand(); onDone && onDone(); return; }
    const { fly, srcImg, startX, startY, endX, endY } = ctx;

    const anim = fly.animate([
      { transform: `translate3d(${startX}px, ${startY}px, 0) scale(1.08)`, offset: 0 },
      { transform: `translate3d(${endX}px, ${endY}px, 0) scale(1.0)`, offset: 1 }
    ], {
      duration,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)',  // smooth easeOutQuart
      fill: 'forwards',
    });

    anim.onfinish = () => _finalizeFlight(fly, destCell, onLand, onDone);
    _fadeOutSource(srcImg);
  }

  /** Mode D — Crossfade replace, no travel. Sparkle trail across the gap. */
  function animateFlightCrossfade({ srcCell, destCell, srcPos, destPos, color, assetPath, onLand, onDone, duration = 260 }) {
    const ctx = _prepFlight(srcCell, destCell, srcPos, destPos, color, assetPath);
    if (!ctx) { onLand && onLand(); onDone && onDone(); return; }
    const { fly, srcImg, startX, startY, endX, endY } = ctx;

    // Sparkle trail: 6 dots along the line
    const trail = [];
    for (let i = 1; i <= 6; i++) {
      const tt = i / 7;
      const x = startX + (endX - startX) * tt + (Math.random() - 0.5) * 8;
      const y = startY + (endY - startY) * tt + (Math.random() - 0.5) * 8;
      const d = document.createElement('div');
      d.style.cssText = `
        position: fixed; left: ${x}px; top: ${y}px;
        width: 8px; height: 8px; border-radius: 50%;
        background: radial-gradient(circle, #fff7c0, rgba(255,215,0,0));
        z-index: 9998; pointer-events: none;
        opacity: 0;
      `;
      document.body.appendChild(d);
      trail.push(d);
      d.animate([
        { opacity: 0, transform: 'scale(0.6)' },
        { opacity: 1, transform: 'scale(1.2)', offset: 0.4 },
        { opacity: 0, transform: 'scale(0.4)' }
      ], { duration: 280, delay: i * 18, fill: 'forwards' }).onfinish = () => d.remove();
    }

    // Clone scale-fades down at A
    fly.animate([
      { transform: `translate3d(${startX}px, ${startY}px, 0) scale(1.1)`, opacity: 1 },
      { transform: `translate3d(${startX}px, ${startY}px, 0) scale(0.7)`, opacity: 0 }
    ], { duration: duration * 0.45, fill: 'forwards', easing: 'ease-in' });

    // Mid-way: commit place + dest flower pop-in
    setTimeout(() => {
      onLand && onLand();
      fly.remove();
      // Pop-in animation on dest cell's new flower
      const destImg = destCell.querySelector(`.sb-active-flowers img[data-pos="${destPos}"]`);
      if (destImg) {
        destImg.animate([
          { transform: 'translateX(-50%) scale(0.4)', opacity: 0 },
          { transform: 'translateX(-50%) scale(1.15)', opacity: 1, offset: 0.6 },
          { transform: 'translateX(-50%) scale(1.0)', opacity: 1 }
        ], { duration: duration * 0.55, fill: 'none', easing: 'cubic-bezier(0.34,1.4,0.64,1)' });
      }
      // Subtle pot bounce
      destCell.classList.remove('sb-land-bounce');
      void destCell.offsetWidth;
      destCell.classList.add('sb-land-bounce');
      setTimeout(() => {
        destCell.classList.remove('sb-land-bounce');
        onDone && onDone();
      }, 220);
    }, duration * 0.45);

    _fadeOutSource(srcImg);
  }

  // ─── shared helpers ────────────────────────────────────
  function _prepFlight(srcCell, destCell, srcPos, destPos, color, assetPath) {
    if (!srcCell || !destCell) return null;
    const srcImg = srcCell.querySelector(`.sb-active-flowers img[data-pos="${srcPos}"]`);
    const destFlowers = destCell.querySelector('.sb-active-flowers');
    if (!srcImg || !destFlowers) return null;
    const srcRect = srcImg.getBoundingClientRect();
    const destRect = destFlowers.getBoundingClientRect();
    const slotWidth = destRect.width / 3;
    const startX = srcRect.left;
    const startY = srcRect.top;
    const endX = destRect.left + slotWidth * destPos + slotWidth / 2 - srcRect.width / 2;
    const endY = destRect.top + destRect.height - srcRect.height - 12;

    const fly = document.createElement('img');
    fly.src = assetPath + COLORS[color].img;
    fly.style.cssText = `
      position: fixed;
      left: 0; top: 0;
      width: ${srcRect.width}px;
      height: auto;
      z-index: 9999;
      pointer-events: none;
      filter: drop-shadow(0 8px 14px rgba(0,0,0,.3));
      will-change: transform, opacity;
      transform: translate3d(${startX}px, ${startY}px, 0) scale(1.1);
      backface-visibility: hidden;
    `;
    document.body.appendChild(fly);
    return { fly, srcImg, startX, startY, endX, endY };
  }

  function _fadeOutSource(srcImg) {
    srcImg.style.transition = 'opacity .1s';
    srcImg.style.opacity = '0';
    setTimeout(() => {
      srcImg.style.visibility = 'hidden';
      srcImg.style.opacity = '';
      srcImg.style.transition = '';
    }, 110);
  }

  function _finalizeFlight(fly, destCell, onLand, onDone) {
    onLand && onLand();
    // Crossfade clone out as real flower appears at same spot
    fly.style.transition = 'opacity .1s ease-out';
    fly.style.opacity = '0';
    setTimeout(() => fly.remove(), 110);
    destCell.classList.remove('sb-land-bounce');
    void destCell.offsetWidth;
    destCell.classList.add('sb-land-bounce');
    setTimeout(() => {
      destCell.classList.remove('sb-land-bounce');
      onDone && onDone();
    }, 220);
  }

  // Legacy stub (renamed earlier rAF version, no longer used directly)
  function animateFlightLegacy(opts) { return animateFlightArc(opts); }
  void animateFlightLegacy;

  function animateFlightDispatcher(opts) {  // not used, kept for clarity
    return animateFlight(opts);
  }
  void animateFlightDispatcher;

  // Original rAF function disabled — replaced by mode dispatcher
  function _disabledLegacy_animateFlight({ srcCell, destCell, srcPos, destPos, color, assetPath, onLand, onDone, duration = 780 }) {
    if (!srcCell || !destCell) { onLand && onLand(); onDone && onDone(); return; }
    const srcImg = srcCell.querySelector(`.sb-active-flowers img[data-pos="${srcPos}"]`);
    const destFlowers = destCell.querySelector('.sb-active-flowers');
    if (!srcImg || !destFlowers) { onLand && onLand(); onDone && onDone(); return; }

    const srcRect = srcImg.getBoundingClientRect();
    const destRect = destFlowers.getBoundingClientRect();
    const slotWidth = destRect.width / 3;

    const startX = srcRect.left;
    const startY = srcRect.top;
    const endX = destRect.left + slotWidth * destPos + slotWidth / 2 - srcRect.width / 2;
    const endY = destRect.top + destRect.height - srcRect.height - 12;

    // Peak height: very gentle arc — lower peak = softer floating feel
    const distance = Math.hypot(endX - startX, endY - startY);
    const peakH = Math.max(34, distance * 0.22);

    // Build flying clone — constant scale 1.12, smooth transform updates
    const fly = document.createElement('img');
    fly.src = assetPath + COLORS[color].img;
    fly.style.cssText = `
      position: fixed;
      left: 0; top: 0;
      width: ${srcRect.width}px;
      height: auto;
      z-index: 9999;
      pointer-events: none;
      filter: drop-shadow(0 8px 14px rgba(0,0,0,.32));
      will-change: transform;
      transform: translate3d(${startX}px, ${startY}px, 0) scale(1.12);
      backface-visibility: hidden;
      -webkit-backface-visibility: hidden;
    `;
    document.body.appendChild(fly);

    // Hide source flower (smooth fade to invisible)
    srcImg.style.transition = 'opacity .12s';
    srcImg.style.opacity = '0';
    setTimeout(() => { srcImg.style.visibility = 'hidden'; srcImg.style.opacity = ''; srcImg.style.transition = ''; }, 130);

    // Composite easing — extra gentle feather landing
    //   - Body (0→0.48): easeInOutQuint covers 85% of distance
    //   - Tail (0.48→1): easeOutExpo covers last 15% of distance over 52% of time
    //     → bông "lướt nhẹ" cuối hành trình, hạ xuống như lông vũ
    const easeBody = (t) => (t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2);
    const easeTail = (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t));   // easeOutExpo
    const ease = (t) => {
      if (t < 0.48) return easeBody(t / 0.48) * 0.85;
      const tt = (t - 0.48) / 0.52;
      return 0.85 + easeTail(tt) * 0.15;
    };

    const start = performance.now();
    function frame(now) {
      const elapsed = now - start;
      const t = Math.min(1, elapsed / duration);
      const e = ease(t);

      // X & Y travel
      const x = startX + (endX - startX) * e;
      const yLinear = startY + (endY - startY) * e;
      const arcLift = Math.sin(Math.PI * e) * peakH;
      const y = yLinear - arcLift;

      // Scale ramp down 1.10 → 1.0 over last 52% of TIME (very gentle settle)
      let scale = 1.10;
      if (t > 0.48) {
        const k = (t - 0.48) / 0.52;
        const ks = k * k * (3 - 2 * k);   // smoothstep
        scale = 1.10 - 0.10 * ks;
      }

      fly.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`;

      if (t < 1) {
        requestAnimationFrame(frame);
      } else {
        // t=1 → clone is at (endX, endY) with scale 1.0 (no snap)
        // Commit state immediately. Clone fades out as real flower paints in same spot.
        onLand && onLand();
        // Crossfade clone out (real flower now visible underneath at same position)
        fly.style.transition = 'opacity .12s ease-out';
        fly.style.opacity = '0';
        setTimeout(() => fly.remove(), 130);
        // Gentle pot bounce starting now (overlaps with crossfade for smoothness)
        destCell.classList.remove('sb-land-bounce');
        void destCell.offsetWidth;
        destCell.classList.add('sb-land-bounce');
        setTimeout(() => {
          destCell.classList.remove('sb-land-bounce');
          onDone && onDone();
        }, 220);
      }
    }
    requestAnimationFrame(frame);
  }

  /** Convert click event to position 0/1/2 within the pot's bounds. */
  function eventToPos(ev, cell) {
    const rect = cell.querySelector('.sb-pot-visual').getBoundingClientRect();
    const x = (ev.clientX || (ev.touches && ev.touches[0].clientX) || 0) - rect.left;
    if (typeof SortBlossomEngine !== 'undefined') {
      return SortBlossomEngine.pickPosFromX(x, rect.width);
    }
    // Fallback
    const r = x / rect.width;
    return r < 0.34 ? 0 : r > 0.66 ? 2 : 1;
  }

  function eventToNearestFlowerPos(ev, cell, pot) {
    const flowers = [...cell.querySelectorAll('.sb-active-flowers img')];
    const clientX = ev.clientX || (ev.touches && ev.touches[0].clientX) || 0;
    if (!flowers.length) return eventToPos(ev, cell);
    let best = null;
    flowers.forEach(img => {
      const rect = img.getBoundingClientRect();
      const dist = Math.abs(clientX - (rect.left + rect.width / 2));
      const pos = parseInt(img.dataset.pos, 10);
      if (!best || dist < best.dist) best = { pos, dist };
    });
    return best ? best.pos : eventToPos(ev, cell);
  }

  function eventToFlowerHitPos(ev, cell) {
    const clientX = ev.clientX || (ev.touches && ev.touches[0].clientX) || 0;
    const clientY = ev.clientY || (ev.touches && ev.touches[0].clientY) || 0;
    const flowers = [...cell.querySelectorAll('.sb-active-flowers img')];
    for (let i = flowers.length - 1; i >= 0; i--) {
      const img = flowers[i];
      const rect = img.getBoundingClientRect();
      const padX = rect.width * 0.08;
      const padY = rect.height * 0.08;
      if (
        clientX >= rect.left + padX &&
        clientX <= rect.right - padX &&
        clientY >= rect.top + padY &&
        clientY <= rect.bottom - padY
      ) {
        return parseInt(img.dataset.pos, 10);
      }
    }
    return null;
  }

  function nearestOccupiedPos(pot, pos) {
    if (pot.active[pos]) return pos;
    const order = pos === 1 ? [1,0,2] : (pos === 0 ? [0,1,2] : [2,1,0]);
    return order.find(p => pot.active[p]) ?? pos;
  }

  function nearestEmptyPos(pot, pos) {
    if (pot.active[pos] === null) return pos;
    const order = pos === 1 ? [1,0,2] : (pos === 0 ? [0,1,2] : [2,1,0]);
    return order.find(p => pot.active[p] === null) ?? pos;
  }

  function nearestBoardFlower(ev, cells) {
    const clientX = ev.clientX || (ev.touches && ev.touches[0].clientX) || 0;
    const clientY = ev.clientY || (ev.touches && ev.touches[0].clientY) || 0;
    let best = null;
    cells.forEach((cell, pot) => {
      cell.querySelectorAll('.sb-active-flowers img').forEach(img => {
        const rect = img.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dx = clientX - cx;
        const dy = clientY - cy;
        const dist = dx * dx + dy * dy;
        const pos = parseInt(img.dataset.pos, 10);
        if (!best || dist < best.dist) best = { pot, pos, dist };
      });
    });
    return best ? { pot: best.pot, pos: best.pos } : null;
  }

  /**
   * Play bloom animation on a freshly-promoted flower in active row.
   * The img element should already exist with the static sprite. We swap to bloom sheet
   * and step through 10 frames using background-position.
   * @param {HTMLImageElement} imgEl   target flower img element
   * @param {string} color             color key
   * @param {string} assetPath         e.g. 'assets/sort_blossom/'
   * @param {Function} onDone
   */
  // ── Bloom color map (hex per color key) ──────────────────────
  const _BLOOM_HEX = {
    R:'#e8455a', P:'#f472b6', Y:'#fbbf24', V:'#a855f7',
    W:'#e5e7eb', O:'#fb923c', B:'#60a5fa', C:'#fb7185',
  };

  // ── A: Spring Scale Pop ───────────────────────────────────────
  function _bloomA(imgEl, onDone) {
    imgEl.animate([
      { transform: 'translateX(-50%) scale(0)',   opacity: 0 },
      { transform: 'translateX(-50%) scale(1.35)',opacity: 1, offset: 0.55 },
      { transform: 'translateX(-50%) scale(1)',   opacity: 1 },
    ], { duration: 520, easing: 'ease-out', fill: 'none' })
      .onfinish = onDone;
  }

  // ── B: Petal Particle Burst ───────────────────────────────────
  function _bloomB(imgEl, color, onDone) {
    const hex = _BLOOM_HEX[color] || '#fff';
    const rect = imgEl.getBoundingClientRect();
    const cx = rect.left + rect.width  / 2;
    const cy = rect.top  + rect.height / 2;
    const N = 8;
    const frags = [];
    for (let i = 0; i < N; i++) {
      const angle = (i / N) * Math.PI * 2;
      const dist  = 38 + Math.random() * 22;
      const size  = 6 + Math.random() * 5;
      const d = document.createElement('div');
      d.style.cssText = `position:fixed;left:${cx}px;top:${cy}px;width:${size}px;height:${size}px;`
        + `border-radius:50%;background:${hex};pointer-events:none;z-index:9999;`
        + `transform:translate(-50%,-50%)`;
      document.body.appendChild(d);
      d.animate([
        { transform: `translate(-50%,-50%) scale(1)`, opacity: 1 },
        { transform: `translate(calc(-50% + ${Math.cos(angle)*dist}px), calc(-50% + ${Math.sin(angle)*dist}px)) scale(0)`, opacity: 0 },
      ], { duration: 600, easing: 'ease-out', fill: 'forwards' })
        .onfinish = () => d.remove();
      frags.push(d);
    }
    // Also spring-pop the flower itself
    imgEl.animate([
      { transform: 'translateX(-50%) scale(0.6)', opacity: 0.5 },
      { transform: 'translateX(-50%) scale(1.2)', opacity: 1, offset: 0.4 },
      { transform: 'translateX(-50%) scale(1)',   opacity: 1 },
    ], { duration: 500, easing: 'ease-out' });
    setTimeout(onDone, 620);
  }

  // ── C: Ring Pulse ─────────────────────────────────────────────
  function _bloomC(imgEl, color, onDone) {
    const hex = _BLOOM_HEX[color] || '#fff';
    const rect = imgEl.getBoundingClientRect();
    const cx = rect.left + rect.width  / 2;
    const cy = rect.top  + rect.height / 2;
    const ring = document.createElement('div');
    const r0 = rect.width * 0.4;
    ring.style.cssText = `position:fixed;left:${cx}px;top:${cy}px;width:${r0*2}px;height:${r0*2}px;`
      + `border-radius:50%;border:3px solid ${hex};pointer-events:none;z-index:9999;`
      + `transform:translate(-50%,-50%) scale(0);opacity:1;`;
    document.body.appendChild(ring);
    ring.animate([
      { transform: 'translate(-50%,-50%) scale(0)', opacity: 0.9 },
      { transform: 'translate(-50%,-50%) scale(2.8)', opacity: 0 },
    ], { duration: 550, easing: 'ease-out', fill: 'forwards' })
      .onfinish = () => ring.remove();
    imgEl.animate([
      { transform: 'translateX(-50%) scale(0.5)', opacity: 0 },
      { transform: 'translateX(-50%) scale(1.15)', opacity: 1, offset: 0.5 },
      { transform: 'translateX(-50%) scale(1)',   opacity: 1 },
    ], { duration: 480, easing: 'ease-out' });
    setTimeout(onDone, 560);
  }

  // ── D: Combo — Scale Pop + Particles ─────────────────────────
  function _bloomD(imgEl, color, onDone) {
    const hex = _BLOOM_HEX[color] || '#fff';
    const rect = imgEl.getBoundingClientRect();
    const cx = rect.left + rect.width  / 2;
    const cy = rect.top  + rect.height / 2;
    // 6 star-shaped particles
    const shapes = ['★','✦','•','◆','✿','•','★','✦'];
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2 - Math.PI / 2;
      const dist  = 44 + Math.random() * 18;
      const d = document.createElement('div');
      d.textContent = shapes[i % shapes.length];
      d.style.cssText = `position:fixed;left:${cx}px;top:${cy}px;font-size:${10+Math.random()*6}px;`
        + `color:${hex};pointer-events:none;z-index:9999;line-height:1;`
        + `transform:translate(-50%,-50%)`;
      document.body.appendChild(d);
      d.animate([
        { transform: `translate(-50%,-50%) scale(1) rotate(0deg)`, opacity: 1 },
        { transform: `translate(calc(-50% + ${Math.cos(angle)*dist}px), calc(-50% + ${Math.sin(angle)*dist}px)) scale(0) rotate(180deg)`, opacity: 0 },
      ], { duration: 650, easing: 'ease-out', fill: 'forwards' })
        .onfinish = () => d.remove();
    }
    // Big spring pop on flower
    imgEl.animate([
      { transform: 'translateX(-50%) scale(0)',   opacity: 0 },
      { transform: 'translateX(-50%) scale(1.4)', opacity: 1, offset: 0.5 },
      { transform: 'translateX(-50%) scale(0.9)', opacity: 1, offset: 0.75 },
      { transform: 'translateX(-50%) scale(1)',   opacity: 1 },
    ], { duration: 580, easing: 'ease-out' });
    setTimeout(onDone, 660);
  }

  // ── playBloom: random pick A/B/C/D ───────────────────────────
  function playBloom(imgEl, color, assetPath, onDone) {
    if (!imgEl || !imgEl.isConnected) { onDone && onDone(); return; }
    const done = () => { onDone && onDone(); };
    const pick = Math.floor(Math.random() * 4);
    if (pick === 0) _bloomA(imgEl, done);
    else if (pick === 1) _bloomB(imgEl, color, done);
    else if (pick === 2) _bloomC(imgEl, color, done);
    else _bloomD(imgEl, color, done);
  }

  /**
   * Render queue preview using bud (frame 1 of bloom sheet) if available,
   * fallback to static flower img.
   * Returns HTML string for queue preview <img> in a given slot position.
   */
  function buildQueueBud(color, assetPath, pos) {
    if (!COLORS[color]) return '';
    const bloomFile = COLORS[color].bloom;
    // We can't synchronously know if bloom sheet exists. Use background-image with fallback.
    // The element gets bloom-sheet bg-pos 0,0 (=bud frame 1). If sheet missing, src attribute
    // shows static flower so visual still renders.
    const staticFile = COLORS[color].img;
    return `<img class="sb-queue-bud" data-pos="${pos}" data-color="${color}" src="${assetPath}${staticFile}" style="background-image:url('${assetPath}${bloomFile}');background-position:0 0;background-repeat:no-repeat;"/>`;
  }

  // ─── WIN CELEBRATION ────────────────────────────────────────────
  /**
   * Play staggered win celebration on each pot cell.
   * Combo: burst particles + ring pulse + emoji fountain, staggered per pot.
   * @param {HTMLElement[]} cells  pot cell elements
   * @param {number} stars  1-3 stars earned
   */
  function playWinCelebration(cells, stars) {
    const emojis = stars === 3 ? ['🌸','✨','🌟','💐','🎉'] :
                   stars === 2 ? ['🌸','✨','💮','🌼'] :
                                 ['🌸','🌿','💧'];
    const colors  = ['#f9a8d4','#fde68a','#a5f3fc','#bbf7d0','#e9d5ff','#fed7aa'];

    cells.forEach((cell, idx) => {
      if (!cell) return;
      const delay = idx * 120;   // stagger 120ms per pot

      setTimeout(() => {
        if (!cell.isConnected) return;
        const rect = cell.getBoundingClientRect();
        const cx = rect.left + rect.width  / 2;
        const cy = rect.top  + rect.height / 2;

        // 1. Scale pop on the pot itself
        cell.animate([
          { transform: 'scale(1)',    offset: 0   },
          { transform: 'scale(1.18)', offset: 0.3 },
          { transform: 'scale(0.95)', offset: 0.6 },
          { transform: 'scale(1)',    offset: 1   },
        ], { duration: 480, easing: 'ease-out' });

        // 2. Ring pulse (position:fixed so not clipped)
        const ring = document.createElement('div');
        ring.style.cssText = `
          position:fixed; left:${cx}px; top:${cy}px;
          width:20px; height:20px;
          border-radius:50%;
          border:3px solid ${colors[idx % colors.length]};
          transform:translate(-50%,-50%) scale(0);
          pointer-events:none; z-index:9998;
        `;
        document.body.appendChild(ring);
        ring.animate([
          { transform:'translate(-50%,-50%) scale(0)', opacity:1   },
          { transform:'translate(-50%,-50%) scale(4)', opacity:0   },
        ], { duration: 600, easing:'ease-out' }).onfinish = () => ring.remove();

        // 3. Burst 10 particles
        const count = 10;
        for (let i = 0; i < count; i++) {
          const angle  = (i / count) * Math.PI * 2;
          const dist   = 55 + Math.random() * 35;
          const dx     = Math.cos(angle) * dist;
          const dy     = Math.sin(angle) * dist;
          const dot    = document.createElement('div');
          const color  = colors[Math.floor(Math.random() * colors.length)];
          const size   = 5 + Math.random() * 5;
          dot.style.cssText = `
            position:fixed; left:${cx}px; top:${cy}px;
            width:${size}px; height:${size}px;
            border-radius:50%; background:${color};
            pointer-events:none; z-index:9998;
            transform:translate(-50%,-50%);
          `;
          document.body.appendChild(dot);
          dot.animate([
            { transform:`translate(-50%,-50%) translate(0,0) scale(1)`,          opacity:1 },
            { transform:`translate(-50%,-50%) translate(${dx}px,${dy}px) scale(0)`, opacity:0 },
          ], { duration: 500 + Math.random()*300, easing:'ease-out' }).onfinish = () => dot.remove();
        }

        // 4. Emoji fountain — 3 emojis float up from pot
        for (let e = 0; e < 3; e++) {
          setTimeout(() => {
            const em = document.createElement('div');
            const offsetX = (Math.random() - 0.5) * 60;
            em.style.cssText = `
              position:fixed; left:${cx + offsetX}px; top:${cy}px;
              font-size:${18 + Math.random()*10}px;
              pointer-events:none; z-index:9999;
              transform:translate(-50%,-50%);
              user-select:none;
            `;
            em.textContent = emojis[Math.floor(Math.random() * emojis.length)];
            document.body.appendChild(em);
            em.animate([
              { transform:`translate(-50%,-50%) translateY(0)   scale(1)`,   opacity:1 },
              { transform:`translate(-50%,-50%) translateY(-90px) scale(0.6)`, opacity:0 },
            ], { duration: 900 + Math.random()*400, easing:'ease-out' }).onfinish = () => em.remove();
          }, e * 80);
        }
      }, delay);
    });
  }

  // ─── EXPORT ─────────────────────────────────────────
  const api = {
    COLORS,
    BLOOM_COLS, BLOOM_ROWS, BLOOM_FRAMES, BLOOM_DURATION_MS,
    buildPotCell,
    paintActive, paintQueue, paintAll,
    setSelected, playVanish, animateFlight, playBloom, playWinCelebration, buildQueueBud, upgradeQueueBuds,
    renderQueueStrip,
    eventToPos, eventToNearestFlowerPos, eventToFlowerHitPos,
    nearestOccupiedPos, nearestEmptyPos, nearestBoardFlower,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    global.SortBlossomRender = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);

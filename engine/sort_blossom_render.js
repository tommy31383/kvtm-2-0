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
    R: { name: 'Red',      img: 'flower_red.png',      bloom: 'flower_red_bloom.png',      rectsFile: 'bloom_rects_red.json'      },
    P: { name: 'Pink',     img: 'flower_pink.png',     bloom: 'flower_pink_bloom.png',     rectsFile: 'bloom_rects_pink.json'     },
    Y: { name: 'Yellow',   img: 'flower_yellow.png',   bloom: 'flower_yellow_bloom.png',   rectsFile: 'bloom_rects_yellow.json'   },
    V: { name: 'Purple',   img: 'flower_purple.png',   bloom: 'flower_purple_bloom.png',   rectsFile: 'bloom_rects_purple.json'   },
    W: { name: 'White',    img: 'flower_white.png',    bloom: 'flower_white_bloom.png',    rectsFile: 'bloom_rects_white.json'    },
    O: { name: 'Orange',   img: 'flower_orange.png',   bloom: 'flower_orange_bloom.png',   rectsFile: 'bloom_rects_orange.json'   },
    B: { name: 'Blue',     img: 'flower_blue.png',     bloom: 'flower_blue_bloom.png',     rectsFile: 'bloom_rects_blue.json'     },
    C: { name: 'Camellia', img: 'flower_camellia.png', bloom: 'flower_camellia_bloom.png', rectsFile: 'bloom_rects_camellia.json' },
  };

  // Bloom sprite sheet config — 5 cols × 2 rows = 10 frames
  const BLOOM_COLS = 5;
  const BLOOM_ROWS = 2;
  const BLOOM_FRAMES = 10;
  const BLOOM_DURATION_MS = 700;

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
        <img class="sb-pot-back" src="${assetPath}pot_empty.png" draggable="false">
        <div class="sb-queue-preview">${queuePreviewHTML}</div>
        <div class="sb-active-flowers">${flowersHTML}</div>
        <div class="sb-active-row">${slotsHTML}</div>
        <img class="sb-pot-front" src="${assetPath}pot_front.png" draggable="false">
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

  // Cache: sheet Image + rects per color
  const _bloomCache = {};   // color → { sheet: Image, rects: [[x,y,w,h],...] } | false
  function _probeBloom(color, assetPath, cb) {
    if (color in _bloomCache) return cb(_bloomCache[color]);
    const c = COLORS[color];
    // Load sheet + rects JSON in parallel
    const sheet = new Image();
    let rects = null, sheetLoaded = false, rectsLoaded = false;
    const tryDone = () => {
      if (!sheetLoaded || !rectsLoaded) return;
      _bloomCache[color] = rects ? { sheet, rects } : false;
      cb(_bloomCache[color]);
    };
    sheet.onload  = () => { sheetLoaded = true; tryDone(); };
    sheet.onerror = () => { _bloomCache[color] = false; cb(false); };
    sheet.src = assetPath + c.bloom;
    fetch(assetPath + c.rectsFile)
      .then(r => r.ok ? r.json() : null)
      .then(j => { rects = j && j.rects ? j.rects : null; rectsLoaded = true; tryDone(); })
      .catch(() => { rects = null; rectsLoaded = true; tryDone(); });
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
        imgEl.src = oc.toDataURL();
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
  function playBloom(imgEl, color, assetPath, onDone) {
    if (!imgEl || !COLORS[color]) { onDone && onDone(); return; }
    if (!COLORS[color].bloom)     { onDone && onDone(); return; }

    _probeBloom(color, assetPath, (cached) => {
      if (!cached) { onDone && onDone(); return; }
      const { sheet, rects } = cached;
      const nFrames = rects ? rects.length : BLOOM_FRAMES;

      // Measure display size from the first (largest) rect for aspect ratio
      const ref = rects ? rects[rects.length - 1] : null; // last frame = fully open = largest
      const refW = ref ? ref[2] : sheet.naturalWidth  / BLOOM_COLS;
      const refH = ref ? ref[3] : sheet.naturalHeight / BLOOM_ROWS;

      const imgRect = imgEl.getBoundingClientRect();
      const dw = imgRect.width || 80;
      const dh = dw * refH / refW;

      // Canvas: fixed, anchored bottom-center of the flower img
      const imgBottom = window.innerHeight - imgRect.bottom;
      const cvLeft    = imgRect.left + imgRect.width / 2 - dw / 2;
      const cv = document.createElement('canvas');
      cv.width  = Math.round(dw);
      cv.height = Math.round(dh);
      cv.style.cssText = [
        'position:fixed',
        `left:${Math.round(cvLeft)}px`,
        `bottom:${Math.round(imgBottom)}px`,
        `width:${dw}px`,
        `height:${dh}px`,
        'pointer-events:none',
        'z-index:9999',
      ].join(';');
      document.body.appendChild(cv);
      const ctx = cv.getContext('2d');
      imgEl.style.visibility = 'hidden';

      const frameMs = BLOOM_DURATION_MS / nFrames;
      let frame = 0;
      function tick() {
        ctx.clearRect(0, 0, cv.width, cv.height);
        if (rects) {
          // Per-frame custom crop from JSON
          const [sx, sy, sw, sh] = rects[frame];
          ctx.drawImage(sheet, sx, sy, sw, sh, 0, 0, cv.width, cv.height);
        } else {
          // Fallback: uniform grid
          const col = frame % BLOOM_COLS, row = Math.floor(frame / BLOOM_COLS);
          const fw = sheet.naturalWidth / BLOOM_COLS, fh = sheet.naturalHeight / BLOOM_ROWS;
          ctx.drawImage(sheet, col*fw, row*fh, fw, fh, 0, 0, cv.width, cv.height);
        }
        frame++;
        if (frame < nFrames) {
          setTimeout(tick, frameMs);
        } else {
          cv.remove();
          imgEl.style.visibility = '';
          onDone && onDone();
        }
      }
      tick();
    });
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

  // ─── EXPORT ─────────────────────────────────────────
  const api = {
    COLORS,
    BLOOM_COLS, BLOOM_ROWS, BLOOM_FRAMES, BLOOM_DURATION_MS,
    buildPotCell,
    paintActive, paintQueue, paintAll,
    setSelected, playVanish, animateFlight, playBloom, buildQueueBud, upgradeQueueBuds,
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

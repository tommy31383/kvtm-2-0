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
    R: { name: 'Red',      img: 'flower_red.png'      },
    P: { name: 'Pink',     img: 'flower_pink.png'     },
    Y: { name: 'Yellow',   img: 'flower_yellow.png'   },
    V: { name: 'Purple',   img: 'flower_purple.png'   },
    W: { name: 'White',    img: 'flower_white.png'    },
    O: { name: 'Orange',   img: 'flower_orange.png'   },
    B: { name: 'Blue',     img: 'flower_blue.png'     },
    C: { name: 'Camellia', img: 'flower_camellia.png' },
  };

  const POS_LABEL = ['L', 'C', 'R'];

  /**
   * Build a pot DOM cell with:
   *   - pot-back image
   *   - active-flowers visual layer (3 fanned imgs based on pot.active)
   *   - active-row hit zones (3 columns)
   *   - pot-front image
   *   - queue strip
   *
   * @param {Object} opts
   * @param {number} opts.idx
   * @param {{active: (string|null)[], queue: string[]}} opts.pot
   * @param {string} opts.assetPath     e.g. 'assets/sort_blossom/'
   * @param {boolean} opts.showPosLabel
   * @param {boolean} opts.showQueue
   * @param {number} opts.queueMax     max queue cells to render (editor); pass 0 to render only filled
   */
  function buildPotCell({ idx, pot, assetPath, showPosLabel = false, showQueue = true, queueMax = 6, showIndex = false }) {
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

    const queueHTML = showQueue ? renderQueueStrip(pot.queue, queueMax, assetPath) : '';

    cell.innerHTML = `
      ${indexHTML}
      <div class="sb-pot-visual">
        <img class="sb-pot-back" src="${assetPath}pot_empty.png" draggable="false">
        <div class="sb-active-flowers">${flowersHTML}</div>
        <div class="sb-active-row">${slotsHTML}</div>
        <img class="sb-pot-front" src="${assetPath}pot_front.png" draggable="false">
      </div>
      ${queueHTML}
    `;
    return cell;
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

  // ─── EXPORT ─────────────────────────────────────────
  const api = {
    COLORS,
    buildPotCell,
    paintActive, paintQueue, paintAll,
    setSelected, playVanish,
    renderQueueStrip,
    eventToPos,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    global.SortBlossomRender = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);

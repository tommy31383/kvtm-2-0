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
      return `<canvas class="sb-active-flower" data-pos="${p}" data-color="${f}"></canvas>`;
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
    // Double-rAF: first frame attaches cell to DOM, second frame has layout computed
    requestAnimationFrame(() => requestAnimationFrame(() => {
      upgradeActiveFlowers(cell, assetPath);
      upgradeQueueBuds(cell, assetPath);
    }));
    return cell;
  }

  function renderQueuePreview(pot, assetPath) {
    // Return <canvas> placeholders — upgradeQueueBuds draws frame 0 on them.
    // Canvas write (drawImage) works on file:// and localhost; no toDataURL needed.
    return [0,1,2].map(p => {
      if (pot.active[p] !== null) return '';
      const f = pot.queue[p];
      if (!f) return '';
      return `<canvas class="sb-queue-bud" data-pos="${p}" data-color="${f}"></canvas>`;
    }).join('');
  }

  // Embedded bloom rects — no fetch needed, works on file:// and localhost
  const _BLOOM_RECTS = {
    R: [[[44,59,75,114,1,3],[139,58,82,115,0,3],[240,48,88,125,0,-3],[340,53,98,119,0,-4],[470,54,93,119,0,-8],[28,249,92,120,-1,-9],[128,246,100,122,3,-10],[230,246,106,123,3,-10],[340,243,101,125,2,-12],[474,243,103,126,3,-12]],[[44,59,75,114,1,3]],[[139,58,82,115,0,3]]],
    P: [[[44,62,75,107,-1,1],[141,61,77,108,-1,0],[241,57,79,112,-2,-5],[36,248,84,119,2,2],[134,245,92,120,5,0],[234,243,98,126,5,1],[343,49,95,121,0,-9],[471,56,102,114,5,-7],[340,235,112,132,7,-7],[469,238,110,129,9,-4]],[[44,62,75,107,-1,1]],[[469,238,110,129,9,-4]]],
    Y: [[[45,37,74,127,-1,-3],[140,56,78,107,1,5],[241,51,77,112,-1,-1],[29,241,91,130,1,2],[125,242,95,130,0,3],[232,240,96,132,5,4],[336,239,104,133,4,4],[461,234,113,138,2,1],[339,51,96,113,3,-3],[466,50,100,114,2,-5]],[[45,37,74,127,-1,-3]],[[466,50,100,114,2,-5]]],
    V: [[[45,55,68,119,-4,4],[138,55,82,118,2,0],[241,49,74,125,-2,-4],[42,238,70,128,1,5],[138,237,75,129,2,4],[226,239,96,129,0,6],[338,237,86,129,6,4],[474,237,87,129,4,4],[339,50,88,124,6,-6],[469,53,88,122,3,-5]],[[45,55,68,119,-4,4]],[[469,53,88,122,3,-5]]],
    W: [[[42,62,77,104,-1,8],[130,61,86,105,0,8],[236,54,82,111,1,3],[132,224,86,135,3,-1],[25,241,93,116,-1,8],[232,238,92,119,3,3],[462,215,101,142,0,-11],[334,238,92,120,3,2],[337,52,101,114,5,-2],[456,54,114,112,-3,-4]],[[42,62,77,104,-1,8]],[[456,54,114,112,-3,-4]]],
    O: [[[43,57,77,110,-2,7],[131,55,93,112,1,4],[240,51,82,122,3,5],[30,239,89,121,-1,4],[130,239,96,121,4,3],[234,238,88,122,3,1],[332,238,96,122,4,3],[466,236,100,124,0,-1],[334,51,101,116,5,-3],[468,52,104,116,2,-3]],[[43,57,77,110,-2,7]],[[468,52,104,116,2,-3]]],
    B: [[[42,63,77,103,-2,5],[132,58,84,107,0,3],[230,48,90,118,-1,-2],[30,243,85,114,-2,3],[126,240,96,117,1,1],[228,239,98,120,5,0],[332,238,96,120,4,-3],[458,239,111,118,0,-6],[332,52,106,115,4,-6],[462,52,110,115,2,-9]],[[42,63,77,103,-2,5]],[[462,52,110,115,2,-9]]],
    C: [[[40,58,77,110,-4,5],[134,56,84,112,2,1],[29,240,90,122,1,10],[237,47,82,123,2,-6],[123,235,92,125,1,2],[225,231,98,129,4,0],[459,35,120,142,2,-13],[331,45,110,127,5,-9],[331,235,98,121,5,-2],[460,238,107,118,1,-4]],[[40,58,77,110,-4,5]],[[460,238,107,118,1,-4]]],
  };

  // Per-frame durations (ms) — null = use 90ms default | number = uniform ms per frame
  const _BLOOM_DURS = {
    R: [null,null,null],
    P: [87,87,87],
    Y: [null,null,null],
    V: [null,null,null],
    W: [474,474,474],
    O: [237,237,237],
    B: [474,474,474],
    C: [null,null,null],
  };

  // ──────────────────────────────────────────────────────────────
  // _BLOOM_DATA — atlas+module+anim format (Phase 1, 2026-05-15).
  // Pattern: Module (named rect on sheet) → Frame (module ref + dur) → Anim.
  // When _BLOOM_DATA[color] is populated, it takes precedence over _BLOOM_RECTS.
  // Empty default → engine uses legacy _BLOOM_RECTS path (no behavioural diff).
  //
  // Schema:
  //   _BLOOM_DATA[color] = {
  //     modules: {
  //       <moduleId>: { x, y, w, h },     // rect on the per-color bloom sheet
  //       ...
  //     },
  //     anims: {
  //       bloom:  [ {m: <moduleId>, d: <ms>}, ... ],  // ≥10 frames recommended
  //       bud:    [ {m: <moduleId>, d: <ms>}, ... ],  // ≥1 frame
  //       flower: [ {m: <moduleId>, d: <ms>}, ... ],  // ≥1 frame
  //     }
  //   }
  //
  // Tool authoring flow: define modules once on sheet → each anim is a
  // sequence of {moduleId, duration}. Changing a module's rect updates every
  // anim that references it.
  // ──────────────────────────────────────────────────────────────
  const _BLOOM_DATA = {
    // Populated per-color by the tool. Empty = legacy _BLOOM_RECTS fallback.
    R: {"modules":{"bloom_0_0":{"x":44,"y":59,"w":75,"h":114,"dx":1,"dy":3},"bloom_1_1":{"x":139,"y":58,"w":82,"h":115,"dy":3},"bloom_2_2":{"x":240,"y":48,"w":88,"h":125,"dy":-3},"bloom_3_3":{"x":340,"y":53,"w":98,"h":119,"dy":-4},"bloom_12":{"x":470,"y":54,"w":93,"h":119,"dy":-8},"bloom_13":{"x":28,"y":249,"w":92,"h":120,"dx":-1,"dy":-9},"bloom_14":{"x":128,"y":246,"w":100,"h":122,"dx":3,"dy":-10},"bloom_15":{"x":230,"y":246,"w":106,"h":123,"dx":3,"dy":-10},"bloom_8_8":{"x":340,"y":243,"w":101,"h":125,"dx":2,"dy":-12},"bloom_16":{"x":474,"y":243,"w":103,"h":126,"dx":3,"dy":-12}},"anims":{"bloom":[{"m":"bloom_0_0","d":90},{"m":"bloom_1_1","d":90},{"m":"bloom_2_2","d":90},{"m":"bloom_3_3","d":90},{"m":"bloom_12","d":90},{"m":"bloom_13","d":90},{"m":"bloom_14","d":90},{"m":"bloom_15","d":90},{"m":"bloom_8_8","d":90},{"m":"bloom_16","d":90}],"bud":[{"m":"bloom_0_0","d":90}],"flower":[{"m":"bloom_1_1","d":90}]}},
    C: {"modules":{"bloom_70":{"x":40,"y":58,"w":77,"h":110,"dx":-4,"dy":5},"bloom_71":{"x":134,"y":56,"w":84,"h":112,"dx":2,"dy":1},"bloom_72":{"x":29,"y":240,"w":90,"h":122,"dx":1,"dy":10},"bloom_73":{"x":237,"y":47,"w":82,"h":123,"dx":2,"dy":-6},"bloom_74":{"x":123,"y":235,"w":92,"h":125,"dx":1,"dy":2},"bloom_75":{"x":225,"y":231,"w":98,"h":129,"dx":4},"bloom_76":{"x":459,"y":35,"w":120,"h":142,"dx":2,"dy":-13},"bloom_77":{"x":331,"y":45,"w":110,"h":127,"dx":5,"dy":-9},"bloom_78":{"x":331,"y":235,"w":98,"h":121,"dx":5,"dy":-2},"bloom_79":{"x":460,"y":238,"w":107,"h":118,"dx":1,"dy":-4}},"anims":{"bloom":[{"m":"bloom_70","d":90},{"m":"bloom_71","d":90},{"m":"bloom_72","d":90},{"m":"bloom_73","d":90},{"m":"bloom_74","d":90},{"m":"bloom_75","d":90},{"m":"bloom_76","d":90},{"m":"bloom_77","d":90},{"m":"bloom_78","d":90},{"m":"bloom_79","d":90}],"bud":[{"m":"bloom_70","d":90}],"flower":[{"m":"bloom_79","d":90}]}},
    P: {"modules":{"bloom_10":{"x":44,"y":62,"w":75,"h":107,"dx":-1,"dy":1},"bloom_11":{"x":141,"y":61,"w":77,"h":108,"dx":-1},"bloom_12":{"x":241,"y":57,"w":79,"h":112,"dx":-2,"dy":-5},"bloom_13":{"x":36,"y":248,"w":84,"h":119,"dx":2,"dy":2},"bloom_14":{"x":134,"y":245,"w":92,"h":120,"dx":5},"bloom_15":{"x":234,"y":243,"w":98,"h":126,"dx":5,"dy":1},"bloom_16":{"x":343,"y":49,"w":95,"h":121,"dy":-9},"bloom_17":{"x":471,"y":56,"w":102,"h":114,"dx":5,"dy":-7},"bloom_18":{"x":340,"y":235,"w":112,"h":132,"dx":7,"dy":-7},"bloom_19":{"x":469,"y":238,"w":110,"h":129,"dx":9,"dy":-4}},"anims":{"bloom":[{"m":"bloom_10","d":87},{"m":"bloom_11","d":87},{"m":"bloom_12","d":87},{"m":"bloom_13","d":87},{"m":"bloom_14","d":87},{"m":"bloom_15","d":87},{"m":"bloom_16","d":87},{"m":"bloom_17","d":87},{"m":"bloom_18","d":87},{"m":"bloom_19","d":87}],"bud":[{"m":"bloom_10","d":87}],"flower":[{"m":"bloom_19","d":87}]}},
    V: {"modules":{"bloom_30":{"x":45,"y":55,"w":68,"h":119,"dx":-4,"dy":4},"bloom_31":{"x":138,"y":55,"w":82,"h":118,"dx":2},"bloom_32":{"x":241,"y":49,"w":74,"h":125,"dx":-2,"dy":-4},"bloom_33":{"x":42,"y":238,"w":70,"h":128,"dx":1,"dy":5},"bloom_34":{"x":138,"y":237,"w":75,"h":129,"dx":2,"dy":4},"bloom_35":{"x":226,"y":239,"w":96,"h":129,"dy":6},"bloom_36":{"x":338,"y":237,"w":86,"h":129,"dx":6,"dy":4},"bloom_37":{"x":474,"y":237,"w":87,"h":129,"dx":4,"dy":4},"bloom_38":{"x":339,"y":50,"w":88,"h":124,"dx":6,"dy":-6},"bloom_39":{"x":469,"y":53,"w":88,"h":122,"dx":3,"dy":-5}},"anims":{"bloom":[{"m":"bloom_30","d":90},{"m":"bloom_31","d":90},{"m":"bloom_32","d":90},{"m":"bloom_33","d":90},{"m":"bloom_34","d":90},{"m":"bloom_35","d":90},{"m":"bloom_36","d":90},{"m":"bloom_37","d":90},{"m":"bloom_38","d":90},{"m":"bloom_39","d":90}],"bud":[{"m":"bloom_30","d":90}],"flower":[{"m":"bloom_39","d":90}]}},
    W: {"modules":{"bloom_40":{"x":42,"y":62,"w":77,"h":104,"dx":-1,"dy":8},"bloom_41":{"x":130,"y":61,"w":86,"h":105,"dy":8},"bloom_42":{"x":236,"y":54,"w":82,"h":111,"dx":1,"dy":3},"bloom_43":{"x":132,"y":224,"w":86,"h":135,"dx":3,"dy":-1},"bloom_44":{"x":25,"y":241,"w":93,"h":116,"dx":-1,"dy":8},"bloom_45":{"x":232,"y":238,"w":92,"h":119,"dx":3,"dy":3},"bloom_46":{"x":462,"y":215,"w":101,"h":142,"dy":-11},"bloom_47":{"x":334,"y":238,"w":92,"h":120,"dx":3,"dy":2},"bloom_48":{"x":337,"y":52,"w":101,"h":114,"dx":5,"dy":-2},"bloom_49":{"x":456,"y":54,"w":114,"h":112,"dx":-3,"dy":-4}},"anims":{"bloom":[{"m":"bloom_40","d":474},{"m":"bloom_41","d":474},{"m":"bloom_42","d":474},{"m":"bloom_43","d":474},{"m":"bloom_44","d":474},{"m":"bloom_45","d":474},{"m":"bloom_46","d":474},{"m":"bloom_47","d":474},{"m":"bloom_48","d":474},{"m":"bloom_49","d":474}],"bud":[{"m":"bloom_40","d":474}],"flower":[{"m":"bloom_49","d":474}]}},
    O: {"modules":{"bloom_50":{"x":43,"y":57,"w":77,"h":110,"dx":-2,"dy":7},"bloom_51":{"x":131,"y":55,"w":93,"h":112,"dx":1,"dy":4},"bloom_52":{"x":240,"y":51,"w":82,"h":122,"dx":3,"dy":5},"bloom_53":{"x":30,"y":239,"w":89,"h":121,"dx":-1,"dy":4},"bloom_54":{"x":130,"y":239,"w":96,"h":121,"dx":4,"dy":3},"bloom_55":{"x":234,"y":238,"w":88,"h":122,"dx":3,"dy":1},"bloom_56":{"x":332,"y":238,"w":96,"h":122,"dx":4,"dy":3},"bloom_57":{"x":466,"y":236,"w":100,"h":124,"dy":-1},"bloom_58":{"x":334,"y":51,"w":101,"h":116,"dx":5,"dy":-3},"bloom_59":{"x":468,"y":52,"w":104,"h":116,"dx":2,"dy":-3}},"anims":{"bloom":[{"m":"bloom_50","d":237},{"m":"bloom_51","d":237},{"m":"bloom_52","d":237},{"m":"bloom_53","d":237},{"m":"bloom_54","d":237},{"m":"bloom_55","d":237},{"m":"bloom_56","d":237},{"m":"bloom_57","d":237},{"m":"bloom_58","d":237},{"m":"bloom_59","d":237}],"bud":[{"m":"bloom_50","d":237}],"flower":[{"m":"bloom_59","d":237}]}},
    B: {"modules":{"bloom_60":{"x":42,"y":63,"w":77,"h":103,"dx":-2,"dy":5},"bloom_61":{"x":132,"y":58,"w":84,"h":107,"dy":3},"bloom_62":{"x":230,"y":48,"w":90,"h":118,"dx":-1,"dy":-2},"bloom_63":{"x":30,"y":243,"w":85,"h":114,"dx":-2,"dy":3},"bloom_64":{"x":126,"y":240,"w":96,"h":117,"dx":1,"dy":1},"bloom_65":{"x":228,"y":239,"w":98,"h":120,"dx":5},"bloom_66":{"x":332,"y":238,"w":96,"h":120,"dx":4,"dy":-3},"bloom_67":{"x":458,"y":239,"w":111,"h":118,"dy":-6},"bloom_68":{"x":332,"y":52,"w":106,"h":115,"dx":4,"dy":-6},"bloom_69":{"x":462,"y":52,"w":110,"h":115,"dx":2,"dy":-9}},"anims":{"bloom":[{"m":"bloom_60","d":474},{"m":"bloom_61","d":474},{"m":"bloom_62","d":474},{"m":"bloom_63","d":474},{"m":"bloom_64","d":474},{"m":"bloom_65","d":474},{"m":"bloom_66","d":474},{"m":"bloom_67","d":474},{"m":"bloom_68","d":474},{"m":"bloom_69","d":474}],"bud":[{"m":"bloom_60","d":474}],"flower":[{"m":"bloom_69","d":474}]}},
    Y: {"modules":{"bloom_80":{"x":45,"y":37,"w":74,"h":127,"dx":-1,"dy":-3},"bloom_81":{"x":140,"y":56,"w":78,"h":107,"dx":1,"dy":5},"bloom_82":{"x":241,"y":51,"w":77,"h":112,"dx":-1,"dy":-1},"bloom_83":{"x":29,"y":241,"w":91,"h":130,"dx":1,"dy":2},"bloom_84":{"x":125,"y":242,"w":95,"h":130,"dy":3},"bloom_85":{"x":232,"y":240,"w":96,"h":132,"dx":5,"dy":4},"bloom_86":{"x":336,"y":239,"w":104,"h":133,"dx":4,"dy":4},"bloom_87":{"x":461,"y":234,"w":113,"h":138,"dx":2,"dy":1},"bloom_88":{"x":339,"y":51,"w":96,"h":113,"dx":3,"dy":-3},"bloom_89":{"x":466,"y":50,"w":100,"h":114,"dx":2,"dy":-5}},"anims":{"bloom":[{"m":"bloom_80","d":90},{"m":"bloom_81","d":90},{"m":"bloom_82","d":90},{"m":"bloom_83","d":90},{"m":"bloom_84","d":90},{"m":"bloom_85","d":90},{"m":"bloom_86","d":90},{"m":"bloom_87","d":90},{"m":"bloom_88","d":90},{"m":"bloom_89","d":90}],"bud":[{"m":"bloom_80","d":90}],"flower":[{"m":"bloom_89","d":90}]}},
  };

  // ──────────────────────────────────────────────────────────────
  // Multi-variant bloom support (added 2026-05-15)
  // Format:
  //   OLD (single variant): _BLOOM_RECTS[c] = [[r0],[r1],...,[r9]]
  //                         _BLOOM_DURS[c]  = null | number | [d0..d9]
  //   NEW (multi-variant):  _BLOOM_RECTS[c] = [ [[r0..r9]], [[r0..r9]], ... ]
  //                         _BLOOM_DURS[c]  = [v0_dur, v1_dur, ...]
  //                         where each v_dur is null | number | [d0..d9]
  //
  // Detection: NEW iff rectsEntry[0][0] is itself an array.
  // Migration is automatic + lossless — old data files keep working.
  // ──────────────────────────────────────────────────────────────
  function _isNewVariantFormat(rectsEntry) {
    return Array.isArray(rectsEntry)
        && rectsEntry.length > 0
        && Array.isArray(rectsEntry[0])
        && Array.isArray(rectsEntry[0][0]);
  }
  function _resolveVariants(rectsEntry, dursEntry) {
    // Returns array of { rects, durations } — at least 1 element.
    if (!rectsEntry || !rectsEntry.length) return [];
    if (_isNewVariantFormat(rectsEntry)) {
      const dursArr = Array.isArray(dursEntry) ? dursEntry : [];
      return rectsEntry.map((vRects, i) => ({
        rects: vRects,
        durations: i < dursArr.length ? dursArr[i] : null,
      }));
    }
    // Old format → single variant
    return [{ rects: rectsEntry, durations: dursEntry == null ? null : dursEntry }];
  }

  // Normalize raw _BLOOM_DURS entry into a single canonical form the render
  // code can rely on. Historical formats: null | number | array | invalid.
  // Output:
  //   { kind: 'default' }                        — every frame 90ms
  //   { kind: 'uniform', ms: number }            — every frame N ms
  //   { kind: 'perFrame', ms: number[] }         — per-frame array
  function migrateBloomDurs(raw, frameCount) {
    if (raw == null) return { kind: 'default' };
    if (typeof raw === 'number' && raw > 0) return { kind: 'uniform', ms: Math.round(raw) };
    if (Array.isArray(raw) && raw.length) {
      const clean = raw.map(d => (typeof d === 'number' && d > 0) ? Math.round(d) : 90);
      const allSame = clean.every(d => d === clean[0]);
      if (allSame) return clean[0] === 90 ? { kind: 'default' } : { kind: 'uniform', ms: clean[0] };
      // Pad/truncate to expected frame count if provided
      if (typeof frameCount === 'number') {
        while (clean.length < frameCount) clean.push(90);
        if (clean.length > frameCount) clean.length = frameCount;
      }
      return { kind: 'perFrame', ms: clean };
    }
    console.warn('[bloom] unrecognized _BLOOM_DURS entry, falling back to default:', raw);
    return { kind: 'default' };
  }

  // ──────────────────────────────────────────────────────────────
  // Convert _BLOOM_DATA (modules + anims) → variants array shape used by
  // downstream consumers. Resolution: each anim frame.m → modules[m] rect.
  // Anim role → variant index: bloom→0, bud→1, flower→2.
  // Unknown anim names get appended at index ≥3 (reserved future slots).
  // ──────────────────────────────────────────────────────────────
  const _ANIM_ROLE_INDEX = { bloom: 0, bud: 1, flower: 2 };
  function _bloomDataToVariants(data) {
    if (!data || !data.modules || !data.anims) return null;
    const animNames = Object.keys(data.anims);
    if (!animNames.length) return null;
    const variants = [];
    // First pass — fill role indices 0..2
    for (const [roleName, idx] of Object.entries(_ANIM_ROLE_INDEX)) {
      const anim = data.anims[roleName];
      variants[idx] = _animToVariant(anim, data.modules);
    }
    // Second pass — append unknown anim names at reserved slots
    for (const name of animNames) {
      if (name in _ANIM_ROLE_INDEX) continue;
      variants.push(_animToVariant(data.anims[name], data.modules));
    }
    // Trim trailing empties, but never below 1 slot
    while (variants.length > 1) {
      const tail = variants[variants.length - 1];
      if (tail && tail.rects && tail.rects.length) break;
      variants.pop();
    }
    return variants;
  }
  function _animToVariant(anim, modules) {
    if (!Array.isArray(anim) || !anim.length) return { rects: [], durations: null };
    const rects = [];
    const durs = [];
    for (const frame of anim) {
      const mod = modules[frame.m];
      if (!mod) continue;  // skip unknown module ref — never breaks build
      const dx = mod.dx || 0, dy = mod.dy || 0;
      // Phase 3: optional pivot (px, py) — module-local coords inside its rect.
      // When module has explicit pivot, append at indices 6,7. Consumers fall
      // back to (w/2, h) bottom-center when missing → matches legacy behavior.
      if (typeof mod.px === 'number' && typeof mod.py === 'number') {
        rects.push([mod.x, mod.y, mod.w, mod.h, dx, dy, mod.px, mod.py]);
      } else {
        rects.push([mod.x, mod.y, mod.w, mod.h, dx, dy]);
      }
      durs.push(typeof frame.d === 'number' ? frame.d : 90);
    }
    // Compact durs: all 90 → null, all same → scalar, else per-frame array
    let durations = null;
    if (durs.length) {
      const allSame = durs.every(d => d === durs[0]);
      if (allSame) durations = durs[0] === 90 ? null : durs[0];
      else durations = durs;
    }
    return { rects, durations };
  }

  // Cache: sheet Image per color + resolved variants array.
  // Shape:
  //   color → false (sheet missing)
  //   color → { sheet, variants: [{rects, durations}, ...], rects, durations }
  //   where `rects` / `durations` are aliases of variants[0] for back-compat
  //   with consumers that only need a single variant (queue bud, static frame).
  const _bloomCache = {};
  function _probeBloom(color, assetPath, cb) {
    if (color in _bloomCache) return cb(_bloomCache[color]);
    const c = COLORS[color];
    const sheet = new Image();
    sheet.onload  = () => {
      // Preferred path — new module/anim format (_BLOOM_DATA[color]).
      // Falls back to legacy _BLOOM_RECTS + _BLOOM_DURS when data missing.
      const data = _BLOOM_DATA && _BLOOM_DATA[color];
      let variantsRaw = _bloomDataToVariants(data);
      if (!variantsRaw || !variantsRaw.length) {
        // Legacy path
        const rawRects = _BLOOM_RECTS[color] || null;
        const rawDurs  = _BLOOM_DURS && _BLOOM_DURS[color];
        variantsRaw = _resolveVariants(rawRects, rawDurs);
      }
      // Normalize each variant's durations through migrateBloomDurs
      const variants = variantsRaw.map(v => {
        const dur = migrateBloomDurs(v.durations, v.rects ? v.rects.length : undefined);
        let durations = null;
        if (dur.kind === 'uniform') durations = dur.ms;
        else if (dur.kind === 'perFrame') durations = dur.ms;
        return { rects: v.rects, durations };
      });
      const v0 = variants[0] || { rects: null, durations: null };
      _bloomCache[color] = {
        sheet,
        variants,
        // Aliases for back-compat — point to variant 0
        rects: v0.rects,
        durations: v0.durations,
      };
      cb(_bloomCache[color]);
    };
    sheet.onerror = () => { _bloomCache[color] = false; cb(false); };
    sheet.src = assetPath + c.bloom;
  }

  // ──────────────────────────────────────────────────────────────
  // Variant role convention (per-color animation slots):
  //   variants[0] = Bloom  — transition anim played by _bloomSheet
  //   variants[1] = Nụ     — idle bud state for queue preview / dormant slot
  //   variants[2] = Bông   — idle bloomed state for active slot
  //   variants[3+]         — reserved (e.g. seasonal variants); engine ignores
  // Fallback when role variant is missing:
  //   Nụ missing  → use frame 0 of Bloom (legacy data: 1 variant only)
  //   Bông missing → use last frame of Bloom (legacy data: 1 variant only)
  // ──────────────────────────────────────────────────────────────
  const VARIANT_ROLE = { BLOOM: 0, BUD: 1, FLOWER: 2 };

  // Phase 3 pivot helper — return pivot {px, py} in sheet-pixel coords.
  // Default = bottom-center of rect (matches legacy bottom-align behavior).
  // Explicit pivot lives at rect[6], rect[7] (numeric, in module-local coords).
  function _getRectPivot(rect) {
    const sw = rect[2], sh = rect[3];
    const px = (typeof rect[6] === 'number') ? rect[6] : sw / 2;
    const py = (typeof rect[7] === 'number') ? rect[7] : sh;
    return { px, py };
  }
  // Returns { rects, durations, isFallback } for the requested role.
  // Never returns null — falls back to Bloom variant if role variant missing.
  function _pickByRole(cached, role) {
    if (!cached || !cached.variants || !cached.variants.length) return null;
    const v = cached.variants[role];
    if (v && v.rects && v.rects.length) return { ...v, isFallback: false };
    // Fallback to Bloom variant — synth a 1-frame "anim" using the appropriate
    // sprite-sheet frame (frame 0 for bud, last frame for flower).
    const bloom = cached.variants[VARIANT_ROLE.BLOOM];
    if (!bloom || !bloom.rects || !bloom.rects.length) return null;
    if (role === VARIANT_ROLE.BUD) {
      return { rects: [bloom.rects[0]], durations: null, isFallback: true };
    }
    if (role === VARIANT_ROLE.FLOWER) {
      return { rects: [bloom.rects[bloom.rects.length - 1]], durations: null, isFallback: true };
    }
    return { ...bloom, isFallback: false };
  }

  // ──────────────────────────────────────────────────────────────
  // Shared-rAF anim scheduler (replaces per-cell setTimeout chains).
  //
  // Architecture (mirrors Phaser/PIXI/Spine pattern):
  //   1. Single rAF callback drives ALL idle anims via a Set registry
  //   2. Each instance tracks (frameStart timestamp, currentFrame, lastDrawn)
  //   3. tick() computes elapsed from absolute clock — no drift accumulation
  //   4. Catch-up while-loop advances multiple frames if browser lagged
  //   5. lastDrawn skip → no redraw when frame hasn't changed
  //   6. Auto-unregister on cv.isConnected===false
  //
  // Benefits vs per-cell setTimeout:
  //   - VSync-aligned (smooth, no tearing)
  //   - Browser auto-pauses on tab hidden (saves battery)
  //   - 1 rAF for N cells (not N timers)
  //   - Global pause/speed via window._setIdleSpeed / _pauseIdleAnims
  // ──────────────────────────────────────────────────────────────
  const _idleRegistry = new Set();
  let _idleRafId = null;
  let _idleSpeed = 1;   // multiplier: 1.0 = normal, 0.5 = 2× faster, 2.0 = 2× slower
  let _idlePaused = false;

  function _idleTickAll(now) {
    if (!_idlePaused) {
      _idleRegistry.forEach(inst => inst._tick(now));
    }
    _idleRafId = _idleRegistry.size ? requestAnimationFrame(_idleTickAll) : null;
  }

  class _IdleAnim {
    constructor(cv, variant, drawFn) {
      this.cv = cv;
      this.variant = variant;
      this.drawFn = drawFn;
      this.frameIdx = 0;
      this.frameStart = performance.now();
      this.lastDrawn = -1;
      // Cancel any prior anim on this cv before registering a new one
      if (cv._idleAnim) cv._idleAnim._dispose();
      cv._idleAnim = this;
      _idleRegistry.add(this);
      if (!_idleRafId) _idleRafId = requestAnimationFrame(_idleTickAll);
      // Draw frame 0 immediately so the first paint isn't blank for one rAF
      this.drawFn(variant.rects[0]);
      this.lastDrawn = 0;
    }
    _dispose() {
      _idleRegistry.delete(this);
      if (this.cv && this.cv._idleAnim === this) this.cv._idleAnim = null;
    }
    _durFor(i) {
      const d = this.variant.durations;
      let ms;
      if (Array.isArray(d)) ms = d[i] || 90;
      else if (typeof d === 'number' && d > 0) ms = d;
      else ms = 200;
      return ms * _idleSpeed;
    }
    _tick(now) {
      if (!this.cv.isConnected) { this._dispose(); return; }
      const rects = this.variant.rects;
      // Single-frame variant: nothing to animate. Already drawn in ctor.
      // Stays registered until cv disconnects so re-runs are idempotent.
      if (rects.length < 2) { this._dispose(); return; }
      // Catch-up while-loop — handles browser lag without falling behind.
      // Cap iterations so a paused tab returning doesn't churn 10000× frames.
      let dur = this._durFor(this.frameIdx);
      let safety = 64;
      while (now - this.frameStart >= dur && safety-- > 0) {
        this.frameStart += dur;
        this.frameIdx = (this.frameIdx + 1) % rects.length;
        dur = this._durFor(this.frameIdx);
      }
      // Skip redraw if frame index unchanged (idle anim often stays same
      // between rAFs when frame duration > 16ms). Saves drawImage calls.
      if (this.frameIdx !== this.lastDrawn) {
        this.drawFn(rects[this.frameIdx]);
        this.lastDrawn = this.frameIdx;
      }
    }
  }

  function _startIdleLoop(cv, variant, drawFrameFn) {
    const rects = variant && variant.rects;
    if (!rects || !rects.length) return;
    new _IdleAnim(cv, variant, drawFrameFn);
  }

  // Dev hooks — usable from DevTools console
  if (typeof window !== 'undefined') {
    window._setIdleSpeed = (x) => { _idleSpeed = Math.max(0.1, Math.min(10, parseFloat(x) || 1)); };
    window._pauseIdleAnims = () => { _idlePaused = true; };
    window._resumeIdleAnims = () => { _idlePaused = false; };
    window._idleAnimCount = () => _idleRegistry.size;
  }

  // Dev helper — clear cached sheet+variants for hot-reload of _BLOOM_DATA.
  // Call window._sbClearBloomCache() to wipe all, or pass a color to wipe one.
  if (typeof window !== 'undefined') {
    window._sbClearBloomCache = (color) => {
      if (color) delete _bloomCache[color];
      else for (const k in _bloomCache) delete _bloomCache[k];
    };
  }
  /**
   * Draw frame 0 of bloom sheet onto each .sb-queue-bud canvas in cell.
   * Uses drawImage (write-only) — works on file:// and localhost.
   * Falls back gracefully if sheet not loaded yet (retries via _probeBloom cache).
   */
  function upgradeQueueBuds(cell, assetPath) {
    cell.querySelectorAll('canvas.sb-queue-bud').forEach(cv => {
      const color = cv.dataset.color;
      if (!color || !COLORS[color]) return;

      // Read CSS display width same way as upgradeActiveFlowers
      function _getBudWidth() {
        if (cv.offsetWidth > 0) return cv.offsetWidth;
        const compact = cv.closest('.sb-compact') || document.body;
        const pos = cv.dataset.pos;
        const varName = pos === '1' ? '--sb-flower-w-mid' : '--sb-flower-w-side';
        const raw = getComputedStyle(compact).getPropertyValue(varName).trim();
        const px = parseFloat(raw);
        return px > 0 ? px : 76;
      }

      function drawStatic(w, h) {
        const fb = new Image();
        fb.onload = () => { cv.getContext('2d').drawImage(fb, 0, 0, w, h); };
        fb.src = assetPath + COLORS[color].img;
      }

      _probeBloom(color, assetPath, (cached) => {
        const w = _getBudWidth();
        if (!cached || !cached.variants || !cached.variants.length) {
          cv.width = w; cv.height = w; drawStatic(w, w); return;
        }
        const sheet = cached.sheet;
        // Anim Nụ = variants[1] if present, else fallback to frame 0 of Bloom.
        const budVariant = _pickByRole(cached, VARIANT_ROLE.BUD);
        if (!budVariant || !budVariant.rects || !budVariant.rects.length) {
          cv.width = w; cv.height = w; drawStatic(w, w); return;
        }
        // Phase 3 pivot-aware sizing: canvas height = max "above-pivot" extent
        // across Bloom + Bud frames. Canvas bottom = pivot Y (stem-base anchor).
        // All frames drawn so their module pivot lands at canvas bottom.
        const bloomV = cached.variants[VARIANT_ROLE.BLOOM];
        const refRect = (bloomV && bloomV.rects && bloomV.rects.length)
          ? bloomV.rects[bloomV.rects.length - 1]
          : budVariant.rects[0];
        const refPivot = _getRectPivot(refRect);
        const refScale = w / refRect[2];
        const refAboveExt = refPivot.py * refScale;   // pixels above pivot

        const bud0 = budVariant.rects[0];
        const budPivot = _getRectPivot(bud0);
        const budScale = w / bud0[2];
        const budAboveExt = budPivot.py * budScale;

        const h = Math.max(refAboveExt, budAboveExt);
        cv.width = w; cv.height = Math.round(h);
        const ctx = cv.getContext('2d');
        _startIdleLoop(cv, budVariant, (rect) => {
          if (!sheet) return;
          const [sx, sy, sw, sh] = rect;
          const dh = Math.round(w * sh / sw);
          const { py: pySheet } = _getRectPivot(rect);
          const pivotDrawY = pySheet * (dh / sh);
          // Frame's pivot lands at canvas bottom → yOff = h - pivotDrawY.
          // Below-pivot pixels (if any) extend past canvas bottom → clipped.
          const yOffF = Math.round(h - pivotDrawY);
          ctx.clearRect(0, 0, w, h);
          try { ctx.drawImage(sheet, sx, sy, sw, sh, 0, yOffF, w, dh); }
          catch (e) { drawStatic(w, h); }
        });
      });
    });
  }

  /**
   * Draw frame 9 (fully bloomed) from bloom sheet onto each .sb-active-flower canvas in cell.
   * Falls back to static flower img if sheet unavailable.
   */
  function upgradeActiveFlowers(cell, assetPath) {
    cell.querySelectorAll('canvas.sb-active-flower').forEach(cv => {
      const color = cv.dataset.color;
      if (!color || !COLORS[color]) return;
      const isBud = cv.dataset.bud === '1';  // promoted slot waiting for bloom anim

      function _getWidth() {
        // 1st: actual layout width (reliable after 2nd rAF)
        if (cv.offsetWidth > 0) return cv.offsetWidth;
        // 2nd: read CSS var from nearest .sb-compact ancestor
        const compact = cv.closest('.sb-compact') || document.body;
        const pos = cv.dataset.pos;
        const varName = pos === '1' ? '--sb-flower-w-mid' : '--sb-flower-w-side';
        const raw = getComputedStyle(compact).getPropertyValue(varName).trim();
        const px = parseFloat(raw);
        if (px > 0) return px;
        return 76; // hard fallback
      }

      function drawStaticFallback() {
        const fb = new Image();
        fb.onload = () => {
          const w = _getWidth();
          cv.width  = w;
          cv.height = Math.round(w * fb.naturalHeight / (fb.naturalWidth || 1));
          cv.getContext('2d').drawImage(fb, 0, 0, cv.width, cv.height);
        };
        fb.src = assetPath + COLORS[color].img;
      }

      _probeBloom(color, assetPath, (cached) => {
        if (!cached || !cached.variants || !cached.variants.length) {
          drawStaticFallback(); return;
        }
        const sheet = cached.sheet;
        const w = _getWidth();

        // Phase 3 pivot-aware: canvas size = max above-pivot extent across
        // Bloom + (Bud or Flower). All frames drawn with pivot at canvas bottom.
        const bloomV = cached.variants[VARIANT_ROLE.BLOOM];
        const refRect = (bloomV && bloomV.rects && bloomV.rects.length)
          ? bloomV.rects[bloomV.rects.length - 1]
          : null;
        const refAboveExt = refRect
          ? _getRectPivot(refRect).py * (w / refRect[2])
          : 0;

        if (isBud) {
          const budVariant = _pickByRole(cached, VARIANT_ROLE.BUD);
          if (!budVariant || !budVariant.rects.length) { drawStaticFallback(); return; }
          const bud0 = budVariant.rects[0];
          const budAboveExt = _getRectPivot(bud0).py * (w / bud0[2]);
          const h = Math.max(refAboveExt, budAboveExt);
          cv.width = w; cv.height = Math.round(h);
          const ctx = cv.getContext('2d');
          _startIdleLoop(cv, budVariant, (rect) => {
            const [sx, sy, sw, sh] = rect;
            const dh = Math.round(w * sh / sw);
            const { py: pySheet } = _getRectPivot(rect);
            const pivotDrawY = pySheet * (dh / sh);
            const yOffF = Math.round(h - pivotDrawY);
            ctx.clearRect(0, 0, w, h);
            try { ctx.drawImage(sheet, sx, sy, sw, sh, 0, yOffF, w, dh); }
            catch(e) { drawStaticFallback(); }
          });
        } else {
          const flowerVariant = _pickByRole(cached, VARIANT_ROLE.FLOWER);
          if (!flowerVariant || !flowerVariant.rects.length) { drawStaticFallback(); return; }
          const fl0 = flowerVariant.rects[0];
          const flowerAboveExt = _getRectPivot(fl0).py * (w / fl0[2]);
          const h = Math.max(refAboveExt, flowerAboveExt);
          cv.width = w; cv.height = Math.round(h);
          const ctx = cv.getContext('2d');
          _startIdleLoop(cv, flowerVariant, (rect) => {
            const [sx, sy, sw, sh] = rect;
            const dh = Math.round(w * sh / sw);
            const { py: pySheet } = _getRectPivot(rect);
            const pivotDrawY = pySheet * (dh / sh);
            const yOffF = Math.round(h - pivotDrawY);
            ctx.clearRect(0, 0, w, h);
            try { ctx.drawImage(sheet, sx, sy, sw, sh, 0, yOffF, w, dh); }
            catch(e) { drawStaticFallback(); }
          });
        }
      });
    });
  }

  /**
   * Play bloom sprite sheet animation on an active-flower img.
   * Draws frames 0→9 from the bloom sheet using a canvas overlay.
   * Works on file:// and localhost (only writes to canvas, never reads back).
   * Falls back to _bloomA if sheet unavailable.
   */
  function _bloomSheet(imgEl, color, assetPath, onDone) {
    if (!imgEl || !imgEl.isConnected) { onDone && onDone(); return; }
    _probeBloom(color, assetPath, (cached) => {
      if (!cached || !cached.variants || !cached.variants.length) {
        _bloomA(imgEl, onDone); return;
      }
      // Bloom transition always uses variant 0 (the Bloom anim role).
      // variants[1]=Nụ / variants[2]=Bông are idle animations consumed by
      // upgradeQueueBuds / upgradeActiveFlowers — NOT here.
      const variant = _pickByRole(cached, VARIANT_ROLE.BLOOM);
      const rects = variant && variant.rects;
      if (!rects || rects.length < BLOOM_FRAMES) {
        _bloomA(imgEl, onDone); return;
      }
      const sheet = cached.sheet;
      const variantDurations = variant.durations;

      // ── Read CSS vars ──────────────────────────────────────────
      const pos    = imgEl.dataset ? (imgEl.dataset.pos || '1') : '1';
      const posNum = parseInt(pos, 10);
      const compact = imgEl.closest('.sb-compact') || document.documentElement;
      const cs = getComputedStyle(compact);

      const potW         = parseFloat(cs.getPropertyValue('--sb-pot-w'))         || 114;
      const potH         = parseFloat(cs.getPropertyValue('--sb-pot-h'))         || 123;
      const flowerBottom = parseFloat(cs.getPropertyValue('--sb-flower-bottom')) || 40;
      const stemX        = parseFloat(cs.getPropertyValue('--sb-stem-x'))        || 0;
      const stemSpread   = parseFloat(cs.getPropertyValue('--sb-stem-spread'))   || 0;
      const spreadOff    = posNum === 0 ? -stemSpread : posNum === 2 ? stemSpread : 0;
      const angle        = parseFloat(cs.getPropertyValue('--sb-flower-angle'))  || 22;
      const rot          = posNum === 0 ? -angle : posNum === 2 ? angle : 0;
      const ox_css       = parseFloat(cs.getPropertyValue(`--sb-s${pos}-ox`)      || '0') || 0;
      const oy_css       = parseFloat(cs.getPropertyValue(`--sb-s${pos}-oy`)      || '0') || 0;
      const sc_css       = parseFloat(cs.getPropertyValue(`--sb-s${pos}-sc`)      || '1') || 1;
      const animOx       = parseFloat(cs.getPropertyValue(`--sb-s${pos}-anim-ox`) || '0') || 0;
      const animOy       = parseFloat(cs.getPropertyValue(`--sb-s${pos}-anim-oy`) || '0') || 0;
      const varName      = posNum === 1 ? '--sb-flower-w-mid' : '--sb-flower-w-side';
      const cssW         = parseFloat(cs.getPropertyValue(varName)) || 76;

      // ── Canvas size: use LAST frame (full bloom) — same as upgradeActiveFlowers ──
      const fLast = rects[rects.length - 1];
      const [, , swL, shL] = fLast;
      const cssH = Math.round(cssW * shL / swL);
      const PAD  = Math.round(Math.max(cssW, cssH) * 0.65);
      const cvW  = Math.round(cssW) + PAD * 2;
      const cvH  = Math.round(cssH) + PAD * 2;

      // ── Stem-base position in sb-pot-visual coords (no BCR needed) ──
      // Flower: bottom=0 in .sb-active-flowers whose bottom = flowerBottom from pot-visual bottom.
      // transform-origin 50% 95% → pivot = (center-x, top + cssH*0.95).
      // After translateY(oy_css): pivotY = (potH - flowerBottom) + oy_css - cssH * 0.05
      const stemBaseX = potW / 2 + stemX + spreadOff + ox_css;
      const stemBaseY = (potH - flowerBottom) + oy_css - cssH * 0.05;

      // ── Overlay canvas pivot (rotation point inside canvas coords) ─
      const pivotX = cvW / 2;
      const pivotY = PAD + cssH * 0.95;

      // ── Container: sb-pot-visual ───────────────────────────────
      const visual = imgEl.closest('.sb-pot-visual');
      if (!visual) { _bloomA(imgEl, onDone); return; }

      // Position canvas so its internal pivot aligns with stemBase
      const cvLeft = stemBaseX - pivotX + animOx;
      const cvTop  = stemBaseY - pivotY + animOy;

      const cv = document.createElement('canvas');
      cv.width  = cvW;
      cv.height = cvH;
      cv.style.cssText = `position:absolute;`
        + `left:${cvLeft}px;`
        + `top:${cvTop}px;`
        + `width:${cvW}px;height:${cvH}px;`
        + `pointer-events:none;z-index:28;`;
      visual.appendChild(cv);
      const ctx = cv.getContext('2d');

      // Hide source canvas while overlay plays
      const origOpacity = imgEl.style.opacity;
      imgEl.style.opacity = '0';

      // durations: null → 90ms default | number → uniform ms | array → per-frame ms
      // Global speed multiplier (persisted in localStorage):
      //   localStorage.kvtm_bloom_speed = "1.0" (default) | "2.0" (2× slower) | "0.5" (2× faster)
      //   Set at runtime: window._setBloomSpeed(0.5)
      let _bloomMul = 1;
      try {
        const stored = (typeof localStorage !== 'undefined') && localStorage.getItem('kvtm_bloom_speed');
        if (stored) _bloomMul = parseFloat(stored) || 1;
      } catch(e) {}
      const FRAME_DUR = ((typeof variantDurations === 'number') ? variantDurations : 90) * _bloomMul;
      const durations = (Array.isArray(variantDurations) ? variantDurations : []).map(d => d * _bloomMul);
      let startTs = null;
      let lastFrame = -1;

      // Draw frame: rotate canvas content around stem-base pivot (no CSS transform)
      // Layout rules (match upgradeActiveFlowers + CSS transform-origin: 50% 95%):
      //   x: center frame within cssW (same as scale around x=50%)
      //   y: bottom-align frame at PAD+cssH (stem base ≈ PAD+cssH*0.95 for all frames)
      //   fdx/fdy in rects are for the frame-preview panel only — not used here
      const rotRad = rot * Math.PI / 180;
      // Reference pivot in canvas coords — all frame pivots converge here.
      // = bottom-center of cssH frame allocation (Phase 3 anchor point).
      const refX = PAD + cssW / 2;
      const refY = PAD + cssH;
      function drawFrame(f) {
        ctx.clearRect(0, 0, cvW, cvH);
        const rect = rects[f];
        const [sx, sy, sw, sh] = rect;
        const dw = Math.round(cssW * sc_css);
        const dh = Math.round(cssW * sc_css * sh / sw);
        // Phase 3: module pivot in sheet-pixel coords (default bottom-center).
        const { px: pxSheet, py: pySheet } = _getRectPivot(rect);
        const scaleX = dw / sw, scaleY = dh / sh;
        const pivotDrawX = pxSheet * scaleX;
        const pivotDrawY = pySheet * scaleY;
        // Place frame so its pivot lands at the reference point.
        // With default pivot (sw/2, sh) → ox = PAD+(cssW-dw)/2, oy_draw = PAD+cssH-dh
        // → identical to legacy bottom-align.
        const ox      = Math.round(refX - pivotDrawX);
        const oy_draw = Math.round(refY - pivotDrawY);
        ctx.save();
        if (rotRad !== 0) {
          ctx.translate(pivotX, pivotY);
          ctx.rotate(rotRad);
          ctx.translate(-pivotX, -pivotY);
        }
        ctx.drawImage(sheet, sx, sy, sw, sh, ox, oy_draw, dw, dh);
        ctx.restore();
      }

      // Build cumulative time table
      const frameTimes = [];
      let t = 0;
      for (let i = 0; i < rects.length; i++) { frameTimes.push(t); t += (durations[i] || FRAME_DUR); }
      const totalDur = t;

      let rafId = 0;
      function tick(ts) {
        // Bail if scene torn down or overlay removed — prevents orphan rAF
        // drawing into a detached canvas for up to BLOOM_DURATION_MS.
        if (!cv.isConnected || !imgEl.isConnected) {
          try { cv.remove(); } catch(e) {}
          try { imgEl.style.opacity = origOpacity; } catch(e) {}
          return;
        }
        if (!startTs) startTs = ts;
        const elapsed = ts - startTs;
        let fi = rects.length - 1;
        for (let i = 0; i < frameTimes.length - 1; i++) { if (elapsed < frameTimes[i+1]) { fi = i; break; } }
        if (fi !== lastFrame) { lastFrame = fi; drawFrame(fi); }

        if (elapsed < totalDur) {
          rafId = requestAnimationFrame(tick);
        } else {
          // Animation done: transition imgEl from bud (frame 0) to flower (frame 9).
          // Resize imgEl canvas to frame-9 dimensions and draw it, then clear bud flag.
          try {
            const fLast = rects[rects.length - 1];
            const [fsx, fsy, fsw, fsh] = fLast;
            const fw = imgEl.offsetWidth || cssW;
            const fh = Math.round(fw * fsh / fsw);
            imgEl.width = fw; imgEl.height = fh;
            imgEl.getContext('2d').drawImage(sheet, fsx, fsy, fsw, fsh, 0, 0, fw, fh);
          } catch(e) {}
          delete imgEl.dataset.bud;
          cv.remove();
          imgEl.style.opacity = origOpacity;
          onDone && onDone();
        }
      }

      drawFrame(0);
      rafId = requestAnimationFrame(tick);
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
  function paintActive(cell, pot, assetPath, bloomBuds) {
    if (!cell) return;
    const flowersEl = cell.querySelector('.sb-active-flowers');
    if (flowersEl) {
      flowersEl.innerHTML = '';
      [0,1,2].forEach(p => {
        const f = pot.active[p];
        if (!f) return;
        const cv = document.createElement('canvas');
        cv.className = 'sb-active-flower';
        cv.dataset.pos = String(p);
        cv.dataset.color = f;
        // Mark as bud — upgradeActiveFlowers will draw frame 0 (bud) not frame 9.
        // _bloomSheet redraws frame 9 at end of animation, transitioning bud→flower.
        if (bloomBuds && bloomBuds.has(p)) cv.dataset.bud = '1';
        flowersEl.appendChild(cv);
      });
      // Call immediately — if sheet is cached (normal during play) draw is synchronous.
      // Double-rAF fallback for first call when cache may not be ready yet.
      upgradeActiveFlowers(cell, assetPath);
      requestAnimationFrame(() => requestAnimationFrame(() => upgradeActiveFlowers(cell, assetPath)));
    }
    const previewEl = cell.querySelector('.sb-queue-preview');
    if (previewEl) {
      previewEl.innerHTML = renderQueuePreview(pot, assetPath);
      // Draw frame 0 after layout so offsetWidth/Height are available
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
      const flowers = cell.querySelectorAll('.sb-active-flowers [data-pos]');
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
    const flowers = cell.querySelectorAll('.sb-active-flowers [data-pos]');
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

    // Mid-way: commit state first (onLand), THEN animate pop-in on newly-painted flower
    setTimeout(() => {
      onLand && onLand();  // state mutation + repaint happens here
      fly.remove();
      // After onLand repaint, destImg is the freshly-painted element — query AFTER onLand
      requestAnimationFrame(() => {
        const destImg = destCell.querySelector(`.sb-active-flowers [data-pos="${destPos}"]`);
        if (destImg) {
          destImg.animate([
            { transform: 'translateX(-50%) scale(0.4)', opacity: 0 },
            { transform: 'translateX(-50%) scale(1.15)', opacity: 1, offset: 0.6 },
            { transform: 'translateX(-50%) scale(1.0)', opacity: 1 }
          ], { duration: duration * 0.55, fill: 'none', easing: 'cubic-bezier(0.34,1.4,0.64,1)' });
        }
        destCell.classList.remove('sb-land-bounce');
        void destCell.offsetWidth;
        destCell.classList.add('sb-land-bounce');
        setTimeout(() => {
          destCell.classList.remove('sb-land-bounce');
          onDone && onDone();
        }, 220);
      });
    }, duration * 0.45);

    _fadeOutSource(srcImg);
  }

  // ─── shared helpers ────────────────────────────────────
  // Kill any stale fly clone from a previous flight before starting a new one.
  // Prevents background-tab throttle, exceptions, or rapid clicks from leaving
  // an orphan flower image stuck at source position.
  function _killStaleFlies() {
    document.querySelectorAll('img.sb-fly-clone').forEach(el => {
      try { el.remove(); } catch(e) {}
    });
  }

  function _prepFlight(srcCell, destCell, srcPos, destPos, color, assetPath) {
    if (!srcCell || !destCell) return null;
    _killStaleFlies();
    const srcImg = srcCell.querySelector(`.sb-active-flowers [data-pos="${srcPos}"]`);
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
    fly.className = 'sb-fly-clone';
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
    // Hide INSTANTLY when the fly clone starts moving. The previous 100ms
    // opacity fade caused a "ghost flower" effect: the original source image
    // stayed visible (fading) while the fly clone was already moving away,
    // making it look like 2 flowers of the same color — one at source, one
    // flying. Instant hide is seamless because the fly clone starts at the
    // exact source position with full opacity, taking over visually with no
    // gap or overlap.
    srcImg.style.visibility = 'hidden';
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
    const flowers = [...cell.querySelectorAll('.sb-active-flowers [data-pos]')];
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
    const flowers = [...cell.querySelectorAll('.sb-active-flowers [data-pos]')];
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
      cell.querySelectorAll('.sb-active-flowers [data-pos]').forEach(img => {
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

  // Helper: build base transform string for a slot element (preserves rotation/offset)
  function _slotBaseTransform(imgEl) {
    const pos = parseInt(imgEl.dataset?.pos ?? '1', 10);
    const compact = imgEl.closest('.sb-compact') || document.documentElement;
    const cs = getComputedStyle(compact);
    const angle = parseFloat(cs.getPropertyValue('--sb-flower-angle') || '22') || 22;
    const oy = parseFloat(cs.getPropertyValue(`--sb-s${pos}-oy`) || '0') || 0;
    const sc = parseFloat(cs.getPropertyValue(`--sb-s${pos}-sc`) || '1') || 1;
    const rot = pos === 0 ? -angle : pos === 2 ? angle : 0;
    return { base: `translateX(-50%) translateY(${oy}px) rotate(${rot}deg)`, sc };
  }

  // ── A: Spring Scale Pop ───────────────────────────────────────
  function _bloomA(imgEl, onDone) {
    const { base } = _slotBaseTransform(imgEl);
    imgEl.animate([
      { transform: base, opacity: 0 },
      { transform: base, opacity: 1, offset: 0.15 },
      { transform: base, opacity: 1 },
    ], { duration: 420, easing: 'ease-out', fill: 'none' })
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
        { transform: `translate(-50%,-50%) scale(1.2)`, opacity: 1 },
        { transform: `translate(calc(-50% + ${Math.cos(angle)*dist}px), calc(-50% + ${Math.sin(angle)*dist}px)) scale(0)`, opacity: 0 },
      ], { duration: 900, easing: 'ease-out', fill: 'forwards' })
        .onfinish = () => d.remove();
      frags.push(d);
    }
    // Also spring-pop the flower itself (preserve slot rotation)
    const { base: baseB, sc: scB } = _slotBaseTransform(imgEl);
    imgEl.animate([
      { transform: `${baseB} scale(0.4)`,      opacity: 0 },
      { transform: `${baseB} scale(${scB*1.45})`, opacity: 1, offset: 0.45 },
      { transform: `${baseB} scale(${scB*0.95})`, opacity: 1, offset: 0.75 },
      { transform: `${baseB} scale(${scB})`,   opacity: 1 },
    ], { duration: 780, easing: 'ease-out' });
    setTimeout(onDone, 920);
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
      { transform: 'translate(-50%,-50%) scale(0)', opacity: 1 },
      { transform: 'translate(-50%,-50%) scale(3.5)', opacity: 0 },
    ], { duration: 800, easing: 'ease-out', fill: 'forwards' })
      .onfinish = () => ring.remove();
    const { base: baseC, sc: scC } = _slotBaseTransform(imgEl);
    imgEl.animate([
      { transform: `${baseC} scale(0.3)`,      opacity: 0 },
      { transform: `${baseC} scale(${scC*1.4})`, opacity: 1, offset: 0.5 },
      { transform: `${baseC} scale(${scC*0.95})`,opacity: 1, offset: 0.78 },
      { transform: `${baseC} scale(${scC})`,   opacity: 1 },
    ], { duration: 750, easing: 'ease-out' });
    setTimeout(onDone, 820);
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
        { transform: `translate(-50%,-50%) scale(1.3) rotate(0deg)`, opacity: 1 },
        { transform: `translate(calc(-50% + ${Math.cos(angle)*dist}px), calc(-50% + ${Math.sin(angle)*dist}px)) scale(0) rotate(240deg)`, opacity: 0 },
      ], { duration: 950, easing: 'ease-out', fill: 'forwards' })
        .onfinish = () => d.remove();
    }
    // Big spring pop on flower (preserve slot rotation)
    const { base: baseD, sc: scD } = _slotBaseTransform(imgEl);
    imgEl.animate([
      { transform: `${baseD} scale(0)`,         opacity: 0 },
      { transform: `${baseD} scale(${scD*1.55})`,opacity: 1, offset: 0.45 },
      { transform: `${baseD} scale(${scD*0.88})`,opacity: 1, offset: 0.72 },
      { transform: `${baseD} scale(${scD})`,    opacity: 1 },
    ], { duration: 850, easing: 'ease-out' });
    setTimeout(onDone, 960);
  }

  // ── playBloom: move destination (A/B/C/D pop effects, unchanged) ──────────
  function playBloom(imgEl, color, assetPath, onDone) {
    if (!imgEl || !imgEl.isConnected) { onDone && onDone(); return; }
    // Placed flower already shows frame 9 (it flew in fully bloomed).
    // _bloomA/B/C/D are celebration effects (particles, scale pop) starting at opacity:0.
    const done = () => { onDone && onDone(); };
    const pick = Math.floor(Math.random() * 4);
    if (pick === 0) _bloomA(imgEl, done);
    else if (pick === 1) _bloomB(imgEl, color, done);
    else if (pick === 2) _bloomC(imgEl, color, done);
    else _bloomD(imgEl, color, done);
  }

  // ── playBloomQueue: queue promote — grow from bud (frame 0→9 sprite) ──────
  // Called when a flower is promoted from queue into an active slot.
  // Uses _bloomSheet so the flower visually "grows up" from the bud state.
  function playBloomQueue(imgEl, color, assetPath, onDone) {
    if (!imgEl || !imgEl.isConnected) { onDone && onDone(); return; }
    _bloomSheet(imgEl, color, assetPath, () => { onDone && onDone(); });
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
   * Clean staggered win celebration:
   * Phase 1 — each pot fires sequentially: glow ring + 6 petal dots
   * Phase 2 — after all pots done: confetti rain from top + big emoji burst at center
   */
  function playWinCelebration(cells, stars, onDone) {
    const PETAL_COLORS = ['#f9a8d4','#fde68a','#bbf7d0','#e9d5ff','#a5f3fc','#fed7aa'];
    const STAGGER = 180; // ms between each pot
    const POT_DUR = 520; // ring + petals duration

    // ── Teardown bookkeeping ─────────────────────────────────────
    // Track every spawned node + every pending setTimeout so a scene change
    // can cancel orchestration before it appends more nodes to document.body.
    const _timers = new Set();
    const _nodes = new Set();
    let _cancelled = false;
    function _t(fn, ms) {
      const id = setTimeout(() => { _timers.delete(id); if (!_cancelled) fn(); }, ms);
      _timers.add(id);
      return id;
    }
    function _spawn(el) { _nodes.add(el); document.body.appendChild(el); return el; }
    function cancel() {
      if (_cancelled) return;
      _cancelled = true;
      _timers.forEach(clearTimeout); _timers.clear();
      _nodes.forEach(n => { try { n.remove(); } catch(e) {} });
      _nodes.clear();
    }

    // ── Phase 1: per-pot effect ──────────────────────────────────
    cells.forEach((cell, idx) => {
      if (!cell) return;
      _t(() => {
        if (_cancelled) return;
        const rect = cell.isConnected ? cell.getBoundingClientRect() : null;
        if (rect && rect.width === 0 && rect.height === 0) return;
        const cx = rect ? rect.left + rect.width / 2  : window.innerWidth  / 2;
        const cy = rect ? rect.top  + rect.height * 0.4 : window.innerHeight * 0.4;

        // a. Single expanding ring
        const ring = document.createElement('div');
        const ringColor = PETAL_COLORS[idx % PETAL_COLORS.length];
        ring.style.cssText = `position:fixed;left:${cx}px;top:${cy}px;
          width:16px;height:16px;border-radius:50%;
          border:2.5px solid ${ringColor};
          pointer-events:none;z-index:9990;`;
        _spawn(ring);
        ring.animate([
          { transform:'translate(-50%,-50%) scale(0)', opacity:0.9 },
          { transform:'translate(-50%,-50%) scale(5)', opacity:0   },
        ], { duration: POT_DUR, easing:'ease-out' }).onfinish = () => { _nodes.delete(ring); ring.remove(); };

        // c. 6 petal dots burst outward
        for (let i = 0; i < 6; i++) {
          const angle = (i / 6) * Math.PI * 2 - Math.PI / 2;
          const dist  = 40 + Math.random() * 20;
          const dx = Math.cos(angle) * dist;
          const dy = Math.sin(angle) * dist;
          const dot = document.createElement('div');
          const col = PETAL_COLORS[i % PETAL_COLORS.length];
          dot.style.cssText = `position:fixed;left:${cx}px;top:${cy}px;
            width:7px;height:7px;border-radius:50%;background:${col};
            pointer-events:none;z-index:9990;`;
          _spawn(dot);
          dot.animate([
            { transform:`translate(-50%,-50%) translate(0,0) scale(1)`, opacity:1 },
            { transform:`translate(-50%,-50%) translate(${dx}px,${dy}px) scale(0)`, opacity:0 },
          ], { duration: 480 + Math.random()*120, easing:'ease-out' }).onfinish = () => { _nodes.delete(dot); dot.remove(); };
        }
      }, idx * STAGGER);
    });

    // ── Phase 2: confetti rain + emoji burst after all pots ──────
    const phase2Delay = cells.length * STAGGER + POT_DUR + 100;
    const emojis = stars === 3 ? ['🌸','🌟','✨','💐','🎉','⭐'] :
                   stars === 2 ? ['🌸','✨','🌼','💮'] : ['🌸','🌿','✨'];
    const CONG_POOL = ['Hoàn Hảo! 🌟','Tuyệt Vời! 🌸','Xuất Sắc! ✨','Đỉnh Quá! 💐','Ngon Lành! 🎉','Hoàn Thành! 🌿','Đẹp Ghê! 🌼','Chuẩn Luôn! ⭐'];
    const congText = CONG_POOL[Math.floor(Math.random() * CONG_POOL.length)];

    _t(() => {
      if (_cancelled) return;
      // Confetti: 28 pieces fall from random X at top
      const frameEl = document.getElementById('phone-frame') || document.body;
      const frameRect = frameEl.getBoundingClientRect();
      const fLeft  = frameRect.left  || 0;
      const fWidth = frameRect.width  || window.innerWidth;
      const fTop   = frameRect.top    || 0;
      const fH     = frameRect.height || window.innerHeight;

      for (let i = 0; i < 28; i++) {
        _t(() => {
          const piece = document.createElement('div');
          const x = fLeft + Math.random() * fWidth;
          const col = PETAL_COLORS[Math.floor(Math.random() * PETAL_COLORS.length)];
          const size = 5 + Math.random() * 5;
          const rot  = Math.random() * 360;
          const swayX = (Math.random() - 0.5) * 60;
          piece.style.cssText = `position:fixed;left:${x}px;top:${fTop}px;
            width:${size}px;height:${size * 1.6}px;border-radius:2px;
            background:${col};pointer-events:none;z-index:9990;
            transform:rotate(${rot}deg);`;
          _spawn(piece);
          piece.animate([
            { transform:`rotate(${rot}deg) translate(0,0)`,              opacity:1 },
            { transform:`rotate(${rot+180}deg) translate(${swayX}px,${frameRect.height||500}px)`, opacity:0 },
          ], { duration: 1000 + Math.random()*600, easing:'ease-in' }).onfinish = () => { _nodes.delete(piece); piece.remove(); };
        }, i * 40);
      }

      // ── Congratulatory text ──────────────────────────────────
      const txt = document.createElement('div');
      const cx = fLeft + fWidth / 2;
      const cy = fTop  + fH * 0.42;
      txt.textContent = congText;
      txt.style.cssText = `position:fixed;left:${cx}px;top:${cy}px;
        transform:translate(-50%,-50%) scale(0);
        font-size:28px;font-weight:900;
        color:#fff;text-shadow:0 2px 12px rgba(0,0,0,0.5),0 0 24px #FFD700;
        pointer-events:none;z-index:9995;white-space:nowrap;
        font-family:sans-serif;letter-spacing:1px;`;
      _spawn(txt);
      txt.animate([
        { transform:'translate(-50%,-50%) scale(0)',   opacity:0 },
        { transform:'translate(-50%,-50%) scale(1.15)',opacity:1, offset:0.3 },
        { transform:'translate(-50%,-50%) scale(1)',   opacity:1, offset:0.6 },
        { transform:'translate(-50%,-50%) scale(0.9)', opacity:0 },
      ], { duration: 1400, easing:'ease-out' }).onfinish = () => { _nodes.delete(txt); txt.remove(); };

      // Big emoji burst from screen center
      for (let e = 0; e < emojis.length; e++) {
        _t(() => {
          const angle = (e / emojis.length) * Math.PI * 2;
          const dist  = 60 + Math.random() * 30;
          const em = document.createElement('div');
          em.textContent = emojis[e];
          em.style.cssText = `position:fixed;left:${cx}px;top:${cy}px;
            font-size:26px;pointer-events:none;z-index:9991;
            transform:translate(-50%,-50%);user-select:none;`;
          _spawn(em);
          em.animate([
            { transform:`translate(-50%,-50%) scale(0)`, opacity:0 },
            { transform:`translate(-50%,-50%) scale(1.3) translate(${Math.cos(angle)*dist}px,${Math.sin(angle)*dist - 30}px)`, opacity:1, offset:0.5 },
            { transform:`translate(-50%,-50%) scale(0.8) translate(${Math.cos(angle)*dist*1.4}px,${Math.sin(angle)*dist*1.4 - 60}px)`, opacity:0 },
          ], { duration: 900, easing:'ease-out' }).onfinish = () => { _nodes.delete(em); em.remove(); };
        }, e * 60);
      }
      // onDone fires after all phase2 effects finish (last emoji: emojis.length*60 + 900ms)
      const phase2Total = emojis.length * 60 + 900 + 100;
      _t(() => { if (!_cancelled) onDone && onDone(); }, phase2Total);
    }, phase2Delay);

    return { cancel };
  }

  // ─── EXPORT ─────────────────────────────────────────
  const api = {
    COLORS,
    BLOOM_COLS, BLOOM_ROWS, BLOOM_FRAMES, BLOOM_DURATION_MS,
    buildPotCell,
    paintActive, paintQueue, paintAll,
    upgradeActiveFlowers, upgradeQueueBuds,
    setSelected, playVanish, animateFlight, playBloom, playBloomQueue, playWinCelebration, buildQueueBud,
    renderQueueStrip,
    eventToPos, eventToNearestFlowerPos, eventToFlowerHitPos,
    nearestOccupiedPos, nearestEmptyPos, nearestBoardFlower,
    migrateBloomDurs,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    global.SortBlossomRender = api;
  }

  // Global bloom-speed knob (persisted) — readable in console:
  //   _setBloomSpeed(1)    → default
  //   _setBloomSpeed(2)    → 2× slower (good for debugging)
  //   _setBloomSpeed(0.5)  → 2× faster
  //   _getBloomSpeed()     → current value
  if (typeof window !== 'undefined') {
    window._setBloomSpeed = function(v) {
      const n = parseFloat(v);
      if (!isFinite(n) || n <= 0) { console.warn('bloom speed must be > 0'); return; }
      try { localStorage.setItem('kvtm_bloom_speed', String(n)); } catch(e) {}
      console.log(`[bloom] speed multiplier = ${n}× (persisted). Reload not needed — applies on next bloom.`);
    };
    window._getBloomSpeed = function() {
      try { return parseFloat(localStorage.getItem('kvtm_bloom_speed')) || 1; } catch(e) { return 1; }
    };
  }
})(typeof window !== 'undefined' ? window : globalThis);

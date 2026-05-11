/**
 * KVTM 2.0 — Sort Blossom Engine v2 (pure logic, no DOM)
 *
 * Single source of truth for both:
 *  - tools/level_editor.html
 *  - kvtm_2_0_game.html
 *
 * Rule (canonical, see docs/sort_blossom_rules.md):
 *  - Pot: { active: [L|null, C|null, R|null], queue: [color,...] }
 *  - Each color count must be multiple of 3.
 *  - Move: source slot has flower; dest slot must be EMPTY.
 *  - Match-3 vanish: if all 3 active slots same color → all 3 vanish.
 *  - Promotion: if all 3 active empty AND queue has items → shift up to 3 from queue.
 *  - Win: all pots empty (active all null AND queue empty).
 *  - Lose: moves >= moveLimit OR deadlock.
 */
(function (global) {
  'use strict';

  const POS = { L: 0, C: 1, R: 2 };
  const POS_NAMES = ['L', 'C', 'R'];
  const COLORS = ['R', 'P', 'Y', 'V', 'W', 'O', 'B', 'C'];

  // ─── State helpers ─────────────────────────────────────────
  function clonePot(p) { return { active: [...p.active], queue: [...p.queue] }; }
  function clone(state) { return state.map(clonePot); }
  function emptyPot()  { return { active: [null, null, null], queue: [] }; }

  function encode(state) {
    // Compact key for memoization
    return state.map(p =>
      p.active.map(x => x || '_').join('') + ':' + p.queue.join('')
    ).join('|');
  }

  function countColors(state) {
    const counts = {};
    state.forEach(p => {
      p.active.forEach(x => { if (x) counts[x] = (counts[x] || 0) + 1; });
      p.queue.forEach(x => { counts[x] = (counts[x] || 0) + 1; });
    });
    return counts;
  }

  // ─── Core actions ─────────────────────────────────────────

  /**
   * Determine slot position (0/1/2) from touch X within pot bounds.
   * @param {number} x   relative X (0..width)
   * @param {number} w   pot width
   */
  function pickPosFromX(x, w) {
    const r = x / w;
    if (r < 0.34) return 0;
    if (r > 0.66) return 2;
    return 1;
  }

  /**
   * Check if a move from (a, posA) → (b, posB) is valid given current state.
   * Pure function — does NOT mutate.
   */
  function canMove(state, a, posA, b, posB) {
    if (a === b && posA === posB) return false;
    const A = state[a], B = state[b];
    if (!A || !B) return false;
    if (!A.active[posA]) return false;          // source empty
    if (B.active[posB] !== null) return false;   // dest occupied
    return true;
  }

  /**
   * Apply a single move (mutates state). Performs vanish + promotion automatically.
   * @returns {{ok:boolean, vanished:boolean, promoted:number[]}}
   */
  function applyMove(state, a, posA, b, posB) {
    if (!canMove(state, a, posA, b, posB)) return { ok: false };
    const flower = state[a].active[posA];
    state[b].active[posB] = flower;
    state[a].active[posA] = null;

    let vanished = false;
    // Vanish check on destination pot
    const B = state[b];
    if (B.active[0] && B.active[0] === B.active[1] && B.active[1] === B.active[2]) {
      B.active = [null, null, null];
      vanished = true;
    }

    // Promotion: any pot with all-empty active + non-empty queue → shift 3
    const promoted = [];
    state.forEach((p, i) => {
      if (p.active.every(x => x === null) && p.queue.length > 0) {
        promote(p);
        promoted.push(i);
      }
    });

    return { ok: true, vanished, promoted };
  }

  /** Shift up to 3 flowers from queue head into active L/C/R (in order). */
  function promote(pot) {
    if (!pot.active.every(x => x === null)) return;
    for (let i = 0; i < 3 && pot.queue.length > 0; i++) {
      pot.active[i] = pot.queue.shift();
    }
  }

  /**
   * Initialize state: apply promotions for any pots that start with empty active.
   * Use this after loading a level.
   */
  function initState(pots) {
    const s = clone(pots);
    s.forEach(promote);
    return s;
  }

  function isWon(state) {
    return state.every(p =>
      p.active.every(x => x === null) && p.queue.length === 0
    );
  }

  function isDeadlock(state) {
    const N = state.length;
    for (let a = 0; a < N; a++) {
      for (let posA = 0; posA < 3; posA++) {
        if (!state[a].active[posA]) continue;
        for (let b = 0; b < N; b++) {
          for (let posB = 0; posB < 3; posB++) {
            if (canMove(state, a, posA, b, posB)) return false;
          }
        }
      }
    }
    return true;
  }

  function starsFor(moves, thresholds) {
    if (moves <= thresholds[0]) return 3;
    if (moves <= thresholds[1]) return 2;
    if (moves <= thresholds[2]) return 1;
    return 0;
  }

  // ─── Validation ─────────────────────────────────────────

  /**
   * Validate level config. Returns array of error strings (empty if valid).
   */
  function validate(level) {
    const errors = [];
    if (!level || !Array.isArray(level.pots)) return ['Missing pots[]'];
    if (level.pots.length < 2) errors.push('Need ≥2 pots');

    // Color counts must be multiples of 3
    const counts = countColors(level.pots);
    for (const [c, n] of Object.entries(counts)) {
      if (n % 3 !== 0) errors.push(`Color ${c}: ${n} flowers (must be multiple of 3)`);
    }

    // Capacity check: each pot's queue.length ≤ 6 (max total = 9)
    level.pots.forEach((p, i) => {
      if (!Array.isArray(p.active) || p.active.length !== 3)
        errors.push(`Pot #${i}: active must have length 3`);
      if ((p.queue || []).length > 6)
        errors.push(`Pot #${i}: queue exceeds 6 (max total per pot = 9)`);
    });

    // Move possibility on first frame
    if (errors.length === 0) {
      const s = initState(level.pots);
      if (isWon(s)) errors.push('Level starts won (empty)');
      else if (isDeadlock(s)) errors.push('Level starts in deadlock');
    }
    return errors;
  }

  // ─── Solver (BFS) ─────────────────────────────────────────

  /**
   * Find min moves to win. BFS state explorer with memoization.
   * @param {Object[]} pots  initial level pots
   * @param {number} maxStates safety cap
   * @returns {{moves:number, states:number, solvable:boolean, timeout?:boolean}}
   */
  function bfsSolve(pots, maxStates = 200000) {
    const start = initState(pots);
    if (isWon(start)) return { moves: 0, states: 1, solvable: true };

    const visited = new Set();
    visited.add(encode(start));
    const queue = [{ state: start, moves: 0 }];
    let states = 1;

    while (queue.length) {
      if (states > maxStates) return { moves: -1, states, solvable: false, timeout: true };
      const { state, moves } = queue.shift();
      const N = state.length;
      for (let a = 0; a < N; a++) {
        for (let posA = 0; posA < 3; posA++) {
          if (!state[a].active[posA]) continue;
          for (let b = 0; b < N; b++) {
            for (let posB = 0; posB < 3; posB++) {
              if (a === b && posA === posB) continue;
              if (state[b].active[posB] !== null) continue;
              const ns = clone(state);
              const r = applyMove(ns, a, posA, b, posB);
              if (!r.ok) continue;
              const k = encode(ns);
              if (visited.has(k)) continue;
              visited.add(k);
              states++;
              if (isWon(ns)) return { moves: moves + 1, states, solvable: true };
              queue.push({ state: ns, moves: moves + 1 });
            }
          }
        }
      }
    }
    return { moves: -1, states, solvable: false };
  }

  /**
   * Find a single valid (a, posA, b, posB) move as a hint — picks first found.
   * Used by Hint booster.
   */
  function findHint(state) {
    const N = state.length;
    for (let a = 0; a < N; a++) {
      for (let posA = 0; posA < 3; posA++) {
        if (!state[a].active[posA]) continue;
        for (let b = 0; b < N; b++) {
          for (let posB = 0; posB < 3; posB++) {
            if (canMove(state, a, posA, b, posB)) {
              return { fromPot: a, fromPos: posA, toPot: b, toPos: posB };
            }
          }
        }
      }
    }
    return null;
  }

  function difficultyScore(minMoves, moveLimit, colorCount, vasesCount) {
    if (minMoves < 0) return 1.0;
    const ratio = minMoves / Math.max(1, moveLimit);
    const colorTerm = Math.min(1, colorCount / 6) * 0.3;
    const vaseTerm  = Math.min(1, vasesCount / 8) * 0.2;
    const moveTerm  = Math.min(1, ratio) * 0.5;
    return Math.min(1, colorTerm + vaseTerm + moveTerm);
  }

  // ─── EXPORT ─────────────────────────────────────────
  const api = {
    POS, POS_NAMES, COLORS,
    emptyPot, clonePot, clone, encode,
    pickPosFromX,
    canMove, applyMove, promote, initState,
    isWon, isDeadlock,
    starsFor,
    validate, countColors,
    bfsSolve, findHint, difficultyScore,
    VERSION: 2,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    global.SortBlossomEngine = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);

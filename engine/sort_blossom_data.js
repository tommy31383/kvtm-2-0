/**
 * KVTM 2.0 — Sort Blossom levels DATA (v2 schema)
 *
 * SINGLE SOURCE OF TRUTH for level definitions.
 * Both tool and game read from here. Tool can save back into here
 * (download → paste over) or via localStorage 'kvtm2_levels_v2' override.
 *
 * Schema:
 *   {
 *     id, name,
 *     pots: [{ active: [L|null, C|null, R|null], queue: [color,...] }, ...],
 *     moveLimit, starThresholds: [3⭐, 2⭐, 1⭐],
 *     tutorial?: boolean,
 *     schemaVersion: 2
 *   }
 */
(function (global) {
  'use strict';

  const SORT_BLOSSOM_LEVELS = [
    // ── L1: Tutorial — 2 pots, 1 color, super easy ──
    {
      id: 1,
      name: 'Hoa Hồng Đầu Tiên',
      pots: [
        { active: ['R', null, null], queue: ['R', 'R'] },
        { active: [null, null, null], queue: [] },
      ],
      moveLimit: 8,
      starThresholds: [3, 5, 7],
      tutorial: true,
      schemaVersion: 2,
    },

    // ── L2: 2 colors, 3 pots ──
    {
      id: 2,
      name: 'Buổi Sáng Êm Ả',
      pots: [
        { active: ['R', 'P', 'R'], queue: ['P', 'R', 'P'] },
        { active: ['P', 'R', 'P'], queue: ['R', 'P', 'R'] },
        { active: [null, null, null], queue: [] },
      ],
      moveLimit: 14,
      starThresholds: [6, 9, 13],
      schemaVersion: 2,
    },

    // ── L3: 3 colors, 4 pots ──
    {
      id: 3,
      name: 'Ba Sắc Hoa',
      pots: [
        { active: ['R', 'P', 'R'], queue: [] },
        { active: ['R', 'Y', 'Y'], queue: [] },
        { active: ['P', 'P', 'Y'], queue: [] },
        { active: [null, null, null], queue: [] },
      ],
      moveLimit: 12,
      starThresholds: [4, 7, 10],
      schemaVersion: 2,
    },
  ];

  // Allow override from localStorage (tool can save here for instant import to game)
  function loadLevels() {
    try {
      const raw = (typeof localStorage !== 'undefined') && localStorage.getItem('kvtm2_levels_v2');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length) return parsed;
      }
    } catch {}
    return SORT_BLOSSOM_LEVELS;
  }

  function saveLevels(levels) {
    try {
      localStorage.setItem('kvtm2_levels_v2', JSON.stringify(levels));
      return true;
    } catch { return false; }
  }

  function defaultLevels() {
    return JSON.parse(JSON.stringify(SORT_BLOSSOM_LEVELS));
  }

  const api = {
    SORT_BLOSSOM_LEVELS,
    loadLevels,
    saveLevels,
    defaultLevels,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    global.SortBlossomData = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);

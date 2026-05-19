// Parse Spine atlas text format (.atlas file).
//
// Spec: https://en.esotericsoftware.com/spine-atlas-format
//
// Format example:
//   imagename.png         ← page filename (column 0, no colon)
//   size: 1024,1024       ← page metadata (column 0, has colon)
//   format: RGBA8888
//   filter: Linear,Linear
//   repeat: none
//   regionName            ← region name (column 0, no colon)
//     rotate: false       ← region attribute (indented, has colon)
//     xy: 100, 200
//     size: 80, 96
//     orig: 80, 96
//     offset: 0, 0
//     index: -1
//
// Key parsing rule:
//   - Column-0 line WITHOUT colon → page filename (first occurrence) or region name
//   - Column-0 line WITH colon    → page metadata (only valid before first region)
//   - Indented line WITH colon    → region attribute on current region

import type { Atlas, AtlasPage, AtlasRegion } from '../core/types.js';

export function parseAtlas(text: string): Atlas {
  const lines = text.split(/\r?\n/);
  const pages: AtlasPage[] = [];
  let currentPage: AtlasPage | null = null;
  let currentRegion: AtlasRegion | null = null;
  // Once we see the first region in current page, column-0 `key:` lines are
  // ambiguous — but in practice page metadata always comes BEFORE regions, so
  // we just stop treating col-0 colon lines as page metadata after that.
  let seenRegionInPage = false;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();
    if (!line) {
      // Blank line — end current region context but stay on current page
      currentRegion = null;
      continue;
    }
    const isIndented = /^\s/.test(raw);
    const colonIdx = line.indexOf(':');
    const hasColon = colonIdx > 0;

    if (!isIndented) {
      if (!hasColon) {
        // No colon, column 0 → page filename OR region name
        if (!currentPage) {
          // First column-0 no-colon line → page filename
          currentPage = {
            name: line,
            width: 0,
            height: 0,
            regions: [],
          };
          pages.push(currentPage);
          seenRegionInPage = false;
        } else if (!seenRegionInPage && looksLikeImageName(line)) {
          // A second page header (multi-page atlas) — start a new page
          currentPage = {
            name: line,
            width: 0,
            height: 0,
            regions: [],
          };
          pages.push(currentPage);
          seenRegionInPage = false;
        } else {
          // Region name
          currentRegion = {
            name: line,
            x: 0, y: 0, width: 0, height: 0,
          };
          currentPage.regions.push(currentRegion);
          seenRegionInPage = true;
        }
        continue;
      }
      // Has colon at column 0
      if (!seenRegionInPage && currentPage) {
        // Page metadata
        const key = line.slice(0, colonIdx).trim().toLowerCase();
        const val = line.slice(colonIdx + 1).trim();
        applyPageMetadata(currentPage, key, val);
        continue;
      }
      // Column-0 colon line after region started — treat as next region name
      // (unusual but defensive). Most atlases don't do this.
      continue;
    }

    // Indented line — region attribute
    if (!currentRegion || !hasColon) continue;
    const key = line.slice(0, colonIdx).trim().toLowerCase();
    const val = line.slice(colonIdx + 1).trim();
    applyRegionAttr(currentRegion, key, val);
  }

  return { pages };
}

function looksLikeImageName(s: string): boolean {
  return /\.(png|webp|jpg|jpeg|gif|bmp|tga)$/i.test(s);
}

function applyPageMetadata(page: AtlasPage, key: string, val: string) {
  switch (key) {
    case 'size': {
      const [w, h] = val.split(',').map(s => parseInt(s.trim(), 10));
      page.width = w || 0;
      page.height = h || 0;
      break;
    }
    case 'format':
      page.format = val;
      break;
    case 'filter': {
      const parts = val.split(',').map(s => s.trim());
      page.filter = [parts[0] ?? 'Linear', parts[1] ?? 'Linear'];
      break;
    }
    case 'repeat':
    case 'pma':
    case 'scale':
      // Phase 4+
      break;
  }
}

function applyRegionAttr(region: AtlasRegion, key: string, val: string) {
  switch (key) {
    case 'xy': {
      const [x, y] = val.split(',').map(s => parseInt(s.trim(), 10));
      region.x = x || 0;
      region.y = y || 0;
      break;
    }
    case 'size': {
      const [w, h] = val.split(',').map(s => parseInt(s.trim(), 10));
      region.width = w || 0;
      region.height = h || 0;
      break;
    }
    case 'orig': {
      const [w, h] = val.split(',').map(s => parseInt(s.trim(), 10));
      region.originalWidth = w;
      region.originalHeight = h;
      break;
    }
    case 'offset': {
      const [x, y] = val.split(',').map(s => parseInt(s.trim(), 10));
      region.offsetX = x;
      region.offsetY = y;
      break;
    }
    case 'rotate':
      region.rotate = (val === 'true' || val === '90');
      break;
    case 'index':
      // Region index for atlas page splitting — Phase 4
      break;
  }
}

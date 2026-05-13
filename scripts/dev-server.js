#!/usr/bin/env node
/**
 * KVTM 2.0 — Dev Server
 * Serves static files + POST /api/save-levels to write directly to engine/sort_blossom_data.js
 * Usage: node scripts/dev-server.js
 */
const http = require('http');
const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const PORT = 3456;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.png':  'image/png',
  '.webp': 'image/webp',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.json': 'application/json; charset=utf-8',
  '.ico':  'image/x-icon',
};

const server = http.createServer((req, res) => {
  // CORS for local dev (origin:null from file:// needs explicit header on every response)
  const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS); res.end(); return;
  }
  Object.entries(CORS).forEach(([k,v]) => res.setHeader(k, v));

  // ── API: save levels ───────────────────────────────────────────
  if (req.method === 'POST' && req.url === '/api/save-levels') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const { levels, autoPush } = JSON.parse(body);
        if (!Array.isArray(levels)) throw new Error('levels must be array');

        // Generate sort_blossom_data.js
        const dataFile = path.join(ROOT, 'engine', 'sort_blossom_data.js');
        const existing = fs.readFileSync(dataFile, 'utf8');
        // Replace SORT_BLOSSOM_LEVELS block — dùng bracket depth tracking thay vì regex
        // vì lazy \[[\s\S]*?\] sẽ dừng ở ] đầu tiên bên trong array (active:[null,null,null])
        const marker = 'const SORT_BLOSSOM_LEVELS';
        const start = existing.indexOf(marker);
        if (start === -1) throw new Error('Could not find SORT_BLOSSOM_LEVELS in data file');
        const arrStart = existing.indexOf('[', start);
        if (arrStart === -1) throw new Error('Could not find [ after SORT_BLOSSOM_LEVELS');
        let depth = 0, end = -1;
        for (let i = arrStart; i < existing.length; i++) {
          const ch = existing[i];
          if (ch === '[') depth++;
          else if (ch === ']') { depth--; if (depth === 0) { end = i; break; } }
        }
        if (end === -1) throw new Error('Could not find closing ] of SORT_BLOSSOM_LEVELS');
        // skip optional ; and newline after ]
        let tail = end + 1;
        if (existing[tail] === ';') tail++;
        if (existing[tail] === '\n') tail++;
        const newContent = existing.slice(0, start)
          + `const SORT_BLOSSOM_LEVELS = ${JSON.stringify(levels, null, 2)};\n`
          + existing.slice(tail);
        fs.writeFileSync(dataFile, newContent, 'utf8');

        let gitMsg = '';
        if (autoPush) {
          try {
            execSync('git add engine/sort_blossom_data.js', { cwd: ROOT });
            execSync('git commit -m "Editor: update level data + potLayout"', { cwd: ROOT });
            execSync('git push origin master', { cwd: ROOT });
            gitMsg = ' — git pushed ✓';
          } catch (ge) {
            gitMsg = ' — git push failed: ' + ge.message.split('\n')[0];
          }
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, message: `Saved ${levels.length} levels${gitMsg}` }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }

  // ── API: get bloom rects ──────────────────────────────────────
  if (req.method === 'GET' && req.url.startsWith('/api/bloom-rects')) {
    try {
      const renderFile = path.join(ROOT, 'engine', 'sort_blossom_render.js');
      const src = fs.readFileSync(renderFile, 'utf8');
      const match = src.match(/_BLOOM_RECTS\s*=\s*\{([\s\S]*?)\};/);
      if (!match) throw new Error('_BLOOM_RECTS not found');
      const rects = Function('return ({' + match[1] + '})')();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, rects }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
    return;
  }

  // ── API: save CSS vars → engine/sort_blossom.css ──────────────
  if (req.method === 'POST' && req.url === '/api/save-css-vars') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const { vars } = JSON.parse(body); // {vars: {"--sb-stem-x":"4px", ...}}
        if (!vars || typeof vars !== 'object') throw new Error('vars object required');
        const cssFile = path.join(ROOT, 'engine', 'sort_blossom.css');
        let src = fs.readFileSync(cssFile, 'utf8');
        // Replace each var inside .sb-compact { ... } block
        const blockStart = src.indexOf('.sb-compact');
        const blockEnd   = src.indexOf('}', blockStart);
        if (blockStart === -1 || blockEnd === -1) throw new Error('.sb-compact block not found');
        let block = src.slice(blockStart, blockEnd + 1);
        Object.entries(vars).forEach(([prop, val]) => {
          const re = new RegExp(`(${prop.replace(/[-]/g,'\\-')}\\s*:\\s*)[^;]+(;)`, 'g');
          block = block.replace(re, `$1${val}$2`);
        });
        src = src.slice(0, blockStart) + block + src.slice(blockEnd + 1);
        fs.writeFileSync(cssFile, src, 'utf8');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, message: `Saved ${Object.keys(vars).length} CSS vars` }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }

  // ── API: save bloom rects ─────────────────────────────────────
  if (req.method === 'POST' && req.url === '/api/save-bloom-rects') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const { color, rects, durations } = JSON.parse(body);
        if (!color || !Array.isArray(rects)) throw new Error('color + rects required');
        const renderFile = path.join(ROOT, 'engine', 'sort_blossom_render.js');
        let src = fs.readFileSync(renderFile, 'utf8');

        // Helper: replace one color key in a named const block
        function replaceColorLine(source, blockName, colorKey, newVal) {
          const blockStart = source.indexOf(blockName);
          if (blockStart === -1) return source;
          const blockEnd = source.indexOf('};', blockStart);
          const before = source.slice(0, blockStart);
          let block = source.slice(blockStart, blockEnd + 2);
          const after = source.slice(blockEnd + 2);
          const lines = block.split('\n').map(line => {
            const m = line.match(new RegExp(`^(\\s+${colorKey}:\\s*)(.+?)(,?)$`));
            if (m) return `${m[1]}${newVal}${m[3]}`;
            return line;
          });
          return before + lines.join('\n') + after;
        }

        // Update _BLOOM_RECTS
        src = replaceColorLine(src, '_BLOOM_RECTS', color, JSON.stringify(rects));

        // Update _BLOOM_DURS if durations provided
        if (Array.isArray(durations) && durations.length) {
          const allDefault = durations.every(d => d === 90);
          const durVal = allDefault ? 'null' : JSON.stringify(durations);
          src = replaceColorLine(src, '_BLOOM_DURS', color, durVal);
        }

        fs.writeFileSync(renderFile, src, 'utf8');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, message: `Saved ${color}: ${rects.length} frames` }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }

  // ── Static file server ─────────────────────────────────────────
  let filePath = path.join(ROOT, req.url.split('?')[0]);
  if (filePath === path.join(ROOT, '/') || filePath === ROOT) {
    filePath = path.join(ROOT, 'kvtm_2_0_game.html');
  }
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end('Forbidden'); return; }

  // Try .html extension fallback
  const tryPaths = [filePath, filePath + '.html', path.join(filePath, 'index.html')];

  function tryNext(paths) {
    if (!paths.length) { res.writeHead(404); res.end('Not found: ' + req.url); return; }
    const p = paths.shift();
    fs.stat(p, (err, stat) => {
      if (err || !stat.isFile()) return tryNext(paths);
      filePath = p;
      serve();
    });
  }

  function serve() {
    fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) { tryNext([]); return; }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      fs.createReadStream(filePath).pipe(res);
    });
  }

  tryNext(tryPaths);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🌹 KVTM Dev Server running`);
  console.log(`   Local:   http://localhost:${PORT}/kvtm_2_0_game.html`);
  console.log(`   Editor:  http://localhost:${PORT}/tools/level_editor.html`);
  try {
    const { execSync } = require('child_process');
    const ip = execSync('ipconfig').toString().match(/IPv4.*?:\s*([\d.]+)/);
    if (ip) console.log(`   Mobile:  http://${ip[1]}:${PORT}/kvtm_2_0_game.html`);
  } catch {}
  console.log(`\n   POST /api/save-levels  — write engine/sort_blossom_data.js + git push\n`);
});

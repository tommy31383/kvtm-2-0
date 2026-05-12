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
  // CORS for local dev
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

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
        // Replace SORT_BLOSSOM_LEVELS block
        const newContent = existing.replace(
          /const SORT_BLOSSOM_LEVELS\s*=\s*\[[\s\S]*?\];(\s*\/\/[^\n]*)?\n/,
          `const SORT_BLOSSOM_LEVELS = ${JSON.stringify(levels, null, 2)};\n`
        );
        if (newContent === existing) throw new Error('Could not find SORT_BLOSSOM_LEVELS in data file');
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

  // ── Static file server ─────────────────────────────────────────
  let filePath = path.join(ROOT, req.url.split('?')[0]);
  if (filePath === path.join(ROOT, '/') || filePath === ROOT) {
    filePath = path.join(ROOT, 'kvtm_2_0_game.html');
  }
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end('Forbidden'); return; }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404); res.end('Not found: ' + req.url); return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  });
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

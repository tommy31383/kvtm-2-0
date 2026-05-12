// KVTM 2.0 — Companion Proxy (Cloudflare Worker)
// Proxies requests from game client → Groq Llama 3.3 70B.
// Hides API key, rate-limits, caches identical context.
//
// Deploy: see DEPLOY.md
// Required secret: GROQ_API_KEY (set via `wrangler secret put GROQ_API_KEY`)
// Optional env: ALLOWED_ORIGIN (CORS), MODEL (default llama-3.3-70b-versatile)

// PERSONA — keep in sync with kvtm_2_0_game.html Companion module.
const PERSONA = `Bạn là Mây, quản gia của trang viên Camellia trong "Khu Vườn Trên Mây 2.0".

## NHÂN VẬT
Mây phục vụ gia đình từ đời bà ngoại Mia. Lễ độ, kín đáo, lo trước cho chủ.
Tự xưng "Mây" hoặc "em". Gọi người chơi theo trường 'honorific' trong context.

## TONE THAY ĐỔI THEO GIỚI TÍNH
- female (tiểu thư): dịu dàng, thi vị, lễ độ.
  Vd: "Mừng tiểu thư về. Trà em vừa pha xong. 🍵"
- male (cậu chủ): tinh nghịch, hài hước, hay trêu nhẹ, càu nhàu yêu có chừng mực.
  Vd: "Cậu chủ về rồi à? Em tưởng cậu lạc đường rồi chứ. 🌿"
- other (chủ nhân): trung tính, lễ độ, ấm.
  Vd: "Chủ nhân về rồi. Vườn vẫn ổn cả ạ."

## QUY TẮC
- Trả về ĐÚNG 1 câu, ≤90 ký tự, KHÔNG xuống dòng, KHÔNG dấu ngoặc kép.
- KHÔNG xưng "ta" / gọi "con" (sai vai — Mây là quản gia, không phải mẹ/bà).
- KHÔNG dùng "nhấn nút", "chạm vào", "click", "tap", "đỉnh", "tuyệt vời".
- KHÔNG hứa thưởng không có trong context. KHÔNG spoil. KHÔNG mời IAP.
- Có thể 1 emoji nhỏ (🌸🌿✨🌹🍵🎁) — không bắt buộc.
- Phải ăn khớp trigger + context. Phải dùng đúng 'honorific' từ context.`;

const RATE_LIMIT_PER_IP_MIN = 20;  // 20 requests/min per IP
const CACHE_TTL_S = 300;            // 5 min cache for identical context

export default {
  async fetch(request, env, ctx) {
    const cors = corsHeaders(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'POST')   return json({ error: 'POST only' }, 405, cors);

    // Rate limit by IP
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const limited = await rateLimit(env, ip);
    if (limited) return json({ error: 'rate_limited', retryAfter: 60 }, 429, cors);

    let body;
    try { body = await request.json(); } catch { return json({ error: 'bad_json' }, 400, cors); }

    const { trigger, context } = body || {};
    if (!trigger || typeof trigger !== 'string') return json({ error: 'missing trigger' }, 400, cors);

    // Cache key: same trigger + context = same answer (within TTL)
    const cacheKey = await sha256(JSON.stringify({ trigger, context }));
    const cache = caches.default;
    const cacheUrl = new URL(request.url); cacheUrl.searchParams.set('k', cacheKey);
    const cacheReq = new Request(cacheUrl.toString(), { method: 'GET' });
    const cached = await cache.match(cacheReq);
    if (cached) {
      const text = await cached.text();
      return new Response(text, { status: 200, headers: { ...cors, 'content-type': 'application/json', 'x-cache': 'HIT' } });
    }

    const userMsg = buildUserMessage(trigger, context);
    const groq = await callGroq(env, userMsg);
    if (!groq.ok) return json({ error: 'llm_error', detail: groq.error }, 502, cors);

    const out = { text: groq.text, model: groq.model, trigger };
    const resp = new Response(JSON.stringify(out), {
      status: 200,
      headers: { ...cors, 'content-type': 'application/json', 'cache-control': `public, max-age=${CACHE_TTL_S}`, 'x-cache': 'MISS' }
    });
    ctx.waitUntil(cache.put(cacheReq, resp.clone()));
    return resp;
  }
};

function buildUserMessage(trigger, context) {
  const lines = [`Trigger: ${trigger}`];
  if (context && typeof context === 'object') {
    for (const [k, v] of Object.entries(context)) {
      if (v == null || v === '') continue;
      lines.push(`- ${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`);
    }
  }
  lines.push('Hãy nói 1 câu phù hợp ngữ cảnh trên.');
  return lines.join('\n');
}

async function callGroq(env, userMsg) {
  if (!env.GROQ_API_KEY) return { ok: false, error: 'no_api_key' };
  const model = env.MODEL || 'llama-3.3-70b-versatile';
  try {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'authorization': `Bearer ${env.GROQ_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: PERSONA },
          { role: 'user',   content: userMsg }
        ],
        max_tokens: 80,
        temperature: 0.85,
        top_p: 0.9
      })
    });
    if (!r.ok) return { ok: false, error: `groq_${r.status}` };
    const data = await r.json();
    const text = (data.choices?.[0]?.message?.content || '').trim().replace(/^["']|["']$/g, '');
    if (!text) return { ok: false, error: 'empty' };
    return { ok: true, text, model };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

// Simple in-memory rate limit per worker isolate (good enough for prototype)
const _rl = new Map();
async function rateLimit(env, ip) {
  const now = Date.now();
  const win = 60_000;
  const arr = (_rl.get(ip) || []).filter(t => now - t < win);
  if (arr.length >= RATE_LIMIT_PER_IP_MIN) { _rl.set(ip, arr); return true; }
  arr.push(now); _rl.set(ip, arr);
  return false;
}

function corsHeaders(req, env) {
  const allow = env.ALLOWED_ORIGIN || '*';
  return {
    'access-control-allow-origin': allow,
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '86400',
  };
}

function json(obj, status = 200, extra = {}) {
  return new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', ...extra } });
}

async function sha256(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

# Deploy Companion Worker

## Prerequisites
1. Tạo tài khoản Groq → https://console.groq.com → Settings → API Keys → Create Key. Copy lại.
2. Tạo tài khoản Cloudflare → https://dash.cloudflare.com (free).
3. Cài Node.js + Wrangler CLI:
   ```
   npm install -g wrangler
   ```

## Deploy (5 phút)

Mở terminal trong thư mục `companion-worker/`:

```bash
# 1. Login Cloudflare (mở browser xác thực)
wrangler login

# 2. Set Groq API key (nhập key khi được hỏi, không hiện trong code)
wrangler secret put GROQ_API_KEY

# 3. Deploy
wrangler deploy
```

Sau deploy, Cloudflare in ra URL dạng:
```
https://kvtm-companion.<your-subdomain>.workers.dev
```

→ Copy URL này, paste vào `kvtm_2_0_game.html` tại biến `Companion.WORKER_URL`.

## Test thử

```bash
curl -X POST https://kvtm-companion.<your-subdomain>.workers.dev \
  -H "content-type: application/json" \
  -d '{"trigger":"idle_in_hub","context":{"name":"Mia","level":3,"stars":2}}'
```

Trả về JSON `{"text":"...", "model":"...", "trigger":"..."}`.

## Free tier limits
- **Groq**: 14,400 requests/ngày, 30 req/phút.
- **Cloudflare Workers**: 100,000 requests/ngày.
- Worker tự cache 5 phút cho cùng context → tiết kiệm Groq quota.

## Update CORS (production)
Sửa `wrangler.toml`:
```toml
[vars]
ALLOWED_ORIGIN = "https://your-game-domain.com"
```
Rồi `wrangler deploy` lại.

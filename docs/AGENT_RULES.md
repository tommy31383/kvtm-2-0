# Agent Rules — KVTM 2.0

Quy tắc bắt buộc cho Claude (và bất kỳ agent nào) làm việc trên codebase này.
Mục tiêu: ngăn 2 class of failures gây pain trong dev:
1. **Game ↔ Tool desync** (edit tool save xong game không đổi, hoặc ngược lại)
2. **Local ↔ Git desync** (commit không match disk, push thiếu, server chạy code cũ)

---

## I. SYNC: Game ↔ Tool

### Data flow canonical
```
Editor tool (level_editor, bloom_test)
  │ POST /api/save-*  (browser → dev-server)
  ▼
dev-server.js  (writes engine/*.js + engine/*.css)
  ▼
File system   ← single source of truth
  ▼
Game HTML reloads → reads engine files → renders
```

### Rules

**R1 — Single source of truth là FILE trên disk.** Không có "tool state" hoặc "game state" độc lập. Mọi field shared (rects, durations, levels, CSS vars) phải đi qua file.

**R2 — Mỗi format có MIGRATION function.** Schema thay đổi (vd `_BLOOM_DURS` từ `null` → `474` → `[d1,...,d10]`) phải có `migrate*()` function pure. Test với mọi dạng cũ. Reader luôn gọi migrate trước khi dùng.
- `engine/sort_blossom_render.js::migrateBloomDurs`
- `src/js/core.js::migrateSave`

**R3 — Save endpoint phải log + return diff visible.** Tool save → server log `[save-X] color=P durationsLiteral=474` + response message `_BLOOM_DURS=474`. Tool status bar echo cùng giá trị. Bất kỳ desync giữa 3 chỗ này = bug.

**R4 — Cache headers must be `no-store` for dev assets** (.html/.js/.css/.json). Đã có ở [scripts/dev-server.js:262](scripts/dev-server.js). Không xóa.

**R5 — Boot smoke check phải pass.** Trước khi report "game works", verify `[KVTM smoke] ✓ all engine data validated` xuất hiện trong Console. Nếu có `N issue(s) detected:` → fix trước.

**R6 — Tool load phải mirror format file.** Nếu file `P: 474` thì tool slider/UI phải hiện uniform 474, KHÔNG được hardcode `dur: 90`. Đã fix ở [tools/bloom_test.html](tools/bloom_test.html) `loadFromServer` với `_durFor()`.

---

## II. SYNC: Local ↔ Git ↔ Running process

### State layers
```
Git remote (github)
  ↕ push/pull
Git local (.git)
  ↕ checkout/commit
Working dir (files on disk)   ← what you edit
  ↕ require / fs.readFileSync
Running Node process (RAM)    ← what's serving requests
  ↕ HTTP
Browser process               ← what user sees
  ├ HTML cache
  └ JS/CSS cache
```

### Rules

**R7 — Server code change → restart Node bắt buộc.** Node không hot-reload. Sau khi edit `scripts/dev-server.js`, lệnh duy nhất đáng tin: `Stop-Process -Id <PID> -Force; node scripts/dev-server.js`. Verify bằng terminal output mới (`Token (this run): <hex>` mới).

**R8 — Trước khi nghi ngờ code, check 3 layer:**
```powershell
git status                                 # disk vs commit
git log -1 <file>                          # disk vs remote
netstat -ano | findstr ":3456 "           # PID đang serve
```
Nếu commit log mới nhưng response của server cũ → Node chưa restart. Nếu file trên disk khác git → có local edit chưa commit.

**R9 — Mỗi edit observable in browser → bump `?v=` query** trong HTML tag tương ứng. Hoặc rely on `no-store` header (localhost). KHÔNG được edit `.js` rồi report "fixed" mà không bump. file:// users không hit dev-server → vẫn cần bump.

**R10 — Commit trước push, push ngay sau commit.** Đừng để local commit "ngồi chờ" — user sẽ pull link GitHub thấy code cũ. Workflow: edit → test → commit + push **trong cùng một response**.

**R11 — Commit message phải nói WHY, không phải WHAT.** File diff đã show what. Commit body phải explain trigger (bug nào, request nào của user) + tradeoff (vì sao chọn approach này).

---

## III. SYNC: Reasoning ↔ Reality

**R12 — "Check trước, sửa sau":**
- Edit file > 200 LOC → grep với pattern cụ thể, verify line number / context trước khi Edit.
- Bash regex → test với sample data 1 lần (`echo input | sed ...`) trước khi apply lên file thật.
- "Tôi đoán" hoặc "có lẽ" trong reasoning → STOP, đọc file trước.

**R13 — Khi user báo "không đổi gì" — VERIFY từ FILE, không từ assumption:**
```bash
grep -A 12 "_BLOOM_DURS" engine/sort_blossom_render.js
git diff <file>
```
Trước khi propose fix mới, biết chính xác disk state hiện tại.

**R14 — Cache là default suspect khi behavior không match code:**
Symptom: code mới, behavior cũ. Check thứ tự:
1. Browser tab dùng version nào? (DevTools Network → Disable cache)
2. Server Node process restart sau khi sửa server code?
3. File trên disk có match git latest?

**R15 — Mid-refactor không "verify" prematurely.** Edit 5 file → verify 1 lần ở cuối. Edit 1 file → verify. Đừng vừa edit vừa load preview, lãng phí cycle.

---

## IV. Verification checklist trước khi report "done"

- [ ] `npm test` xanh (chạy được? — yes nếu có Node 18+)
- [ ] `git status` clean (uncommitted changes ý đồ?)
- [ ] `git log -1` commit hash mới push lên remote
- [ ] Nếu sửa server code: terminal Node có output line mới sau restart?
- [ ] Nếu sửa engine/render: bump `?v=N` ở mọi HTML reference?
- [ ] Nếu user dùng file://: HARD reload (Ctrl+Shift+R) sau khi sửa?

---

## V. Anti-patterns đã gặp

| Đã làm sai | Lesson |
|---|---|
| Thêm `let _teardownHooks = []` sau `return {...}` trong IIFE | `let`/`const` post-return stays in TDZ. Mọi declaration phải trước `return`. |
| Regex `s/\s+P:\s*[^,\n]+,/P: null,/` để sửa `_BLOOM_DURS.P` | Hit nhầm `COLORS.P` line 15. Phải specific: `s/(\n\s{4}P:\s*)[\d\[]/...]` hoặc dùng line-range awareness. |
| Restart Node nói "sao vẫn lỗi" | User restart từ wrong cwd → Node not start. Verify terminal output mới. |
| Save tool 1 form, game đọc form khác | Tool sent scalar, server expected array, both written but silent skip. Single contract + test mỗi format. |
| Verify "đã fix" bằng reasoning | Always verify by reading file/running test, never by "should work". |

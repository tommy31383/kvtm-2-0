# KVTM 2.0 — Lessons Learned

> Ghi lại các pattern, quyết định thiết kế, và anti-pattern đã phát hiện trong quá trình dev.

---

## 1. Animation Queue — Promise Chain Pattern

### Vấn đề
Nhiều animation chạy song song (parallel) → chồng lấn nhau, user không phân biệt được từng beat.  
Dùng `setTimeout` hardcode để "đợi" animation → fragile: device chậm / lag spike → vanish / popup bắn ra giữa lúc bloom đang chạy.

### Anti-pattern
```js
// ❌ Parallel + magic timeout
playBloom(destImg);
playBloom(promotedImg);
setTimeout(() => playVanish(), 220); // đoán mò, không đáng tin
```

### Pattern đúng — Promise Chain
```js
// ✅ Sequential, duration-agnostic
const wrap = fn => new Promise(resolve => fn(resolve));

let chain = wrap(done => playBloom(destImg, done));
for (const img of promotedImgs) {
  chain = chain.then(() => wrap(done => playBloom(img, done)));
}
if (willVanish) {
  chain = chain.then(() => wrap(done => playVanish(done)));
}
```

**Tại sao Promise chain > callback chain:**
- Flat, dễ thêm/bớt bước (chỉ thêm `.then()`)
- Không có callback pyramid
- Duration-agnostic: bước sau chỉ chạy khi bước trước gọi `resolve`

**Tại sao sequential > parallel cho game feel:**
- Parallel bloom = rẻ tiền, user không track được cái gì vừa xảy ra
- Sequential = cause & effect rõ ràng: *bông đáp → nở → promoted nở → vanish*
- Mỗi beat có trọng lượng riêng

### Áp dụng trong KVTM
- **Bloom → Vanish**: `bloom(dest) → bloom(promoted×N) → vanish → settle → checkEndGame`
- **Win sequence**: `playWinCelebration(onDone) → _sbSpawnStarFly(onDone) → show popup`

### Rule
> Mọi animation có visual weight đều phải có `onDone` callback.  
> Mọi sequence của animations phải dùng Promise chain, không dùng `setTimeout` magic number.

---

## 2. Pot Position — Tránh Conflict giữa CSS Transform và Animation

### Vấn đề
Dùng `transform: translateX(-50%)` để center pot → conflict với `sbLandBounce` animation cũng dùng `transform: translateY/scale` → pot jitter khi animation kết thúc.

### Fix
Dùng `margin-left: calc(var(--sb-pot-w) / -2)` để center thay vì transform.  
`sbLandBounce` chỉ dùng `transform` → không còn conflict.

### Rule
> Nếu element có CSS animation dùng `transform`, KHÔNG dùng inline `transform` để positioning.  
> Dùng `margin`, `left/top + negative margin`, hoặc `translate` riêng biệt qua CSS var.

---

## 3. Image Optimization — WebP + Resize to Display Size

### Kết quả
- PNG gốc: ~29MB → WebP quality 78-82: ~4MB (86% smaller)
- Resize về display size (flowers: 200px, bloom sheets: 600px): thêm 86% nhỏ hơn
- Tổng: 53x nhỏ hơn so với gốc (545KB)

### Rule
> Mọi asset phải convert sang WebP.  
> Resize về **display size × 2** (2x cho retina), không để ảnh gốc 2000px cho element 82px.

---

## 4. potLayout — Dev Server để Sync Data

### Vấn đề
`potLayout` chỉ lưu trong `localStorage` → không lên được GitHub Pages.

### Giải pháp
Dev server (`scripts/dev-server.js`) với endpoint `POST /api/save-levels`:
- Nhận levels JSON
- Ghi thẳng vào `engine/sort_blossom_data.js` (replace SORT_BLOSSOM_LEVELS block)
- Optionally `git add + commit + push`

### Rule
> Data cần persist qua deploy → phải ghi vào source file, không lưu localStorage.  
> Dùng dev server pattern cho workflow: editor → save → auto push.

---

## 5. readyColors — Computed Once per State Change

### Pattern
```js
let readyColors = new Set();

function getReadyColors(state) {
  const ready = new Set();
  for (const pot of state) {
    const flowers = pot.active.filter(x => x !== null);
    if (flowers.length === 2 && flowers[0] === flowers[1]) ready.add(flowers[0]);
  }
  return ready;
}

function repaint() {
  readyColors = getReadyColors(state); // tính 1 lần duy nhất
  // ... render
}
```

State chỉ thay đổi sau move / vanish / undo — tất cả đều kết thúc bằng `repaint()`.  
→ Không bao giờ stale, không tính duplicate.

### Dùng để
- Phase 1 tap: ưu tiên chọn hoa có màu trong `readyColors` thay vì nearest occupied
- Tương lai: hint highlight, suggest moves

---

## 6. Tap UX — Same Pot Logic

### Behavior đã đồng ý
| Tình huống | Điều kiện | Hành vi |
|---|---|---|
| TH1 | Tap đúng bông đang cầm (same pot + same pos) | Cycle sang hoa khác trên pot; nếu không có → deselect |
| TH2 | Tap slot có hoa, khác pos, cùng pot | Reselect hoa đó (như cũ) |
| TH3 | Tap slot rỗng cùng pot | Cycle sang hoa còn lại; nếu không có → deselect |

### Rule
> Không bao giờ deselect ngay khi còn hoa khác trên cùng pot.  
> User luôn có cơ hội cycle trước khi mất selection.

---

## 7. Dev Server — Các Lỗi Hay Gặp

### 7a. Regex lazy match cắt sai closing bracket
```js
// ❌ Lazy match — dừng ở ] đầu tiên bên trong array
/const SORT_BLOSSOM_LEVELS\s*=\s*\[[\s\S]*?\];/

// ✅ Bracket depth tracking
let depth = 0, end = -1;
for (let i = arrStart; i < src.length; i++) {
  if (src[i] === '[') depth++;
  else if (src[i] === ']') { depth--; if (depth === 0) { end = i; break; } }
}
```
**Nguyên nhân:** Data có nested arrays như `active: [null, null, null]` → lazy `?` dừng ở `]` đầu tiên.

### 7b. Test server bằng empty payload làm corrupt data file
Khi test `POST /api/save-levels` với `levels: []` → server ghi file với 0 levels → data bị xóa sạch.  
**Rule:** Không bao giờ test server save endpoint với `levels: []`. Dùng `autoPush: false` khi test.

### 7c. "Replacement produced no change" false-negative
Server check `if (newContent === existing) throw Error(...)` để detect replace fail.  
Nhưng nếu editor gửi đúng content đang có trên disk → throw sai → 400.  
**Fix:** Bỏ check này. Write file luôn, không cần check equality.

### 7d. Browser cache cũ sau khi sửa editor
Editor HTML được serve từ dev-server. Sau khi sửa file, browser vẫn dùng cache cũ.  
**Fix:** Ctrl+Shift+R (hard reload) trên tab editor.

### 7e. Closure scope — biến trong onLand không accessible từ onDone
```js
// ❌ r chỉ sống trong onLand closure
Render.animateFlight({
  onLand: () => {
    const r = Engine.applyMovePlace(...); // r chỉ có ở đây
  },
  onDone: () => {
    if (!r.willVanish) checkEndGame(); // ❌ ReferenceError: r is not defined
  }
});

// ✅ Hoist ra scope chung
let moveResult = null;
Render.animateFlight({
  onLand: () => {
    const r = Engine.applyMovePlace(...);
    moveResult = r; // gán ra ngoài
  },
  onDone: () => {
    if (!moveResult?.willVanish) checkEndGame(); // ✅
  }
});
```
**Rule:** Biến cần share giữa multiple callbacks phải được khai báo ở scope bao ngoài tất cả callbacks đó.

---

## 8. Rule Promote Animation Flow — Bud → Bloom → Flower

### Vấn đề
Khi flower từ queue được promote lên active slot, code paint frame 9 (full bloom) ngay → user thấy "nụ → bông (sai flash) → bloom anim → bông". Visual không match semantic: slot CHƯA play bloom thì không nên là bông.

### Rule (đặt tên: **Rule Promote Animation Flow**)
> Slot nào CHƯA play bloom animation thì phải hiện **NỤ** (frame 0).
> Slot nào ĐÃ play xong bloom mới được hiện **BÔNG** (frame 9).

### Hai paths cần áp dụng

**Path 1 — Move → onLand → promote:**
- User di chuyển bông từ src → dest → vacated src slot → promote từ queue
- Promoted slot phải hiện NỤ → chờ bloom chain → animate nụ→bông

**Path 2 — Match → vanish → settle → cascade promote:**
- 3 bông cùng màu trên 1 pot → vanish → settle() promote tất cả từ queue
- ALL active slots vừa promote phải hiện NỤ → chờ bloom chain → animate nụ→bông

### Implementation
```js
// 1. paintActive nhận bloomBuds Set — slot nào trong set sẽ mark data-bud='1'
function paintActive(cell, pot, assetPath, bloomBuds) {
  [0,1,2].forEach(p => {
    const cv = document.createElement('canvas');
    cv.dataset.color = pot.active[p];
    if (bloomBuds && bloomBuds.has(p)) cv.dataset.bud = '1';
    flowersEl.appendChild(cv);
  });
  upgradeActiveFlowers(cell, assetPath);
}

// 2. upgradeActiveFlowers: data-bud=1 → frame 0, else → frame 9
function upgradeActiveFlowers(cell, assetPath) {
  cell.querySelectorAll('canvas.sb-active-flower').forEach(cv => {
    const isBud = cv.dataset.bud === '1';
    _probeBloom(color, assetPath, (cached) => {
      if (isBud) drawFrame0(cv, cached);
      else drawFrame9(cv, cached);
    });
  });
}

// 3. _bloomSheet end: redraw frame 9 + clear data-bud (chuyển nụ → bông)
function _bloomSheet(imgEl, ...) {
  // ... overlay animation 0→9 ...
  // at end:
  imgEl.getContext('2d').drawImage(sheet, ...frame9Rect, 0, 0, w, h);
  delete imgEl.dataset.bud;
  onDone();
}
```

### Exception — placed flower KHÔNG phải nụ
Bông fly-in vào destPot/placePos là **bông sẵn** (đã bloomed lúc cầm từ src). Không cần state nụ. `playBloom` (A/B/C/D variants) là celebration effect (particles, scale pop) — fade in từ opacity:0 trên frame 9 sẵn có.

### Rule
> `paintActive(cell, pot, assetPath, bloomBuds)` — `bloomBuds` chỉ chứa **promoted slots** (queue → active), KHÔNG chứa placePos.
> `_bloomSheet` phải redraw frame 9 + clear `data-bud` ở cuối animation.

---

## 9. Bud Canvas Sizing — Tránh Negative yOff Clip

### Vấn đề
`upgradeQueueBuds` cũ: canvas height = `frame9_h`, draw bud (frame 0) với `yOff = 0.95*(frame9_h - bud_h)`.

Trong sprite sheets, bud (frame 0) thường **NARROWER** nhưng **TƯƠNG ĐỐI CAO HƠN** frame 9. Khi scale về display width:
- R bud (75×114) → display 85px: dh0 = 129px
- R frame 9 (97×126) → display 85px: hLast = 110px
- → `yOff = 0.95*(110-129) = -18px` ← âm
- → Bud vẽ từ y=-18 → top 18px của bud nằm NGOÀI canvas → đầu nụ bị clip

### Fix
```js
const hLast = Math.round(w * shL / swL);   // frame 9 height
const dh0 = Math.round(w * sh / sw);        // bud height
const h = Math.max(hLast, dh0);             // canvas tall enough for full bud
const yOff = h - dh0;                       // ≥ 0 always
cv.width = w; cv.height = h;
ctx.drawImage(sheet, sx, sy, sw, sh, 0, yOff, w, dh0);
```

### Stem alignment trade-off
Bud canvas có thể cao hơn flower canvas. CSS `transform-origin: 50% 95%` → pivot at `0.95*h`. Pivot khác nhau giữa bud (`0.95*max(h,dh0)`) và flower (`0.95*hLast`). Khác biệt ≈ 1-2px (5% của difference) → chấp nhận được.

### Rule
> Khi vẽ bud từ sprite có aspect ratio khác frame 9: canvas height = `max(frame9_h, bud_h)`, yOff = `h - bud_h`. KHÔNG dùng formula `0.95*(h-dh0)` vì có thể âm.

---

## 10. CSS Bud Transform — KHÔNG inherit oy của flower

### Vấn đề
Bud (`sb-queue-preview`) ban đầu dùng cùng transform với active flower:
```css
.sb-queue-preview canvas[data-pos="1"] {
  transform: translateX(-50%) translateY(var(--sb-s1-oy, 0px)) rotate(0deg) scale(...);
}
```
Flower có `--sb-s1-oy: -3px` (translateY UP 3px để fine-tune position). Bud dùng cùng oy → bud cũng dịch UP → bud đứng GẦN HOA CHÍNH, không peek BEHIND như intended.

User screenshot: nụ float ở top-center, đáng ra phải nằm sau hoa và lò ra từ dưới chân.

### Fix
```css
/* Buds: same x/rotation/scale as flower slot, but NO oy offset.
   Bud stays at natural stem-aligned bottom:0 position so it peeks out from
   BELOW the active flowers, not at the same height as their heads. */
.sb-queue-preview canvas[data-pos="1"] {
  transform: translateX(-50%) rotate(0deg) scale(var(--sb-s1-sc, 1));
  /* NO translateY — bud sits at natural bottom:0 */
}
```

### Rule
> Active flowers và buds dùng CHUNG `ox/scale/rotation` (vị trí X + góc), nhưng **không chung `oy`**. Bud luôn ở `bottom:0` tự nhiên.

---

## 11. CSS `--sb-pot-h` đủ Cao cho Flower + Bud Containment

### Tính toán bắt buộc
```
pot-h ≥ flower-bottom + active-h + max(|oy|)
```

Default compact:
- flower-bottom = 40, active-h = 110, max |oy| = 7 (s0-oy: -7px)
- → pot-h ≥ 157px → set **160px** (margin 3px)

Cũ là 123px → `active-flowers` top = 123-40-110 = **-27px** từ pot-visual top → overflow lên trên → bị parent's `overflow:hidden` (game's flex container `cont` hoặc tool's `right` panel) cắt.

### Rule
> `pot-h` phải đủ chứa toàn bộ `active-h` + flower-bottom + max oy offset. Bất kỳ thay đổi nào tới `active-h` hoặc `oy` đều phải re-check `pot-h`.

---

## 12. Bloom Flash During Flight — paintActive bloomBuds Skip

### Vấn đề
Lúc flight (~500ms), `paintActive` đã chạy onLand → tạo canvas placePos với frame 9 (full bloom) ngay → user thấy "bông sẵn ở đích" trong khi clone vẫn đang bay tới.

### Fix bằng `data-bloom-pending`
1. `paintActive` mark placePos canvas `data-bloom-pending='1'` 
2. `upgradeActiveFlowers` SKIP canvas có `data-bloom-pending` → canvas blank suốt flight
3. `playBloom` start → `delete data-bloom-pending` + gọi `upgradeActiveFlowers` để vẽ frame 9 → animation `_bloomA/B/C/D` ngay sau đó (first keyframe `opacity:0`) → frame 9 không lộ ra

### Important — KHÔNG dùng skip cho promoted slots
Promoted slots dùng `_bloomSheet` đã set `imgEl.style.opacity='0'` synchronously trước khi paint → không có flash. Dùng `data-bud` thay cho `data-bloom-pending` → vẽ frame 0 đúng nghĩa.

### Rule
> `data-bloom-pending` = canvas blank cho đến khi `playBloom` ready (placePos only).
> `data-bud` = canvas vẽ frame 0 ngay (promoted slots).
> Hai khái niệm khác nhau, KHÔNG được trộn.

---

## 13. Sequential Bloom Chain với Multi-Promote

### Vấn đề trước khi hiểu Rule Promote Anim Flow
Khi 3 slots cùng promote (vd: match→vanish→all 3 refill), bloom chạy tuần tự (slot 0 → slot 1 → slot 2). Mỗi bloom ~900ms → 2.7s tổng. Nếu slots 1, 2 blank trong khi slot 0 animate → user thấy "2 hoa kề bên biến mất".

### Fix — slots chờ vẫn hiện nụ
Tất cả promoted slots mark `data-bud` → upgradeActiveFlowers vẽ frame 0 → user thấy "3 nụ đang chờ". Slot 0 bloom (nụ→hoa). Slot 1 vẫn là nụ. Slot 0 done → vẽ frame 9. Slot 1 bloom. v.v.

Visual timeline đúng:
```
[nụ][nụ][nụ] → [bông][nụ][nụ] → [bông][bông][nụ] → [bông][bông][bông]
```

### Rule
> Trong sequential bloom chain, non-animating promoted slots vẫn phải là nụ (visual coherent), không blank.

---

## 14. Cache Bust khi Sửa Engine/CSS

### Vấn đề
Game HTML reference engine với version query:
```html
<link rel="stylesheet" href="engine/sort_blossom.css?v=9">
<script src="engine/sort_blossom_render.js?v=31"></script>
```

Browser cache theo URL (bao gồm query string). Sửa CSS/JS nhưng quên bump version → user vẫn dùng version cũ → bug "đã fix rồi mà vẫn xảy ra".

### Rule
> Mỗi lần edit `engine/sort_blossom_*.{css,js}` phải bump version trong tất cả HTML references:
> - `kvtm_2_0_game.html`
> - `tools/level_editor.html`
> - `tools/bloom_test.html`

---

## 15. Global Speed Knob qua localStorage

### Pattern
Cho phép tune real-time mà không cần save vào source code:
```js
// Read at runtime
let _bloomMul = 1;
try {
  const stored = localStorage.getItem('kvtm_bloom_speed');
  if (stored) _bloomMul = parseFloat(stored) || 1;
} catch(e) {}
const FRAME_DUR = base_dur * _bloomMul;

// Public API on window
window._setBloomSpeed = function(v) {
  localStorage.setItem('kvtm_bloom_speed', String(v));
};
```

### Use cases
- `_setBloomSpeed(2)` → 2× chậm hơn (debug)
- `_setBloomSpeed(0.5)` → 2× nhanh hơn
- Persists across reload (localStorage)
- Áp dụng ngay lần animation kế tiếp, không cần reload

### Rule
> Mọi parameter có thể cần tune nhanh (speed, scale, duration) → expose qua `_setX/_getX` console + localStorage. Save cuối cùng vào source khi happy.

---

## 16. AudioContext / Vibrate Warnings — Skip Boot Autoplay

### Vấn đề
Chrome chặn `AudioContext.resume()` và `navigator.vibrate()` trước khi user gesture. Code boot → `_kvtmBoot → goto('splash')` → `Sfx.play('tap') + Haptic.tap()` → 2 warnings spam console.

### Fix
```js
const old = stage().querySelector('.scene');
// Skip tap sound/haptic on initial boot (no previous scene) — avoids
// Chrome autoplay-policy warnings before user has interacted with page.
if (old) {
  Sfx.play('tap');
  Haptic.tap();
}
```
Lần đầu `goto`: `old === null` → skip. Sau đó user đã tap rồi: `old` exists → phát bình thường.

### Rule
> Sound/haptic chỉ phát khi có user interaction trước đó. Boot/initial transitions phải skip.

---

## 17. Per-Slot CSS Variables — Tránh Unified Approach

### Anti-pattern
Lúc cần fine-tune từng slot L/C/R riêng, có cám dỗ dùng 1 SLOT_VARS chung apply cho cả 3 slots:
```js
const SLOT_VARS = { ox: 0, oy: 0, sc: 1 };  // ❌ shared
[0,1,2].forEach(i => compact.style.setProperty(`--sb-s${i}-ox`, SLOT_VARS.ox + 'px'));
```
→ User mất khả năng tune L riêng với R.

### Pattern đúng
```js
const SLOT_VARS = [
  { slot: 0, label: 'L', ox: 8,  oy: -5, sc: 0.85 },
  { slot: 1, label: 'C', ox: 2,  oy:  17, sc: 1.00 },
  { slot: 2, label: 'R', ox: -9, oy:  0,  sc: 0.85 },
];
SLOT_VARS.forEach((sv, i) => {
  compact.style.setProperty(`--sb-s${i}-ox`, sv.ox + 'px');
  compact.style.setProperty(`--sb-s${i}-oy`, sv.oy + 'px');
  compact.style.setProperty(`--sb-s${i}-sc`, String(sv.sc));
});
```

### Rule
> Mỗi visual slot phải có data store độc lập. Layout tool phải có sliders riêng từng slot.

---

## 18. Canvas Width = Stable maxH Across Frames

### Vấn đề
Khi animate canvas qua frames có aspect ratio khác nhau, nếu mỗi frame `cv.width=w; cv.height=h_per_frame` → canvas size jumps mỗi frame → display height đổi → vị trí trên màn hình rung.

### Fix
Pre-compute max canvas height across **TẤT CẢ frames** một lần. Set canvas size cố định. Mỗi frame vẽ bottom-aligned trong canvas đó:
```js
let maxH = 0;
frames.forEach(fr => {
  const h = Math.round(w * fr.h / fr.w);
  if (h > maxH) maxH = h;
});
cv.width = w; cv.height = maxH;

function drawFrame(fr) {
  const dh = Math.round(w * fr.h / fr.w);
  const yOff = maxH - dh;  // bottom-align in stable canvas
  ctx.clearRect(0, 0, w, maxH);
  ctx.drawImage(sheet, fr.x, fr.y, fr.w, fr.h, 0, yOff, w, dh);
}
```

### Rule
> Canvas animate qua nhiều frames → tính `maxH` một lần ngoài loop. KHÔNG resize canvas mỗi frame.

---

## 19. Frame Order Đổi khi Save → Phải Read-Back

### Pattern
Tool save `_BLOOM_RECTS[color]` qua server. User có thể đã reorder frames trong tool trước khi save. Sau khi save, không reload tool → tool's in-memory state có thể stale.

### Rule
> Sau save thành công, optionally re-fetch data từ server để sync tool state. Hoặc warn user "đã save, reload tool để verify".

---

## 20. Engine.settle() Cascade — Chỉ Animate State Cuối

### Vấn đề
`Engine.settle(state)` chạy while loop:
```
vanish → promote → triple lại? → vanish → promote → ...
```
Trả về `{vanished, promoted}` — promoted có thể là cùng pot multiple times.

### Quyết định thiết kế
Chỉ animate state CUỐI CÙNG (sau toàn bộ cascade). Intermediate states không hiển thị (user không xem được cascade detail anyway). Lý do:
- Animating cascade tốn nhiều giây
- User chỉ quan tâm "match xong, có gì mới"
- Cascade rare trong gameplay thực

### Implementation
```js
const settled = Engine.settle(state);  // all cascades done
const postBudsMap = new Map();
new Set(settled.promoted).forEach(pi => {  // dedup pots
  const buds = new Set();
  state[pi].active.forEach((color, posi) => { if (color) buds.add(posi); });
  if (buds.size > 0) postBudsMap.set(pi, buds);
});
// Animate the final state's buds
```

### Rule
> Cascade operations (settle, undo all, mass-update) → snapshot final state, animate once. Đừng đệ quy animate từng step.

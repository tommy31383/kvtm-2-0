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

---

## 21. Visual Envelope ≠ Geometric Bbox (rotation pivot matters)

### Vấn đề
Layout planning chỉ dùng pot bbox 114×160 → quên rằng bông xòe ra ngoài bbox khi có `rotate()` + `transform-origin` không phải center. Side flower `width:85, scale 0.85, rotate ±43°, origin 50% 95%` (gốc stem ở đáy) làm đầu bông swing xa khỏi pot bbox.

### Đo thực, đừng đoán
```js
// scripts/measure-bloom-envelope.js
// 1. Read PNG alpha → tight visual rect in canvas pixels (skip transparent pad)
// 2. Scale to CSS display dims (--sb-flower-w-side, etc.)
// 3. Apply transform chain: translate(O) * scale(sc) * rotate(θ) * translate(-O)
// 4. Project 4 corners → pot cell coords → max(L/R/T/B) overflow
```

### Kết quả thực đo (.sb-compact)
| Slot | Center offset | Bbox overflow |
|---|---|---|
| Pos 0 (left, rotate -43°) | +1px | **+36px left** |
| Pos 1 (mid, no rotate) | +7px | 0 |
| Pos 2 (right, rotate +43°) | +16px | **+52px right** |

→ Effective W = 202px (vs geometric 114). Asymmetric vì `stem_x=4` lệch tâm.

### Rule
> Khi visual có rotation quanh pivot ≠ center, bbox geometric KHÔNG đại diện visual extent. Pattern: measure script đọc alpha PNG + apply CSS transform math → output thực số → save vào JSON. Constants trong code reference JSON (single source of truth).

---

## 22. BFS State Space Explosion với Queue Order

### Vấn đề
Sort blossom có queue FIFO → queue order matter cho state encoding. State space ~`O((flowers!)^pots)` cho high-Q levels. BFS 500K states timeout ở L7 (3c, 4p, Q=3).

### Solution: Iterative BFS (commit partial + replan)
```js
// Per auto-play step:
const r = bfsSolveWithPath(state, 80000);
if (r.solved) {
  pendingPath = r.path;          // full win path
} else if (r.path) {
  pendingPath = r.path.slice(0, 3); // commit first 3 of partial, then re-plan
}
```

`bfsSolveWithPath` returns `{solved, path}`:
- `solved=true`: found WIN, path = full solution
- `solved=false, path !== null`: budget exhausted, path = best leaf (lowest flower count) so far
- `path = null`: deadlock from current state

### Tại sao iterative thắng one-shot
Mỗi lần replay xong partial path, flowers giảm → state space NEXT round nhỏ hơn → eventually solvable. Test: L7 solve trong 7 BFS calls × ~1s = 7s; L30 solve trong 19 calls × ~1.2s = 23s.

### Rule
> Khi state space lớn, BFS one-shot từ start không khả thi. Iterative re-plan từ state hiện tại + commit partial path là sweet spot: optimal cho small subproblems, best-effort cho large.

---

## 23. Animation Overlap Tạo "Ghost" Perception

### Vấn đề
User report "ghost flower" sau khi move bông: bông cũ vẫn xuất hiện ở chậu cũ rồi biến mất nhanh.

Root cause: `_fadeOutSource` fade srcImg opacity 1→0 over 100ms TRONG KHI fly clone đã bắt đầu di chuyển → 2 elements cùng màu visible đồng thời ở positions gần nhau.

### Anti-pattern
```js
function _fadeOutSource(srcImg) {
  srcImg.style.transition = 'opacity .1s';  // ❌ fade
  srcImg.style.opacity = '0';
  setTimeout(() => srcImg.style.visibility = 'hidden', 110);
}
```

### Pattern đúng
```js
function _fadeOutSource(srcImg) {
  srcImg.style.visibility = 'hidden';  // ✅ instant
}
```

Fly clone tại CHÍNH vị trí source với full opacity → seamless takeover, không gap visual.

### Rule
> Khi transfer visual ownership giữa 2 elements (source → clone, cell → overlay), HIDE source INSTANT, không fade. Fade tạo overlap window mà user nhìn thấy 2 copies → "ghost" perception. Crossfade chỉ OK khi 2 elements ở positions KHÁC NHAU.

---

## 24. localStorage Cache Mask File Updates

### Vấn đề
Game đọc level data ưu tiên từ `localStorage` (editor "Push to Game" lưu vào đó) → khi file `sort_blossom_data.js` đổi shape (thêm id mới, xoá id cũ), browser cache cũ vẫn dùng → game render placeholder "Level X chờ data".

### Pattern: version stamp invalidation
```js
const LEVELS_DATA_VERSION = '2026-05-14-curve_5_30';

function loadLevels() {
  const stamp = localStorage.getItem('kvtm2_levels_v2_stamp');
  if (stamp !== LEVELS_DATA_VERSION) {
    localStorage.removeItem('kvtm2_levels_v2');  // drop stale cache
    return SORT_BLOSSOM_LEVELS;  // fall through to file
  }
  // ... use localStorage if stamp matches
}

function saveLevels(levels) {
  localStorage.setItem('kvtm2_levels_v2', JSON.stringify(levels));
  localStorage.setItem('kvtm2_levels_v2_stamp', LEVELS_DATA_VERSION);
}
```

### Rule
> Bất kỳ cache layer nào (localStorage, IndexedDB, service worker) ưu tiên cao hơn source file phải có VERSION/STAMP. Bump stamp khi shape/ids đổi → cache auto-invalidate, user không phải clear tay.

---

## 25. Generator Deadlock-on-Init với 0-Empty Pots

### Vấn đề
Gen level với `emptyPots=0, totalFlowers = playPots × capPerPot` (exact fill) → mọi active slot full ngay từ đầu → không có nơi để place bông → AI/player stuck từ move 1.

### Anti-pattern
```js
const playPots = spec.pots;
// fills exactly: 36 flowers / 6 pots / cap=6 → all active full
```

### Pattern đúng
```js
const emptyPots = spec.emptyPots ?? 1;
const playPots = spec.pots - emptyPots;
if (emptyPots === 0 && totalFlowers >= playPots * capPerPot) {
  throw new Error(`Infeasible (emptyPots=0): no slack for initial move`);
}
// Backup: if chunking ends with all-active-full, pull last active → queue
if (emptyPots === 0 && allActiveFull(pots) && lastPot.queue.length < Q) {
  lastPot.queue.push(lastPot.active[2]);
  lastPot.active[2] = null;
}
```

### Rule
> Với 0-empty layouts, require STRICT slack (`flowers < pots × cap`) hoặc force 1 active slot empty sau chunking. Exact-fill = guaranteed dead state.

---

## 26. Routing Constants — Magic Numbers Cần Update khi Extend Content

### Vấn đề
```js
function LEVEL_TYPE(id) {
  return id <= 20 ? 'sort_blossom' : 'triple_tile';  // magic 20
}
```
Thêm L21-L30 same engine → quên update threshold → routes sang triple_tile placeholder.

### Pattern
- List/range driven routing thay vì magic numbers
- Hoặc grep `<= N` / `< N` pattern khi extend content boundaries

### Rule
> Magic number trong routing/dispatch là tech debt. Khi thêm content vượt threshold cũ, GREP toàn repo cho threshold value, update tất cả.

---

## 27. Process — Don't Unilaterally Pivot Approved Plans

### Anti-pattern (em đã sai)
1. User duyệt plan A (measure + symmetrize + sb-tighter combo)
2. Em đo thực tế thấy số lớn hơn kỳ vọng
3. Em RATIONALIZE "design intent" và pivot sang plan B (just add presets, skip CSS) **không hỏi lại**
4. User test phát hiện không fix đúng vấn đề → frustrated, mất 2 rounds

### Pattern đúng
- Khi measurement/discovery contradicts approved plan → STOP, report back, hỏi user re-confirm
- Không tự reframe "đây không phải bug" — user feedback là ground truth
- Plan pivot phải explicit và có acknowledgement

### Rule
> Khi data/discovery khác kỳ vọng plan đã duyệt, KHÔNG tự pivot. Report findings + đề xuất re-plan, chờ user OK. Defending approved plan as "intentional" làm mất thời gian cả 2 bên.

---

## 28. Test Environment Phải Mirror Production Render Path

### Vấn đề
Editor's Test Play dùng flex container; game dùng absolute từ `potLayout`. User test layout trong editor → tưởng OK → game render khác → bug only-in-prod.

### Rule
> Test play / preview environments phải dùng EXACT render path của production. Nếu game đọc `potLayout` field → editor's test play cũng phải đọc. Diverged paths = bugs only detected in prod.

---

## 29. Greedy AI Không Reliable cho Level Verification

### Vấn đề
Greedy heuristic (`+1000 vanish, +50 pair, ...`) thua L7 (level dễ). User không thể dùng tool để check "level có chơi được không".

### Solution
Iterative BFS với commit-partial-then-replan thay vì greedy:
- Small/medium levels: BFS finds optimal trong 1 call
- Large levels: budget hit → return best leaf path → commit 3 moves → re-plan
- Genuinely deadlocked: BFS returns no path → AI status = STUCK (useful feedback về level design)

### Rule
> Greedy = quick smoke test, không reliable đánh giá khó. Khi cần verify "level solvable", dùng BFS-based (full hoặc iterative). Stuck output của BFS = signal level over-tuned, cần rebalance.

---

## 30. Triple-Trigger Mount = Brute Force Smell

### Vấn đề
`requestAnimationFrame(_hubMount); setTimeout(_hubMount, 50); setTimeout(_hubMount, 200);` được dùng để "đảm bảo SVG/leaf builder chạy sau khi DOM commit". Idempotency guard giữ correctness nhưng:
- Mỗi mount thừa: 2 `getElementById` + `Lives.startTicker()` clear+restart
- Mỗi hub return: 3× cost của 1 mount

### Solution
Single RAF + 1 conditional fallback dựa trên kiểm tra mount marker:
```js
requestAnimationFrame(() => {
  _hubMount();
  if (!document.getElementById('garden-main-svg')) setTimeout(_hubMount, 100);
});
```

### Rule
> Khi thấy chuỗi RAF + setTimeout(50) + setTimeout(200) trên cùng function → brute force smell. Dùng idempotency guard + 1 fallback dựa trên marker, không spam timers.

---

## 31. Memoize SVG/HTML Templates by State Key

### Vấn đề
`buildGardenSVG` build ~250 dòng template literal + parse innerHTML mỗi lần vào hub. SVG depend on state (`slotDone[]`) nhưng state hiếm khi đổi giữa các lần re-enter hub (chỉ đổi khi complete decor task).

### Solution
Memo cache theo serialized state key:
```js
let _cache = { key: null, html: null };
const key = done.join(',');
if (_cache.key === key) { containerEl.innerHTML = _cache.html; return; }
// ...build...
_cache = { key, html: svg };
```

### Rule
> Template literal evaluation + innerHTML parse là expensive cho output > 1KB. Nếu output phụ thuộc state mà state rarely changes → memo by state key. Cache invalidation tự động qua key mismatch — no manual bust needed.

---

## 32. Router Teardown Hook = Single Source for Lifecycle Cleanup

### Vấn đề
`setInterval` (level timer, typewriters, lives ticker) tự clear khi xong, NHƯNG khi user navigate mid-level via `Game.back()` → interval tiếp tục tick, decrement `_timeLeft`, query DOM `null`, fire `_triggerLose('time')` chống lại detached scene.

### Solution
Router đã có `Game.onTeardown(fn)` hook — fired trên `_mount` của scene mới. Pattern:
```js
function _startTimer() {
  _timerInterval = setInterval(() => {...}, 1000);
  if (typeof Game !== 'undefined' && Game.onTeardown) {
    Game.onTeardown(() => clearInterval(_timerInterval));
  }
}
```
Cũng dùng cho clear cached DOM refs khi scene đổi.

### Rule
> Mọi setInterval / global listener / cached DOM ref PHẢI register cleanup vào `Game.onTeardown()`. Self-clear inside callback đủ cho happy path, KHÔNG đủ cho mid-scene navigation. Router teardown là single source of truth cho scene lifecycle.


---

## 33. Multi-Variant Bloom — Nested Format Migration

### Vấn đề
1 màu = 1 bloom anim không đủ cho visual diversity. User muốn 1 màu có nhiều anim 1,2,3,... và engine picks deterministic per (potIdx, posIdx).

### Storage migration (backward compat)
- **OLD**: `_BLOOM_RECTS[c] = [[r0],[r1],...,[r9]]` (10 rect arrays)
  `_BLOOM_DURS[c] = null | number | [d0..d9]`
- **NEW**: `_BLOOM_RECTS[c] = [ [[r0..r9]], [[r0..r9]], ... ]` (array of variants)
  `_BLOOM_DURS[c] = [v0_dur, v1_dur, ...]` (parallel array)

**Auto-detection**:
```js
function _isNewVariantFormat(rectsEntry) {
  return Array.isArray(rectsEntry) && rectsEntry.length > 0
      && Array.isArray(rectsEntry[0]) && Array.isArray(rectsEntry[0][0]);
}
```
Key insight: phân biệt được ngay bằng `rectsEntry[0][0]` — old là `number`, new là `array`.

### Engine variant pick
Deterministic (NOT random) per user spec:
```js
animIdx = (potIdx * 3 + posIdx + colorCharCode % 7) % nVariants
```
Same (pot, pos, color) → always same variant → no flicker. Color salt spread across colors. Caller có thể override via `imgEl.dataset.animIdx`.

### Tool ↔ Engine sync rule
Tool's `saveToServer` LUÔN emit OLD format khi `variants.length === 1` → existing data không churn diff. Chỉ emit NEW nested khi user explicit add variant. Tool's `loadFromServer` detect cả 2 format → wrap old → single variant.

### Rule
> Khi migrate data format mà cần backward compat:
> 1. Detection helper PHẢI lossless (no ambiguous shape) — `rectsEntry[0][0]` là array hay number = phân biệt rõ ràng
> 2. Cache layer phải normalize TẤT CẢ thành new format, expose old-format aliases cho consumers chưa update
> 3. Save path emit old format khi data fit old format → minimize git diff
> 4. Migration helper PHẢI có unit tests cho cả 2 format + edge cases (empty, null, missing entries)


---

## 34. Per-Color Anim Roles (Bloom / Nụ / Bông)

### Vấn đề
Tool ban đầu chỉ có 1 sprite sheet với 10 frames cho cả 3 trạng thái: nụ (frame 0), transition (frames 1-8), hoa nở (frame 9). Game render pluck frame 0 cho nụ và frame 9 cho hoa từ cùng 1 anim → animator không thể vẽ idle anim riêng cho nụ (rung, lay) hoặc bông (breathing).

### Solution
Convention 3 variant slots theo index trong `_BLOOM_RECTS[color]`:
- `variants[0]` = **Bloom** — transition nở (10 frames, dùng cho `_bloomSheet`)
- `variants[1]` = **Nụ** — idle bud (≥1 frame, dùng cho `upgradeQueueBuds`). Loop nếu ≥2 frames.
- `variants[2]` = **Bông** — idle bloomed (≥1 frame, dùng cho `upgradeActiveFlowers`). Loop nếu ≥2 frames.
- `variants[3+]` reserved.

Engine helper `_pickByRole(cached, role)` trả về variant theo role với **lossless fallback**: nếu role variant thiếu (data cũ chỉ 1 variant) → synth 1-frame "anim" từ Bloom (frame 0 cho Nụ, last frame cho Bông). Existing data → no visual change.

### Idle loop implementation
Shared `_startIdleLoop(cv, variant, drawFrameFn)`:
- 1 frame → draw once, no timer (zero ongoing cost)
- ≥2 frames → setTimeout chain, exits khi `cv.isConnected === false`
- `cv._loopId` flag để re-entry cancel cleanly

Lưu ý cleanup: KHÔNG cần MutationObserver. Mỗi tick check `cv.isConnected` đủ — khi cell remove khỏi DOM, tick tiếp theo sẽ early-return + GC.

### Tool integration
- Dropdown anim picker label theo role: "1 - Bloom", "2 - Nụ", "3 - Bông", "4", "5", ...
- Pot preview pick variant đúng role: bud canvas dùng `variants[1][0] || variants[0][0]`, flower dùng `variants[2][0] || variants[0][last]`
- Hint hiển thị fallback status: `🌱 Nụ:fallback(Bloom f0)` khi chưa có anim Nụ

### Rule
> Khi đặt convention "role-based slot" trên array (variant 0 = X, 1 = Y, 2 = Z):
> 1. PHẢI có fallback lossless về role primary (variant 0) khi role variant thiếu
> 2. Helper `_pickByRole` PHẢI là single source — không cho phép caller index trực tiếp `variants[1]` (dễ quên fallback)
> 3. Tool UI label theo role (số kèm tên) → animator không nhầm thứ tự
> 4. Engine reserved index (3+) IGNORE silently — tool có thể tạo, future feature dùng


---

## 35. Atlas + Module + Anim Pattern (Phase 1) — `_BLOOM_DATA`

### Background — engines researched
- **Phaser/PIXI** texture atlases: named frame regions + ordered animation refs
- **Aseprite**: slices (modules) + tags (anim ranges)
- **Spine**: atlas regions + slot attachments + skeleton animations
- **DragonBones**: texture regions + display indices per slot + timeline
- **TexturePacker**: frame entries + sourceSize/pivot/trim

**Common principle (3 layers):** Module (named rect) → Frame (module ref + dur + transform) → Anim (frame sequence + loop).

### Vấn đề trước Phase 1
`_BLOOM_RECTS[c]` chứa rects inline per anim. Multi-anim (Bloom/Nụ/Bông) → mỗi anim duplicate rect coords → diff thay đổi 1 rect phải sửa N chỗ. Không reusable, không scale.

### Solution — `_BLOOM_DATA` format
```js
_BLOOM_DATA[color] = {
  modules: {
    <moduleId>: { x, y, w, h, [dx, dy] },  // single source of truth for rect
    ...
  },
  anims: {
    bloom:  [{m: <moduleId>, d: <ms>}, ...],   // role index 0 — transition
    bud:    [{m: <moduleId>, d: <ms>}, ...],   // role index 1 — idle bud
    flower: [{m: <moduleId>, d: <ms>}, ...],   // role index 2 — idle full bloom
    <custom>: [...],                            // appended at idx ≥3
  }
}
```

### Engine integration (zero-disruption)
`_probeBloom(color)` flow:
1. Try `_BLOOM_DATA[color]` → `_bloomDataToVariants()` converts to `variants[]` shape (same as Phase 0 multi-variant). Downstream consumers (`upgradeQueueBuds`, `upgradeActiveFlowers`, `_bloomSheet`) **không cần đổi**.
2. Fallback to `_BLOOM_RECTS[color]` legacy path khi `_BLOOM_DATA[color]` missing.
3. Cache normalize: durations qua `migrateBloomDurs`, aliases `rects/durations` cho consumer cũ.

### Migration safety
- `_BLOOM_DATA = {}` mặc định empty → 100% colors fallback to legacy → **no visual change** trong game
- Tool save lazy migration: chỉ khi user save 1 màu → màu đó được ghi vào `_BLOOM_DATA`. Legacy stays as backup.
- Dev-server `replaceColorLine` extended với insert-if-missing logic để handle empty `_BLOOM_DATA` block.

### Tool side (Phase 1 — UI unchanged)
- Internal vẫn dùng `variants[][]` (frame arrays per anim role)
- Save: build modules+anims object qua `_buildBloomDataObject` — synthesize module IDs `bloom_0`, `bloom_1`, `bud_0`... (no dedup yet)
- Load: detect `_BLOOM_DATA` block trong render.js → flatten modules+anims back to variants[]
- Dropdown label vẫn `1 - Bloom / 2 - Nụ / 3 - Bông`

### Phase 2 (TODO)
- Tool 3 tabs: 📦 Modules editor (define/rename/delete) + 🎬 Anims composer (drag modules into sequence) + 🪴 Layout preview
- Real module reuse — animator vẽ "bud_a" 1 lần, dùng trong cả Bloom[0] và Nụ idle
- Rect change 1 module → tất cả anims dùng module đó tự update

### Rule
> Khi schema migrate sang structured/normalized format (atlas pattern):
> 1. Engine resolver phải produce SAME output shape downstream → consumers zero-touch
> 2. Lazy per-record migration — không touch hết data 1 lần, để user opt-in từng record
> 3. Dual-write phase 1: tool emit cả new + legacy → revert dễ
> 4. Round-trip tests: builder(tool) → resolver(engine) → equality check
> 5. Phase 1 = format only (UI giữ nguyên). Phase 2 = UI mới khai thác abstraction


---

## 36. Phase 2 — Modules Tab + Auto-Dedup

### What ships
- **Internal state**: `modules` registry per color + frame.modId refs in variants. `_rebuildModulesFromVariants` dedups by rect signature, preserves existing IDs khi sig khớp.
- **Tab Modules**: sheet view với module overlays, list panel (thumbnail + name + ref count), edit pane (x/y/w/h/dx/dy). Edit module → auto-propagate cho mọi frame ref → mọi anim update.
- **Auto-dedup button**: re-run rebuild, gộp identical rects across anims thành 1 shared module.
- **Anim tab**: timeline card hiển thị `F<n>·<modId-suffix>` để thấy module nào đang dùng.
- **Save**: `_buildBloomDataObject` chỉ emit modules thực sự được anim ref (loại bỏ orphans).

### Bugs caught trong code review
1. **ID collision risk**: `_rebuildModulesFromVariants` reset `_moduleSeq = 0`, sau đó `_newModuleId('mod')` có thể trả ID đã tồn tại nếu file load preserved 1 ID khớp. Fix: `_newModuleId` retry loop `while (id in modules)`.
2. **Module library clobber sau load**: `_setVariants` chạy `_rebuildModulesFromVariants` ngay sau khi load path đã populate `modules` từ file. Test trace OK vì preserve logic chạy đúng — sig match → keep ID + rebuild module entry với same coords. Document để future-me không nhầm.

### Rule
> Khi maintain shared registry (modules, named slots, ID pool):
> 1. ID generator PHẢI defensive check existence — không trust counter alone, đặc biệt sau reset/rebuild
> 2. Rebuild functions phải IDEMPOTENT — chạy 2 lần cho same input → same output. Test bằng cách call back-to-back.
> 3. Preserve user identity khi sig match — không churn IDs giữa save/load → git diff sạch
> 4. UI affordance phải show count of refs cho mỗi module → user biết tác động khi edit (1 module với 10 refs = edit ảnh hưởng 10 frames)


---

## 37. Shared-rAF Idle Anim Scheduler (replaces setTimeout chain)

### Vấn đề trước
`_startIdleLoop` dùng setTimeout chain per cell. Với 10 pots × 3 slots × 2 (bud+flower) = ~60 timers chạy độc lập:
- **Drift accumulates** per cell → desync giữa same-color buds
- **No VSync alignment** → tear/skip
- **Tab hidden vẫn tick** (Chrome throttles 1Hz, không pause full)
- **No catch-up** sau browser lag
- **N timers** trong event loop

### Solution — Industry pattern (Phaser/PIXI/Spine/DragonBones)
Single shared `requestAnimationFrame` driving Set registry:
- `_idleTickAll(now)` iterates registry, gọi `inst._tick(now)` mỗi instance
- Each instance tracks `(frameIdx, frameStart, lastDrawn)`
- Tick computes elapsed từ absolute clock → no drift
- **While-loop catch-up** advance multiple frames nếu browser lagged
- **Safety cap 64** prevent runaway loop sau tab-paused-for-years
- **lastDrawn skip** → `drawImage` chỉ khi frame actually changed
- **Auto-unregister** khi `cv.isConnected === false`
- **Speed multiplier** `_idleSpeed` global cho debugging
- **Pause hook** `_idlePaused` cho slo-mo / debugging

### Benefits measured
| Aspect | Before | After |
|---|---|---|
| Timer count | N timers | 1 rAF |
| VSync alignment | ❌ | ✅ |
| Tab hidden | 1Hz throttle (waste) | Full pause |
| Drift | Per-cell accumulates | None |
| Catch-up | None | While-loop |
| Skip redraw | Every tick redraws | Only when frame changed |
| Global control | None | `_setIdleSpeed`, `_pauseIdleAnims` |

### Code pattern
```js
const _idleRegistry = new Set();
let _idleRafId = null;
function _idleTickAll(now) {
  if (!_idlePaused) _idleRegistry.forEach(inst => inst._tick(now));
  _idleRafId = _idleRegistry.size ? requestAnimationFrame(_idleTickAll) : null;
}
class _IdleAnim {
  constructor(cv, variant, drawFn) {
    /* register + immediate draw frame 0 */
  }
  _tick(now) {
    if (!this.cv.isConnected) { this._dispose(); return; }
    // Catch-up while-loop with safety cap
    while (now - this.frameStart >= dur && safety-- > 0) {
      this.frameStart += dur;
      this.frameIdx = (this.frameIdx + 1) % rects.length;
    }
    if (this.frameIdx !== this.lastDrawn) {
      this.drawFn(rects[this.frameIdx]);
      this.lastDrawn = this.frameIdx;
    }
  }
}
```

### Pitfalls avoided
1. **Drift via absolute time**: `frameStart += duration` (not `frameStart = now`) → next frame's elapsed measured from EXPECTED start, không phải actual rAF time → no compounding drift
2. **Safety cap on while-loop**: tab paused 10 phút → 60000ms / 90ms = 666 advances. Cap 64 prevents long pause from spike on resume.
3. **Single-frame variants dispose immediately**: nếu variant chỉ 1 frame → draw once trong ctor + auto-unregister. Zero ongoing cost — match old static path.
4. **Race-safe re-binding**: ctor checks `cv._idleAnim` và `_dispose()` instance cũ trước register. Re-run `_startIdleLoop` trên cùng canvas → no leak.

### Rule
> Khi cần idle/loop animation cho >5 instances:
> 1. SINGLE rAF + instance registry — never per-instance setTimeout
> 2. Absolute-time tracking (`frameStart += dur`, not `= now`) — eliminates drift
> 3. Catch-up while-loop + safety cap — handles tab pause / browser lag
> 4. Skip redraw if frame index unchanged — saves drawImage calls
> 5. Auto-unregister on DOM disconnect — `cv.isConnected` check every tick
> 6. Expose global pause/speed/count hooks — invaluable for debugging visual timing


---

## 38. Explicit Pivot per Module (Atlas Anchor Point)

### Vấn đề
Rect crop của bud (nụ) và bông không cùng "stem-base Y trong rect" — bud có thể có 4px padding rỗng dưới stem, bông tight. Bottom-align mọi rect vào canvas bottom → stem PIXEL của bud sit cao hơn stem PIXEL của bông → "nụ nhô cao hơn bông".

### Solution — Explicit pivot per module
Mỗi module có optional `(px, py)` = anchor point trong module-local coords (px ∈ [0, w], py ∈ [0, h]). Default fallback: `(w/2, h)` = bottom-center → match legacy behavior, no breaking change.

**Schema**:
```js
modules: {
  "bud":    { x: 44, y: 59, w: 75, h: 114, px: 37, py: 110 },  // stem-base pixel
  "flower": { x: 480, y: 243, w: 97, h: 126, px: 48, py: 125 },
}
```

**Rect array extension** (engine internal): `[x, y, w, h, dx, dy, px, py]` — indices 6,7 optional. Legacy 6-element rects work via default fallback.

### Frame placement math
**Old**: `oy_draw = PAD + cssH - dh` (bottom-align rect bottom at canvas bottom)
**New**: 
```js
referenceY = PAD + cssH   // anchor point in canvas coords
pivotDrawY = pySheet * (dh / sh)
oy_draw = referenceY - pivotDrawY   // align frame's pivot to reference
```

With default pivot `py = sh`:
- pivotDrawY = sh * (dh/sh) = dh
- oy_draw = referenceY - dh = PAD + cssH - dh ✓ matches legacy

With explicit pivot `py = sh - 4`:
- pivotDrawY = (sh - 4) * (dh/sh) = dh - 4*scale
- oy_draw = referenceY - (dh - 4*scale) = PAD + cssH - dh + 4*scale → frame drawn 4*scale px LOWER
- Frame's pivot pixel (at py inside rect) lands at referenceY ✓ stem PIXEL aligned

### Tool UI
- **Modules tab edit pane**: thêm 2 inputs `pX, pY`. Default (greyed, opacity .6) cho đến khi explicit set. Buttons `↺ Default` (clear) và `⊥ Center-bot` (preset = w/2, h).
- **Shift+click trong rect**: set pivot tại vị trí click. Coords relative to module's top-left.
- **Pivot marker**: orange ⊕ (explicit) hoặc dim cyan ⊕ (default) trên modules sheet + center preview.
- **Center preview**: frame căn theo pivot ở canvas center (PW/2, PH/2) thay vì bottom-align → user thấy chính xác frame nào sẽ "nhảy" trong game.

### Pitfalls avoided
1. **Backward compat lossless**: rect length 6 → default pivot. Files đã save không cần migrate.
2. **Pivot save chỉ khi explicit**: `_buildBloomDataObject` skip emit `px/py` khi undefined → no churn diff for modules using default.
3. **Static path (queue/active)** also pivot-aware: canvas height = `max(refAboveExt, frameAboveExt)`. Frame drawn so pivot at canvas bottom. Below-pivot pixels clip naturally.
4. **Rotation pivot unchanged**: `_bloomSheet` rotation still around `(cvW/2, PAD + cssH*0.95)`. Pivot system is for PLACEMENT only, không phải rotation point — keeps existing rotation behavior intact.

### Rule
> Khi crop sprite frames có padding khác nhau (bud loose, bloom tight, vv):
> 1. KHÔNG dựa vào rect bottom = stem base — adds visual misalignment
> 2. Thêm pivot/anchor field per module → mỗi frame có "anchor point" rõ ràng
> 3. Default pivot = bottom-center → matches naive bottom-align, no breaking change
> 4. Tool UI phải vẽ pivot marker rõ ràng (cross/circle) — user thấy ngay vị trí anchor
> 5. Round-trip test: stem PIXEL converge tại SAME refY across all frames (regression guard)


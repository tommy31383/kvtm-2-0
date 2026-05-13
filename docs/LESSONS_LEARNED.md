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

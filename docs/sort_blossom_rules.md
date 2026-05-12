# Sort Blossom — Game Rules (v2)

## Pot Anatomy

```
┌─────────────┐
│  [Active]   │ ← 3 slot trên cùng, user thao tác (xòe hoa rõ)
│  ─ ─ ─ ─ ─  │
│  [Queue]    │ ← N slot dưới/sau, mờ, KHÔNG thao tác
└─────────────┘
```

- Mỗi pot có **3 slot active** (interactable, hiển thị xòe rõ).
- Mỗi pot có **N slot queue** (waiting, hiển thị mờ phía sau, không tap được).

---

## Core Rules

### 1. Color count
- **Mỗi màu trong level phải là bội số của 3**.
- Vd: 3 đỏ, 6 xanh, 9 vàng — KHÔNG được 4 đỏ hay 7 vàng.
- Lý do: để win phải match hết bông theo nhóm 3.
- Validator (`SortBlossomEngine.validate`) reject level nếu vi phạm.

### 2. Active slots
- Player **chỉ thao tác với 3 active slots** trên cùng.
- Hoa trong queue **bị mờ**, không click được.

**Selected flower visual (canon v3):**
- Bông đang được chọn (held) phải **z-index cao hơn** 2 bông còn lại trong cùng pot → hiển thị **đè lên trên**, không bị crop bởi 2 bông kế.
- Scale to **+15%** (`transform: scale(1.15)`).
- Translate up nhẹ ~6px để cảm giác "nhấc lên".
- Có thể thêm soft glow (drop-shadow filter) để nổi bật.
- Ánh sáng: brightness 1.1.
- Transition: 120ms ease-out.

### 3. Queue → Active promotion
- Khi **cả 3 active slots rỗng** → auto shift **3 hoa kế tiếp** từ queue lên active.
- Promotion luôn theo block 3 (không lẻ).

### 4. Two-phase interaction

> **Design principle:** User **KHÔNG nhìn thấy** vùng trái/giữa/phải. UI chỉ có bông + chậu, không có "slot zone". Mọi tap đều resolve về "chọn bông gần nhất" — không có no-op khi đang ở Phase 1 (trừ khi pot không có bông active nào).

#### Phase 1 — Click chọn bông
- Khi tay người chơi **chưa cầm bông**, bất kỳ tap nào trong/quanh chậu có bông đều **chọn 1 bông**.
- Bông được chọn chuyển sang trạng thái **đang cầm**: nhấc lên, sáng hơn, pot/slot nguồn được highlight.
- Queue **không clickable**; chỉ render visual mờ dưới active.

| Input khi chưa cầm bông | Kết quả |
|---|---|
| Tap đúng vào 1 bông active | Chọn chính bông đó |
| Tap vào slot rỗng giữa cụm active | Chọn **bông gần nhất** trong chậu đó (theo khoảng cách X) |
| Tap vào chậu nhưng không trúng active slot | Chọn **bông chính giữa** nếu có; nếu giữa rỗng → bông gần nhất |
| Tap vào khoảng không (ngoài chậu, trong vùng chơi) | Chọn **bông active gần nhất** trên board |
| Tap vào queue preview (visual mờ) | Queue không clickable → resolve như "tap khoảng không" → chọn bông active gần nhất |
| Pot không có bông active nào | Không làm gì, không tính move |

#### Phase 2 — Đang cầm bông

> **Design principle:** Phase 2 chỉ có 4 outcomes: **PLACE / RESELECT / CANCEL / IGNORE**. KHÔNG bao giờ swap. Engine chỉ có 1 mutation type là `applyMove` (place from non-empty slot to empty slot).

**Rules (simplified):**
- **PLACE** chỉ xảy ra khi tap vào slot rỗng / vùng có slot trống ở pot khác (≠ pot nguồn). Place = **+1 move**.
- **RESELECT** xảy ra khi tap bông khác bất kỳ (cùng pot hoặc pot khác mà full). Reselect = held đổi sang bông mới, **không +move**.
- **CANCEL** khi tap chính bông đang cầm hoặc tap ngoài tất cả pot.
- **IGNORE** khi tap queue preview. (Pot rỗng vẫn là target hợp lệ để place.)

| Input khi đang cầm bông | Kết quả | +Move |
|---|---|---|
| Tap slot rỗng pot khác | **Place** vào slot rỗng đó | ✅ |
| Tap bông pot khác — pot đích còn slot trống | **Place** vào slot trống gần nhất | ✅ |
| Tap bông pot khác — pot đích FULL | **Reselect** (held = bông vừa tap) | ❌ |
| Tap bông khác trong cùng pot nguồn | **Reselect** (held = bông vừa tap) | ❌ |
| Tap lại đúng bông đang cầm | **Cancel** → về Phase 1 | ❌ |
| Tap queue preview | Ignored, vẫn cầm | ❌ |
| (REMOVED) Pot rỗng (active null) | **CHẤP NHẬN place** — pot rỗng vẫn nhận bông | — |
| Tap khoảng không ngoài chậu | **Cancel** → về Phase 1 | ❌ |

### 5. Positional pick (internal model — INVISIBLE to user)
- ⚠️ **User không nhìn thấy, không nhắm, không click vùng nào** — UI chỉ có bông + chậu, không có hint zone trái/giữa/phải.
- Game giữ 3 vị trí nội bộ **TRÁI / GIỮA / PHẢI** chỉ để tính resolve logic — không render visible boundary.
- Tap-to-flower mapping rules:
  - **Phase 1 (chưa cầm)**: tap bất kỳ → resolve về bông active gần nhất theo X.
    - Nếu tap trong chậu: ưu tiên bông GIỮA nếu có; giữa rỗng → gần nhất.
    - Nếu tap ngoài chậu: chọn bông active gần nhất trên board.
  - **Phase 2 (đang cầm)** — chỉ 4 outcomes:
    - **PLACE** + move: tap vào pot khác có slot trống (slot rỗng hoặc bông — map tới slot trống gần nhất).
    - **RESELECT** (no move): tap bông trong CÙNG pot nguồn, hoặc tap bông trong pot khác mà FULL active.
    - **CANCEL** (no move): tap chính bông đang cầm, hoặc tap khoảng không ngoài chậu.
    - **IGNORE**: tap queue (queue không phải target). Pot rỗng vẫn nhận bông.
- Queue **không phải input target** — bị bỏ qua hoàn toàn trong hit-test.

### 6. Queue visual (canon — theo Blossom Sort / Flower Sort reference)
- Queue **KHÔNG vẽ thành strip/button/preview riêng** ở bất cứ đâu (không phải tab, không phải bên dưới chậu, không phải badge).
- Bông queue render **nhỏ, mờ (scale ~0.6, opacity ~0.4), nằm DƯỚI active flower trong CÙNG slot**.
- **Chỉ hiện preview khi active slot đó RỖNG** — như "ghost" của bông sắp được promote lên.
- Khi active slot có bông → KHÔNG show queue preview (bị che bởi active).
- Queue **không clickable** — chỉ là visual hint.
- Reference behavior: tham khảo Blossom Sort® / Flower Sort: Bloom Puzzle — queue chỉ "ló mờ" dưới slot trống của active.

### 7. Win condition — Match-3 Vanish
- Khi **cả 3 active slots cùng 1 màu** → 3 hoa **biến mất** (vanish + sparkle effect).
- Sau khi vanish, **queue auto-shift 3 hoa kế tiếp** lên active.
- Nếu queue rỗng → active rỗng theo, pot trở thành **pot rỗng**.
- **Win level**: TẤT CẢ pots đều rỗng (clear hết hoa trên màn).
- **Pot rỗng VẪN nhận hoa được** (đã chốt v3) — không có "locked empty" state. Mỗi pot có 3 active slot luôn sẵn sàng làm PLACE target nếu còn slot null.

### 8. Lose conditions
- **Hết move limit** = số lượt đã dùng ≥ moveLimit mà chưa win.
- **Deadlock**: tất cả pot đều full active và không có pot nào có slot trống để place → không còn nước đi PLACE hợp lệ. Hiếm nhưng có thể xảy ra với level design xấu.
- **Soft-deadlock**: vẫn còn place moves nhưng không thể match-3 với move limit còn lại → game vẫn cho chơi đến hết move, kết thúc bằng lose.
- BFS solver chỉ cần search trên PLACE moves (không có swap).

---

## Open questions (chốt sau)

| # | Câu hỏi | Trạng thái |
|---|---|---|
| Q1 | Capacity tổng mỗi pot cố định hay tuỳ level? | ✅ **Tuỳ level, max 9** (3 active + tối đa 6 queue) |
| Q2 | Win condition? | ✅ **Match-3 vanish** — 3 active cùng màu biến mất, queue đẩy lên. Win khi clear hết. |
| Q3 | Top run hay 1 hoa/lần? | ✅ **1 hoa / 1 lần touch** (không có top run multi-move) |
| Q4 | Promotion shift khi cả 3 rỗng, hay liên tục theo từng vị trí? | Anh nói cả 3 rỗng (đã chốt) |

---

## Visual rules

- **Active flowers**: hiển thị bình thường (sáng, brightness 1.0, scale 1.0).
- **Queue flowers**: mờ (brightness ~0.5, opacity ~0.6, scale ~0.85), nằm sau active.
- **Pot front layer** (`pot_front.png`) che gốc stems của active flowers — đã làm.
- Queue có thể hiện ngay dưới active (cùng pot) hoặc ngăn cách bằng đường mờ.

---

## Engine refactor checklist (khi bắt đầu code)

- [x] State model: `pot = { active: [3], queue: [N] }`
- [x] Render layer queue (dim) + active (bright)
- [x] Validate level: mỗi màu phải %3 == 0
- [x] Win check theo match-3 vanish
- [x] Engine chỉ có **1 mutation type** = `applyMove` (place from non-empty → empty). KHÔNG bao giờ có swap.
- [x] `isDeadlock()` chỉ check `canMove` (place-to-empty) — đúng canon.
- [x] `bfsSolve` chỉ search PLACE moves — đúng canon.
- [x] **v3 DONE:** Phase 2 dispatcher in render layer (4 outcomes):
  - **PLACE** + move: tap vào pot khác có slot trống (empty slot HOẶC bông trong pot có slot trống → map tới slot trống gần nhất)
  - **RESELECT** (no move): tap bông cùng pot nguồn HOẶC tap bông pot khác mà FULL active
  - **CANCEL** (no move): tap chính bông đang cầm HOẶC tap ngoài tất cả pot
  - **IGNORE**: tap queue only (pot rỗng VẪN nhận bông qua PLACE)

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

### 2. Active slots
- Player **chỉ thao tác với 3 active slots** trên cùng.
- Hoa trong queue **bị mờ**, không click được.

### 3. Queue → Active promotion
- Khi **cả 3 active slots rỗng** → auto shift **3 hoa kế tiếp** từ queue lên active.
- Promotion luôn theo block 3 (không lẻ).

### 4. Move (positional pick)
- Mỗi pot có **3 slot active theo vị trí: TRÁI / GIỮA / PHẢI**.
- Tap pot A → game lấy **slot tương ứng với vị trí tap** (touch X relative to pot center):
  - Tap nửa trái pot → chọn slot **TRÁI**.
  - Tap chính giữa → slot **GIỮA**.
  - Tap nửa phải → slot **PHẢI**.
- Tap pot B → game lấy slot tương ứng với vị trí tap trên pot B làm đích.
- Hoa từ slot[A][pos_A] bay sang slot[B][pos_B] nếu:
  - slot[B][pos_B] đang **rỗng**, HOẶC
  - Hoa ở slot[B][pos_B] **cùng màu** với hoa ở slot[A][pos_A]
- Nếu slot A rỗng (không có hoa) → invalid (shake hoặc bỏ qua).
- Lưu ý: queue không tham gia; chỉ 3 active slots interactable.

### 5. Win condition — Match-3 Vanish
- Khi **cả 3 active slots cùng 1 màu** → 3 hoa **biến mất** (vanish + sparkle effect).
- Sau khi vanish, **queue auto-shift 3 hoa kế tiếp** lên active.
- Nếu queue rỗng → active rỗng theo, pot trở thành **pot rỗng**.
- **Win level**: TẤT CẢ pots đều rỗng (clear hết hoa trên màn).
- Pot rỗng không thể nhận hoa nữa (hoặc có thể, tùy logic — cần xác nhận sau).

### 6. Lose conditions
- Hết move limit.
- Deadlock: không còn nước đi hợp lệ.

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

- [ ] State model: `pot = { active: [3], queue: [N] }` thay cho `vases[i]: [...]`
- [ ] `topRun()` chỉ chạy trên active.
- [ ] `pourCount()` giới hạn bởi space active của dest.
- [ ] `execMove()` sau khi pour, check active === [] → shift queue.
- [ ] Render layer queue (dim) + active (bright).
- [ ] BFS solver phải mô phỏng cả promotion logic.
- [ ] Validate level: mỗi màu phải %3 == 0.
- [ ] Win check theo rule chốt từ Q2.

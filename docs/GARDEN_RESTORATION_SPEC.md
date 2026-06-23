# Garden Restoration — Master Art Spec
**KVTM 2.0 | Version 1.1 | 2026-06-23**

> File này là nguồn sự thật duy nhất cho toàn bộ visual asset của Restoration Meta.
> Codex, designer, developer đều đọc file này trước khi gen/code bất cứ thứ gì.

---

## CHANGELOG
| Version | Date | Thay đổi |
|---|---|---|
| 1.1 | 2026-06-23 | Fix 15 audit findings: chốt A1 arch, thêm slot2r, fix slot4 tên, z-index, @2x, compress, platform, transition-delay, cross-slot check, palette drift, canvas ratio |
| 1.0 | 2026-06-23 | Khởi tạo master spec |

---

## 0. KIẾN TRÚC TÍCH HỢP — A1 (đã chốt)

### Quyết định
**Xóa hoàn toàn `buildGardenSVG()`**, thay bằng hệ thống PNG layers thuần.

### Trước (SVG inline)
```
hub-garden-svg (div)
  └── <svg> toàn bộ garden — tất cả slot vẽ bằng shapes inline
       ├── <g id="slot1-before"> ... ellipse, circle ...
       ├── <g id="slot1-after">  ... ellipse, circle ...
       └── ... 10 groups, rebuild toàn bộ mỗi lần task xong
```

### Sau (A1 — PNG layers)
```
hub-garden-wrap (div, position:relative)
  ├── <img id="garden-bg"> ← SVG tĩnh: sky, ground, cottage, trees, path
  ├── .garden-slot #g-slot1   (position:absolute) ← gate
  │     ├── <img class="gs-layer"> gate_0_broken.png   opacity:1→0
  │     ├── <img class="gs-layer"> gate_1_mid.png      opacity:0→1→0
  │     └── <img class="gs-layer"> gate_2_done.png     opacity:0→1
  ├── .garden-slot #g-slot2   ← hedge left
  ├── .garden-slot #g-slot2r  ← hedge right (MIRROR of slot2)
  ├── .garden-slot #g-slot3   ← flower bed
  ├── .garden-slot #g-slot4   ← pathway + well
  └── .garden-slot #g-slot5   ← bench
```

### Hàm thay thế `buildGardenSVG()`
```js
function renderGardenPNGs() {
  const slotProg = [1,2,3,4,5].map(s => slotProgress(s));  // 0–5
  const slotDone = slotProg.map(p => p === 5);

  [1,2,'2r',3,4,5].forEach(s => {
    const idx = s === '2r' ? 1 : Number(s) - 1;  // slotProg index
    const prog = slotProg[idx];
    const el = document.getElementById(`g-slot${s}`);
    if (!el) return;
    const [broken, mid, done] = el.querySelectorAll('.gs-layer');
    broken.style.opacity = prog === 0 ? '1' : '0';
    mid.style.opacity    = prog >= 1 && prog < 5 ? '1' : '0';
    done.style.opacity   = prog === 5 ? '1' : '0';
  });
}
```

### Khi nào gọi `renderGardenPNGs()`
- Hub mount (thay `buildGardenSVG`)
- Sau `_playCinematic()` callback (thay `buildGardenSVG`)
- Không gọi trong `buildGardenSVG` nữa — hàm đó bị xóa

---

## 1. ART DIRECTION (đã chốt)

### Perspective
- **2.5D Side-view**, góc nghiêng nhẹ top-down ~15°
- Camera đứng yên, nhìn thẳng vào vườn từ ngoài vào
- Reference style: Lily's Garden, Gardenscapes

### Art Style
- **Hand-painted cartoon** — đường nét mềm, stroke đen `#2a1a0a` dày ~2px
- Texture: watercolor wash nhẹ trên bề mặt (đá, gỗ, đất)
- Không dùng flat vector thuần, không dùng hyper-realistic
- Bóng đổ: soft drop shadow hướng lower-right, không hard shadow

### Color Palette (anchor — tất cả asset dùng đúng hex này)
| Token | Hex | Dùng cho |
|---|---|---|
| `sky-cream` | `#f5e8c4` | Background warm cream |
| `ground-tan` | `#d8c39e` | Đất nền, đường đi |
| `stone-warm` | `#a89070` | Đá, tường — **warm brownish, KHÔNG grey** |
| `wood-dark` | `#5c3d1e` | Gỗ cũ, outline — **brown, KHÔNG grey** |
| `wood-light` | `#c8955a` | Gỗ mới, ghế |
| `plant-dark` | `#4a7c3f` | Lá cây, bụi rậm |
| `plant-light` | `#8aa872` | Cỏ, topiary |
| `flower-pink` | `#d28464` | Hoa hồng, anh đào |
| `flower-yellow` | `#e3b25a` | Hoa vàng, điểm nhấn |
| `accent-purple` | `#9b72cf` | Hoa tử đằng, dây leo |
| `metal-iron` | `#6e7a8a` | Sắt, bản lề, đèn |
| `outline` | `#2a1a0a` | Tất cả stroke/outline |

> ⚠️ KHÔNG dùng "white daisies", "cool grey", "weathered grey wood" — những màu này không nằm trong palette.
> Nếu muốn thêm màu mới → update bảng này trước khi gen.

### Lighting
- Nguồn sáng: **trên-trái**, góc ~45°
- Thời điểm: **chiều tà ấm** (golden hour nhẹ)
- Ambient: warm cream, **không có ánh sáng lạnh/xanh**
- Shadow direction: lower-right, soft

### Canvas & Export (1x)
| Thông số | Giá trị |
|---|---|
| Canvas per slot | **400 × 600 px** (portrait 2:3) |
| Background | **Transparent PNG** (không bake background) |
| Padding | 20px mọi phía |
| Subject chiếm | ~70% canvas |

### Export @2x (retina)
| Thông số | Giá trị |
|---|---|
| Canvas @2x | **800 × 1200 px** |
| File suffix | `_2x.png` (ví dụ `gate_2_done@2x.png`) |
| Dùng trong game | CSS `srcset` hoặc `image-set()` |

### Compression (mandatory trước khi commit vào game)
```bash
# Tool: pngquant (free, CLI)
pngquant --quality=75-90 --strip --ext .png --force assets/garden_restoration/**/*.png
# Target: < 150KB per 1x file, < 400KB per @2x file
```

---

## 2. AI PLATFORM & IMG2IMG SPEC

### Platform được chốt: **Stable Diffusion (ComfyUI hoặc A1111)**
- Lý do: hỗ trợ img2img với strength control — cần thiết để giữ style consistency
- Alternative nếu không có SD: **DALL-E 3** (dùng "style reference image" trong prompt text, không có img2img)

### img2img parameters (SD)
| Parameter | Giá trị |
|---|---|
| Reference image | `style_reference.png` |
| Denoising strength | `0.35` |
| Sampler | DPM++ 2M Karras |
| Steps | 30 |
| CFG scale | 7 |

### DALL-E 3 alternative (nếu không dùng SD)
Thêm đoạn này vào đầu mỗi prompt:
```
Consistent with a hand-painted cartoon garden game scene.
Same art style as: warm watercolor wash, thin dark brown outlines,
2.5D side-view, golden afternoon lighting from upper-left,
palette of warm cream, terracotta brown stone, sage green plants,
warm wood brown, pink and yellow flowers.
```

---

## 3. STYLE REFERENCE PROMPT (gen trước tiên — làm anchor)

> ⚠️ Canvas: **1200 × 800 px** (landscape, cho style ref chỉ — khác với asset canvas).
> Sau khi gen, crop/export lại thành **400 × 600 px portrait** trước khi dùng làm img2img reference.
> Lưu file: `assets/garden_restoration/style_reference.png`

```
Hand-painted cartoon garden scene, 2.5D side-view perspective,
slight top-down angle 15 degrees.
Shows all 5 garden elements together in one scene, all RESTORED and beautiful:
  - ornate stone arch gate with lanterns (center-left)
  - rounded topiary hedge bushes with pink roses (far left and far right)
  - small colorful flower bed with pink and yellow flowers (center foreground)
  - stone well with wooden roof and rope (right of center)
  - white wooden bench with green cushion and lamp post (far right)
Art style: soft watercolor wash texture, thin dark brown outlines 2px (#2a1a0a),
warm afternoon golden light from upper-left, soft shadow lower-right.
Color palette: warm cream ground (#f5e8c4), sage green plants (#8aa872),
terracotta stone (#a89070), warm wood brown (#c8955a),
pink flowers (#d28464), yellow flowers (#e3b25a).
Transparent background, no text, no watermark, no frame, no UI elements.
High detail on textures: wood grain, stone moss, leaf veins.
Canvas: 1200x800px landscape.
```

### Acceptance criteria cho style_reference.png
- [ ] Perspective đúng 2.5D side-view — không bị flat/top-down thẳng
- [ ] Tất cả 5 element đều visible và recognizable
- [ ] Màu sắc warm, không có tone lạnh/xanh
- [ ] Outline đen/nâu đậm rõ ràng trên tất cả element
- [ ] Background transparent (kiểm tra trên nền đỏ/xanh)

---

## 4. MASTER PROMPT SET

### Cấu trúc prompt chuẩn
```
[img2img: style_reference_portrait.png, strength: 0.35]  ← SD only
Hand-painted cartoon, 2.5D side-view, isolated garden element.
ELEMENT: {ELEMENT_NAME}
STATE: {STATE}
Details: {SPECIFIC_DETAILS}
Condition: {CONDITION_KEYWORDS}
Palette: warm cream (#f5e8c4), stone (#a89070), plant (#8aa872),
  wood (#c8955a/#5c3d1e), flower-pink (#d28464), flower-yellow (#e3b25a).
  Stone is WARM BROWNISH, wood is BROWN, NOT grey.
Lighting: warm golden afternoon, light from upper-left, soft shadow lower-right.
Outline: thin dark brown #2a1a0a, ~2px.
Background: transparent PNG, no ground, no sky, no context.
No text, no watermark, no frame. Canvas: 400x600px portrait, 20px padding.
Subject occupies ~70% of canvas, centered.
```

---

### SLOT 1 — Front Gate (`assets/garden_restoration/slot1_gate/`)

**`gate_0_broken.png`** — State: Broken
```
[img2img: style_reference_portrait.png, strength: 0.35]
Hand-painted cartoon, 2.5D side-view, isolated garden element.
ELEMENT: Garden front gate with two stone pillars
STATE: broken, neglected, BEFORE restoration
Details: wooden gate planks rotting and partially missing,
  left gate door hanging at angle from one rusty iron hinge,
  cracked stone pillars with moss and weeds in cracks,
  overgrown brown dead weeds at base, bird nest on right pillar top.
Condition: broken, weathered, neglected, abandoned, crumbling, rusty, mossy.
Palette: dark weathered wood-dark (#5c3d1e), cracked stone (#a89070),
  dead weeds brown, rust orange on metal. Stone WARM BROWNISH not grey.
Lighting: warm golden afternoon, light upper-left, soft shadow lower-right.
Outline: thin dark brown #2a1a0a ~2px. Background transparent PNG.
No text, no watermark. Canvas: 400x600px, 20px padding, subject ~70%.
```

**`gate_1_mid.png`** — State: Mid (prog 1–4)
```
[img2img: style_reference_portrait.png, strength: 0.35]
Hand-painted cartoon, 2.5D side-view, isolated garden element.
ELEMENT: Garden front gate with two stone pillars
STATE: mid-restoration, work in progress
Details: stone pillars repaired and cleaned, fresh mortar visible between stones,
  new wooden gate planks installed but unpainted, raw timber wood-light (#c8955a) color,
  new iron hinges, gate stands straight but plain and undecorated,
  weeds removed, bare dirt at base, mason trowel leaning on one pillar.
Condition: under construction, repaired, fresh, plain, new wood, unfinished.
Palette: fresh wood-light (#c8955a), clean stone (#a89070), bare earth (#d8c39e).
Lighting: warm golden afternoon, light upper-left, soft shadow lower-right.
Outline: thin dark brown #2a1a0a ~2px. Background transparent PNG.
No text, no watermark. Canvas: 400x600px, 20px padding, subject ~70%.
```

**`gate_2_done.png`** — State: Done (prog 5)
```
[img2img: style_reference_portrait.png, strength: 0.35]
Hand-painted cartoon, 2.5D side-view, isolated garden element.
ELEMENT: Garden front gate with stone arch and lanterns
STATE: fully restored, beautiful, completed
Details: elegant stone arch over gate (stone #a89070),
  iron scrollwork gate painted metal-iron (#6e7a8a) with gold tips,
  two warm-glowing lanterns on top of pillars (warm yellow glow),
  purple wisteria vines (#9b72cf) climbing the arch,
  small yellow flowers (#e3b25a) growing at base of pillars,
  clean stone path leading through.
Condition: beautiful, elegant, completed, lush, glowing, flourishing.
Palette: iron (#6e7a8a), gold, purple wisteria (#9b72cf),
  warm lantern glow, yellow flowers (#e3b25a), stone (#a89070).
Lighting: warm golden afternoon + warm lantern point light, upper-left shadow.
Outline: thin dark brown #2a1a0a ~2px. Background transparent PNG.
No text, no watermark. Canvas: 400x600px, 20px padding, subject ~70%.
```

---

### SLOT 2L — Left Hedge (`assets/garden_restoration/slot2_hedge_left/`)

**`hedge_left_0_broken.png`** — State: Broken
```
[img2img: style_reference_portrait.png, strength: 0.35]
Hand-painted cartoon, 2.5D side-view, isolated garden element.
ELEMENT: Single garden hedge bush, LEFT side (will be mirrored for right side)
STATE: broken, overgrown, BEFORE restoration
Details: one scraggly irregular bush, branches sticking out in all directions,
  brown dead leaves mixed with sparse dull green, overall shape messy and unkempt,
  some branches broken and drooping, gaps visible through bush.
Condition: overgrown, messy, scraggly, dead patches, unkempt.
Palette: dark dead branches (#5c3d1e), sparse dull plant-dark (#4a7c3f).
Lighting: warm golden afternoon, light upper-left, soft shadow lower-right.
Outline: thin dark brown #2a1a0a ~2px. Background transparent PNG.
No text, no watermark. Canvas: 400x600px, 20px padding, subject ~70%.
NOTE: Compose so bush faces RIGHT (for left-side placement in garden).
```

**`hedge_left_1_mid.png`** — State: Mid
```
[img2img: style_reference_portrait.png, strength: 0.35]
Hand-painted cartoon, 2.5D side-view, isolated garden element.
ELEMENT: Single garden hedge bush, LEFT side
STATE: trimmed but unfinished
Details: bush roughly trimmed into rounded box shape, fresh cuts visible,
  mostly plant-light (#8aa872) green but sparse in places, no flowers yet,
  garden shears leaning against bush.
Condition: trimmed, rough cut, in progress, angular, unfinished.
Palette: plant-light (#8aa872), fresh cut stems lighter green.
Lighting: warm golden afternoon, light upper-left, soft shadow lower-right.
Outline: thin dark brown #2a1a0a ~2px. Background transparent PNG.
No text, no watermark. Canvas: 400x600px, 20px padding, subject ~70%.
```

**`hedge_left_2_done.png`** — State: Done
```
[img2img: style_reference_portrait.png, strength: 0.35]
Hand-painted cartoon, 2.5D side-view, isolated garden element.
ELEMENT: Single garden topiary bush, LEFT side
STATE: fully restored, beautiful topiary
Details: perfectly rounded topiary ball, lush plant-dark (#4a7c3f),
  two small pink roses (#d28464) blooming at base,
  clean and manicured, dense full foliage with subtle texture variation.
Condition: lush, manicured, topiary, full, beautiful, roses.
Palette: plant-dark (#4a7c3f) with plant-light (#8aa872) highlights,
  flower-pink (#d28464) roses, wood-dark (#5c3d1e) base stems.
Lighting: warm golden afternoon, light upper-left, soft shadow lower-right.
Outline: thin dark brown #2a1a0a ~2px. Background transparent PNG.
No text, no watermark. Canvas: 400x600px, 20px padding, subject ~70%.
NOTE: Single topiary ball, LEFT side, bush faces RIGHT.
```

---

### SLOT 2R — Right Hedge (`assets/garden_restoration/slot2_hedge_right/`)

> Right hedge MIRRORS left hedge. Dùng lại ảnh của slot2_hedge_left và **flip ngang** (CSS hoặc Photoshop).
> File names: `hedge_right_0_broken.png`, `hedge_right_1_mid.png`, `hedge_right_2_done.png`

```css
/* Flip left hedge asset to create right hedge */
#g-slot2r img { transform: scaleX(-1); }
```

> Nếu flip trông không tự nhiên (asymmetric detail), gen riêng với note: "bush faces LEFT".

---

### SLOT 3 — Flower Bed (`assets/garden_restoration/slot3_flowerbed/`)

**`flowerbed_0_broken.png`** — State: Broken
```
[img2img: style_reference_portrait.png, strength: 0.35]
Hand-painted cartoon, 2.5D side-view, isolated garden element.
ELEMENT: Small oval garden flower bed, viewed from slight above
STATE: dry, neglected, BEFORE restoration
Details: cracked dry pale earth (#d8c39e faded), patches of dead brown grass,
  no flowers, two dry sticks poking up, small scattered rocks,
  oval border shape visible but broken/incomplete.
Condition: dry, cracked, barren, neglected, no flowers, dead.
Palette: pale dry earth (faded #d8c39e), dull brown dead weeds (#5c3d1e).
Lighting: warm golden afternoon, light upper-left, soft shadow lower-right.
Outline: thin dark brown #2a1a0a ~2px. Background transparent PNG.
No text, no watermark. Canvas: 400x600px, 20px padding, subject ~70%.
```

**`flowerbed_1_mid.png`** — State: Mid
```
[img2img: style_reference_portrait.png, strength: 0.35]
Hand-painted cartoon, 2.5D side-view, isolated garden element.
ELEMENT: Small oval garden flower bed
STATE: freshly dug and planted, sprouting
Details: freshly turned dark moist earth (rich dark brown),
  three to four tiny green sprouts just emerging (plant-light #8aa872),
  neat oval border edge installed, small watering can beside bed.
Condition: planted, sprouting, fresh soil, seedlings, hopeful.
Palette: rich dark earth brown, tiny sprouts plant-light (#8aa872).
Lighting: warm golden afternoon, light upper-left, soft shadow lower-right.
Outline: thin dark brown #2a1a0a ~2px. Background transparent PNG.
No text, no watermark. Canvas: 400x600px, 20px padding, subject ~70%.
```

**`flowerbed_2_done.png`** — State: Done
```
[img2img: style_reference_portrait.png, strength: 0.35]
Hand-painted cartoon, 2.5D side-view, isolated garden element.
ELEMENT: Small oval garden flower bed, fully blooming
STATE: fully restored, blooming
Details: lush green foliage base (plant-light #8aa872),
  three pink rose-like flowers (#d28464) blooming center,
  two bright yellow accent flowers (#e3b25a) on sides,
  neat oval stone border, rich dark earth visible between plants.
Condition: blooming, lush, colorful, flourishing, beautiful.
Palette: plant-light (#8aa872) leaves, flower-pink (#d28464),
  flower-yellow (#e3b25a), dark rich earth.
  NO white daisies — only pink and yellow as per palette.
Lighting: warm golden afternoon, light upper-left, soft shadow lower-right.
Outline: thin dark brown #2a1a0a ~2px. Background transparent PNG.
No text, no watermark. Canvas: 400x600px, 20px padding, subject ~70%.
```

---

### SLOT 4 — Pathway + Well (`assets/garden_restoration/slot4_pathway_well/`)

> Slot 4 task narrative: pathway restoration (path_clear → path_fountain).
> Visual outcome: a stone well at the end of the path.
> Asset name reflects BOTH: `pathway_well_*.png`

**`pathway_well_0_broken.png`** — State: Broken
```
[img2img: style_reference_portrait.png, strength: 0.35]
Hand-painted cartoon, 2.5D side-view, isolated garden element.
ELEMENT: Garden pathway leading to a broken stone well
STATE: broken, neglected, BEFORE restoration
Details: overgrown dirt path with weeds cracking through,
  stone well at end of path: walls partially collapsed,
  stones fallen and scattered, wooden well roof rotted and fallen,
  rope frayed hanging uselessly, weeds growing from well cracks.
Condition: collapsed, broken, fallen stones, rotted wood, overgrown path.
Palette: pale cracked earth (#d8c39e), grey-brown crumbled stone (#a89070),
  dark weathered wood (#5c3d1e), brown dead weeds.
Lighting: warm golden afternoon, light upper-left, soft shadow lower-right.
Outline: thin dark brown #2a1a0a ~2px. Background transparent PNG.
No text, no watermark. Canvas: 400x600px, 20px padding, subject ~70%.
```

**`pathway_well_1_mid.png`** — State: Mid
```
[img2img: style_reference_portrait.png, strength: 0.35]
Hand-painted cartoon, 2.5D side-view, isolated garden element.
ELEMENT: Garden pathway leading to a stone well under construction
STATE: mid-restoration, work in progress
Details: path cleared of weeds, gravel being laid (ground-tan #d8c39e),
  stone well walls rebuilt halfway, fresh mortar between clean stones,
  temporary wooden plank across well top, new rope coiled nearby,
  mason trowel resting on well edge.
Condition: under construction, half-built, cleared, fresh mortar, in progress.
Palette: clean stone (#a89070), fresh mortar cream, wood-light (#c8955a).
Lighting: warm golden afternoon, light upper-left, soft shadow lower-right.
Outline: thin dark brown #2a1a0a ~2px. Background transparent PNG.
No text, no watermark. Canvas: 400x600px, 20px padding, subject ~70%.
```

**`pathway_well_2_done.png`** — State: Done
```
[img2img: style_reference_portrait.png, strength: 0.35]
Hand-painted cartoon, 2.5D side-view, isolated garden element.
ELEMENT: Garden stone-paved pathway leading to a restored well
STATE: fully restored, beautiful, completed
Details: clean stone-paved path with neat edges,
  stone well: perfectly fitted round walls (stone #a89070),
  charming wooden peaked roof with terracotta-colored tiles,
  iron crank handle (metal-iron #6e7a8a), clean rope with wooden bucket,
  small water visible inside well, climbing flower-pink (#d28464) vines at base,
  two small potted plants (#8aa872) either side of well.
Condition: beautiful, charming, complete, rustic, functional.
Palette: stone (#a89070), terracotta tiles, wood-dark (#5c3d1e),
  metal (#6e7a8a), plant (#8aa872), flower-pink (#d28464).
Lighting: warm golden afternoon, light upper-left, soft shadow lower-right.
Outline: thin dark brown #2a1a0a ~2px. Background transparent PNG.
No text, no watermark. Canvas: 400x600px, 20px padding, subject ~70%.
```

---

### SLOT 5 — Bench + Lamp (`assets/garden_restoration/slot5_bench/`)

**`bench_0_broken.png`** — State: Broken
```
[img2img: style_reference_portrait.png, strength: 0.35]
Hand-painted cartoon, 2.5D side-view, isolated garden element.
ELEMENT: Garden bench with lamp post
STATE: broken, neglected, BEFORE restoration
Details: wooden bench with middle plank missing, front legs bent outward,
  back support cracked and splitting, all paint chipped off,
  dark weathered wood (wood-dark #5c3d1e),
  old lamp post beside bench: cracked glass shade, lamp not working,
  metal rusted (metal-iron #6e7a8a darkened).
Condition: broken, cracked, chipped paint, bent, unusable, rusted.
Palette: dark weathered wood (#5c3d1e), rusted metal (#6e7a8a darkened).
  Wood is DARK BROWN not grey.
Lighting: warm golden afternoon, light upper-left, soft shadow lower-right.
Outline: thin dark brown #2a1a0a ~2px. Background transparent PNG.
No text, no watermark. Canvas: 400x600px, 20px padding, subject ~70%.
```

**`bench_1_mid.png`** — State: Mid
```
[img2img: style_reference_portrait.png, strength: 0.35]
Hand-painted cartoon, 2.5D side-view, isolated garden element.
ELEMENT: Garden bench with lamp post
STATE: newly built, not yet decorated
Details: new wooden bench, all planks intact, sanded smooth,
  freshly painted white (slight wet paint sheen), no cushion yet,
  new lamp post installed, clean metal (metal-iron #6e7a8a),
  lamp not yet lit, no flowers, no decorations, plain.
Condition: new, plain, freshly painted white, clean, undecorated.
Palette: fresh white paint, wood-light (#c8955a) natural wood grain,
  brushed metal-iron (#6e7a8a).
Lighting: warm golden afternoon, light upper-left, soft shadow lower-right.
Outline: thin dark brown #2a1a0a ~2px. Background transparent PNG.
No text, no watermark. Canvas: 400x600px, 20px padding, subject ~70%.
```

**`bench_2_done.png`** — State: Done
```
[img2img: style_reference_portrait.png, strength: 0.35]
Hand-painted cartoon, 2.5D side-view, isolated garden element.
ELEMENT: Garden bench with lamp post, fully restored
STATE: fully restored, cozy and beautiful
Details: elegant white bench with plant-dark (#4a7c3f) cushion and small pillow,
  ornate iron armrests (metal-iron #6e7a8a) with leaf motif,
  vintage lamp post with warm glowing yellow light (candle warm),
  flower-pink (#d28464) bunches tied to lamp post,
  small potted plant (#8aa872) at base of lamp,
  one butterfly near flowers.
Condition: cozy, elegant, glowing, inviting, charming, beautiful.
Palette: white bench, cushion plant-dark (#4a7c3f), lamp warm glow,
  flower-pink (#d28464), metal-iron (#6e7a8a).
Lighting: warm golden afternoon + warm lamp point light, upper-left shadow.
Outline: thin dark brown #2a1a0a ~2px. Background transparent PNG.
No text, no watermark. Canvas: 400x600px, 20px padding, subject ~70%.
```

---

## 5. INTEGRATION SPEC (A1 — game code)

### Folder structure
```
assets/garden_restoration/
  style_reference.png               ← 1200×800 original anchor (không dùng trong game)
  style_reference_portrait.png      ← 400×600 crop của anchor (dùng cho img2img)
  slot1_gate/
    gate_0_broken.png       gate_0_broken@2x.png
    gate_1_mid.png          gate_1_mid@2x.png
    gate_2_done.png         gate_2_done@2x.png
  slot2_hedge_left/
    hedge_left_0_broken.png   hedge_left_0_broken@2x.png
    hedge_left_1_mid.png      hedge_left_1_mid@2x.png
    hedge_left_2_done.png     hedge_left_2_done@2x.png
  slot2_hedge_right/            ← flipped copy của left (hoặc gen riêng)
    hedge_right_0_broken.png
    hedge_right_1_mid.png
    hedge_right_2_done.png
  slot3_flowerbed/
    flowerbed_0_broken.png    flowerbed_0_broken@2x.png
    flowerbed_1_mid.png       flowerbed_1_mid@2x.png
    flowerbed_2_done.png      flowerbed_2_done@2x.png
  slot4_pathway_well/
    pathway_well_0_broken.png   pathway_well_0_broken@2x.png
    pathway_well_1_mid.png      pathway_well_1_mid@2x.png
    pathway_well_2_done.png     pathway_well_2_done@2x.png
  slot5_bench/
    bench_0_broken.png    bench_0_broken@2x.png
    bench_1_mid.png       bench_1_mid@2x.png
    bench_2_done.png      bench_2_done@2x.png
```

### State logic
| slotProg | State | Opacity logic |
|---|---|---|
| 0 | broken | `broken=1, mid=0, done=0` |
| 1, 2, 3, 4 | mid | `broken=0, mid=1, done=0` |
| 5 | done | `broken=0, mid=0, done=1` |

> Lý do mid covers 1–4 (80% playtime): art cost constraint (3 state × 6 slot = 18 assets tối thiểu).
> Nếu muốn granular hơn → tăng lên 5 state/slot = 30 assets.

### Position map (px, relative to hub container 390×340)
| Slot | id | left | top | width | height | z-index |
|---|---|---|---|---|---|---|
| 1 Gate | `g-slot1` | 65px | 190px | 120px | 150px | 3 |
| 2L Hedge left | `g-slot2` | 20px | 215px | 110px | 130px | 2 |
| 2R Hedge right | `g-slot2r` | 255px | 215px | 110px | 130px | 2 |
| 3 Flower bed | `g-slot3` | 148px | 240px | 90px | 90px | 4 |
| 4 Well | `g-slot4` | 270px | 195px | 100px | 140px | 3 |
| 5 Bench | `g-slot5` | 248px | 208px | 110px | 130px | 2 |

> ⚠️ Giá trị này là estimate — cần fine-tune bằng DevTools sau khi có asset thật.
> Anchor point: cottage door = x:175px, y:230px. Dùng làm reference để scale.

### CSS
```css
.hub-garden-wrap {
  position: relative;
  width: 390px; height: 340px;
  overflow: hidden;
}
#garden-bg {
  position: absolute;
  width: 100%; height: 100%;
  top: 0; left: 0;
  z-index: 1;
}
.garden-slot {
  position: absolute;
}
.gs-layer {
  position: absolute;
  top: 0; left: 0;
  width: 100%; height: 100%;
  opacity: 0;
  /* transition-delay on incoming: prevents ghost overlap during crossfade */
  transition: opacity 0.6s ease;
}
.gs-layer.gs-visible {
  opacity: 1;
  transition: opacity 0.8s ease 0.1s; /* 0.1s delay so outgoing fades first */
}
/* Right hedge mirror */
#g-slot2r .gs-layer { transform: scaleX(-1); }
```

### HTML structure (hub scene)
```html
<div class="hub-garden-wrap" id="hub-garden-wrap">
  <!-- Static background: SVG tĩnh (sky, ground, cottage, trees, path outline) -->
  <img id="garden-bg" src="assets/garden_restoration/garden_background.svg" alt="">

  <!-- Slot 1: Gate -->
  <div class="garden-slot" id="g-slot1"
       style="left:65px;top:190px;width:120px;height:150px;z-index:3">
    <img class="gs-layer" src="assets/garden_restoration/slot1_gate/gate_0_broken.png" alt="">
    <img class="gs-layer" src="assets/garden_restoration/slot1_gate/gate_1_mid.png" alt="">
    <img class="gs-layer" src="assets/garden_restoration/slot1_gate/gate_2_done.png" alt="">
  </div>

  <!-- Slot 2L: Hedge left -->
  <div class="garden-slot" id="g-slot2"
       style="left:20px;top:215px;width:110px;height:130px;z-index:2">
    <img class="gs-layer" src="assets/garden_restoration/slot2_hedge_left/hedge_left_0_broken.png" alt="">
    <img class="gs-layer" src="assets/garden_restoration/slot2_hedge_left/hedge_left_1_mid.png" alt="">
    <img class="gs-layer" src="assets/garden_restoration/slot2_hedge_left/hedge_left_2_done.png" alt="">
  </div>

  <!-- Slot 2R: Hedge right (CSS flipped) -->
  <div class="garden-slot" id="g-slot2r"
       style="left:255px;top:215px;width:110px;height:130px;z-index:2">
    <img class="gs-layer" src="assets/garden_restoration/slot2_hedge_right/hedge_right_0_broken.png" alt="">
    <img class="gs-layer" src="assets/garden_restoration/slot2_hedge_right/hedge_right_1_mid.png" alt="">
    <img class="gs-layer" src="assets/garden_restoration/slot2_hedge_right/hedge_right_2_done.png" alt="">
  </div>

  <!-- Slot 3: Flower bed -->
  <div class="garden-slot" id="g-slot3"
       style="left:148px;top:240px;width:90px;height:90px;z-index:4">
    <img class="gs-layer" src="assets/garden_restoration/slot3_flowerbed/flowerbed_0_broken.png" alt="">
    <img class="gs-layer" src="assets/garden_restoration/slot3_flowerbed/flowerbed_1_mid.png" alt="">
    <img class="gs-layer" src="assets/garden_restoration/slot3_flowerbed/flowerbed_2_done.png" alt="">
  </div>

  <!-- Slot 4: Pathway + Well -->
  <div class="garden-slot" id="g-slot4"
       style="left:270px;top:195px;width:100px;height:140px;z-index:3">
    <img class="gs-layer" src="assets/garden_restoration/slot4_pathway_well/pathway_well_0_broken.png" alt="">
    <img class="gs-layer" src="assets/garden_restoration/slot4_pathway_well/pathway_well_1_mid.png" alt="">
    <img class="gs-layer" src="assets/garden_restoration/slot4_pathway_well/pathway_well_2_done.png" alt="">
  </div>

  <!-- Slot 5: Bench -->
  <div class="garden-slot" id="g-slot5"
       style="left:248px;top:208px;width:110px;height:130px;z-index:2">
    <img class="gs-layer" src="assets/garden_restoration/slot5_bench/bench_0_broken.png" alt="">
    <img class="gs-layer" src="assets/garden_restoration/slot5_bench/bench_1_mid.png" alt="">
    <img class="gs-layer" src="assets/garden_restoration/slot5_bench/bench_2_done.png" alt="">
  </div>
</div>
```

### JS — renderGardenPNGs()
```js
function renderGardenPNGs() {
  const slotKeys = [1, 2, '2r', 3, 4, 5];
  const progIdx  = { 1:0, 2:1, '2r':1, 3:2, 4:3, 5:4 };  // slotProg array index

  slotKeys.forEach(k => {
    const prog = slotProgress(progIdx[k] + 1);  // slotProgress(slotNumber 1-5)
    const el   = document.getElementById(`g-slot${k}`);
    if (!el) return;
    const layers = el.querySelectorAll('.gs-layer');
    // layers[0]=broken, layers[1]=mid, layers[2]=done
    const stateIdx = prog === 0 ? 0 : prog < 5 ? 1 : 2;
    layers.forEach((l, i) => {
      l.classList.toggle('gs-visible', i === stateIdx);
    });
  });
}
```

### Preload strategy
```js
// Preload only current state + next state per slot (tránh load 18 ảnh cùng lúc)
function preloadGardenAssets() {
  const slotProgMap = { 1:0, 2:1, '2r':1, 3:2, 4:3, 5:4 };
  ['1','2','2r','3','4','5'].forEach(k => {
    const prog = slotProgress(slotProgMap[k] + 1);
    const states = prog === 0 ? [0,1] : prog < 5 ? [1,2] : [2];
    states.forEach(s => {
      const img = new Image();
      img.src = gardenAssetPath(k, s);
    });
  });
}
```

---

## 6. AUDIT CHECKLIST

### Per-asset check (trước khi accept)
- [ ] Perspective: 2.5D side-view, ~15° top-down — không flat/top-down thẳng
- [ ] Style: hand-painted cartoon, watercolor wash texture — không vector flat
- [ ] Palette: đúng hex values — không có màu lạnh, không có white daisies nếu chưa add vào palette
- [ ] Stone là **warm brownish** (#a89070) — không phải cool grey
- [ ] Wood là **brown** (#5c3d1e/#c8955a) — không phải grey
- [ ] Background: transparent PNG — kiểm tra trên **nền đỏ** để thấy fuzz
- [ ] Lighting: warm golden, shadow lower-right — không có harsh/cold light
- [ ] Outline: dark brown ~2px trên tất cả edge
- [ ] Scale: subject chiếm ~70% canvas, 20px padding đủ

### Cross-slot consistency check (sau khi có đủ 18 assets)
- [ ] Xếp cả 6 slot DONE side-by-side → cùng lighting direction?
- [ ] Cùng color temperature? Không slot nào trông "lạnh" hơn
- [ ] Scale tương đối đúng: gate > hedge ≈ bench > well > flowerbed
- [ ] Stroke weight nhất quán trên tất cả elements
- [ ] Left hedge và right hedge (flipped) trông natural, không lộ mirror artifact

### Integration test (sau khi code)
- [ ] PNG load < 150KB/file@1x, < 400KB/file@2x (đo bằng DevTools Network)
- [ ] Opacity transition: outgoing fades trước, incoming fades sau (không ghost)
- [ ] z-index đúng: flowerbed (4) > gate/well (3) > hedge/bench (2)
- [ ] Không overlap sai vào cottage/background
- [ ] Test trên 390px mobile viewport — không bị pixelated
- [ ] Test @2x: ảnh không blurry trên Retina display

### Version control
- [ ] Nếu thay đổi art direction → bump version trong CHANGELOG trước khi gen
- [ ] Assets cũ từ version cũ → move vào `_archive/v{N}/` trước khi replace
- [ ] Sau mỗi batch gen → ghi vào CHANGELOG: "gen slot X done, version N"

---

## 7. TASK LIST — THỨ TỰ LÀM

```
[ ] Step 0: Gen style_reference.png (1200×800) → crop portrait → style_reference_portrait.png
[ ] Step 1: Gen slot1_gate (3 assets) → review → compress
[ ] Step 2: Gen slot2_hedge_left (3 assets) → flip → slot2_hedge_right
[ ] Step 3: Gen slot3_flowerbed (3 assets) → review → compress
[ ] Step 4: Gen slot4_pathway_well (3 assets) → review → compress
[ ] Step 5: Gen slot5_bench (3 assets) → review → compress
[ ] Step 6: Cross-slot consistency check (tất cả DONE cùng lúc)
[ ] Step 7: Tạo garden_background.svg (static: sky, ground, cottage, trees)
[ ] Step 8: Code A1 integration (xóa buildGardenSVG, add PNG layers)
[ ] Step 9: Fine-tune positions với DevTools
[ ] Step 10: npm test + smoke test trên game
```

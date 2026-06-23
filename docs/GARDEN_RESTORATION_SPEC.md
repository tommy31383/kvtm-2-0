# Garden Restoration — Master Art Spec
**KVTM 2.0 | Version 1.0 | 2026-06-23**

> File này là nguồn sự thật duy nhất cho toàn bộ visual asset của Restoration Meta.
> Codex, designer, developer đều đọc file này trước khi gen/code bất cứ thứ gì.

---

## 1. ART DIRECTION (đã chốt)

### Perspective
- **2.5D Side-view**, góc nghiêng nhẹ top-down ~15°
- Camera đứng yên, nhìn thẳng vào vườn từ ngoài vào
- Reference style: Lily's Garden, Gardenscapes

### Art Style
- **Hand-painted cartoon** — đường nét mềm, stroke đen mỏng ~2px
- Texture: watercolor wash nhẹ trên bề mặt (đá, gỗ, đất)
- Không dùng flat vector thuần, không dùng hyper-realistic
- Bóng đổ: soft drop shadow, không có hard shadow

### Color Palette (anchor — tất cả asset dùng palette này)
| Token | Hex | Dùng cho |
|---|---|---|
| `--col-sky` | `#f5e8c4` | Background warm cream |
| `--col-ground` | `#d8c39e` | Đất nền, đường đi |
| `--col-stone` | `#a89070` | Đá, tường, giếng |
| `--col-wood-dark` | `#5c3d1e` | Gỗ cũ, outline |
| `--col-wood-light` | `#c8955a` | Gỗ mới, ghế |
| `--col-plant-dark` | `#4a7c3f` | Lá cây, bụi rậm |
| `--col-plant-light` | `#8aa872` | Cỏ, topiary |
| `--col-flower-pink` | `#d28464` | Hoa hồng, anh đào |
| `--col-flower-yellow` | `#e3b25a` | Hoa vàng, điểm nhấn |
| `--col-accent-purple` | `#9b72cf` | Hoa tử đằng, dây leo |
| `--col-metal` | `#6e7a8a` | Sắt, bản lề, đèn |

### Lighting
- Nguồn sáng: **trên-trái**, góc ~45°
- Thời điểm: **chiều tà ấm** (golden hour nhẹ)
- Ambient: warm cream, không có ánh sáng lạnh/xanh

### Canvas & Export
| Thông số | Giá trị |
|---|---|
| Canvas per slot | **400 × 600 px** |
| Background | **Transparent PNG** (không bake background) |
| Padding | 20px mọi phía |
| Export format | PNG-24 với alpha |
| Min detail size | 8px (readable trên mobile 390px screen) |

---

## 2. STYLE REFERENCE PROMPT (gen trước tiên — làm anchor)

```
Hand-painted cartoon garden scene, 2.5D side-view perspective,
slight top-down angle 15 degrees.
Shows all 5 garden elements together in one scene:
  - ornate stone gate (center-left)
  - rounded topiary hedge bushes (far left and far right)
  - small colorful flower bed (center foreground)
  - stone well with rope (right side)
  - white wooden bench with cushion (right background)
All elements restored, beautiful, lush, flourishing.
Art style: soft watercolor wash, thin black outlines 2px,
warm afternoon golden light from upper-left.
Color palette: warm cream ground, sage green plants,
terracotta stone, warm wood brown, pink and yellow flowers.
Transparent background, isolated scene elements.
No text, no watermark, high detail on textures.
Canvas: 1200x800px landscape.
```

> **LƯU Ý:** Lưu output của prompt này làm `style_reference.png`.
> Paste ảnh này vào MỌI prompt tiếp theo dưới dạng img2img reference.

---

## 3. MASTER PROMPT SET (15 assets = 5 slot × 3 state)

### Cấu trúc prompt chuẩn
```
[img2img: style_reference.png, strength: 0.35]
Hand-painted cartoon, 2.5D side-view garden element.
ELEMENT: {ELEMENT_NAME}
STATE: {STATE_NAME} — {STATE_DESCRIPTION}
Visual details: {SPECIFIC_DETAILS}
Condition keywords: {CONDITION_KEYWORDS}
Palette: warm cream, terracotta stone, sage green, warm wood, pink/yellow flowers
Lighting: soft golden afternoon, shadow from upper-left
Transparent background, isolated element, 400x600px canvas, 20px padding.
No text, no watermark, thin black outline 2px.
```

---

### SLOT 1 — Front Gate (`slot1_gate`)

**STATE 0 — Broken** → file: `gate_0_broken.png`
```
[img2img: style_reference.png, strength: 0.35]
Hand-painted cartoon, 2.5D side-view garden element.
ELEMENT: Garden front gate with stone pillars
STATE: broken, neglected, before restoration
Visual details: wooden gate planks rotting and falling off,
  rusty iron hinges barely holding, left gate door hanging at angle,
  cracked stone pillars with moss and weeds growing from cracks,
  overgrown brown weeds at base of pillars,
  bird nest sitting on top of right pillar.
Condition keywords: broken, weathered, neglected, abandoned, crumbling, rusty
Palette: dark weathered wood, grey cracked stone, brown dead weeds, rust orange
Lighting: soft golden afternoon, shadow from upper-left
Transparent background PNG, isolated element, 400x600px, 20px padding.
```

**STATE 1 — Mid (in progress)** → file: `gate_1_mid.png`
```
[img2img: style_reference.png, strength: 0.35]
Hand-painted cartoon, 2.5D side-view garden element.
ELEMENT: Garden front gate with stone pillars
STATE: mid-restoration, work in progress
Visual details: stone pillars repaired and cleaned, fresh mortar visible,
  new wooden gate planks installed but unpainted, raw timber color,
  iron hinges replaced, gate stands straight but plain,
  weeds removed, bare dirt at base, scaffolding plank leaning on side.
Condition keywords: under construction, being repaired, fresh, plain, new wood
Palette: fresh wood light brown, clean grey stone, bare earth
Lighting: soft golden afternoon, shadow from upper-left
Transparent background PNG, isolated element, 400x600px, 20px padding.
```

**STATE 2 — Done** → file: `gate_2_done.png`
```
[img2img: style_reference.png, strength: 0.35]
Hand-painted cartoon, 2.5D side-view garden element.
ELEMENT: Garden front gate with stone arch and lanterns
STATE: fully restored, beautiful, completed
Visual details: elegant stone arch over gate,
  iron scrollwork gate painted black with gold tips,
  two warm-glowing lanterns on top of pillars,
  purple wisteria vines climbing the arch,
  small yellow flowers growing at base of pillars,
  clean stone path leading through gate.
Condition keywords: beautiful, elegant, completed, lush, glowing, flourishing
Palette: dark iron, gold accent, purple wisteria, warm lantern glow, yellow flowers
Lighting: soft golden afternoon, shadow from upper-left, lantern adds warm point light
Transparent background PNG, isolated element, 400x600px, 20px padding.
```

---

### SLOT 2 — Hedge (`slot2_hedge`)

**STATE 0 — Broken** → file: `hedge_0_broken.png`
```
[img2img: style_reference.png, strength: 0.35]
Hand-painted cartoon, 2.5D side-view garden element.
ELEMENT: Garden hedge bushes (pair, left and right symmetric)
STATE: broken, overgrown, before restoration
Visual details: two scraggly irregular bushes, branches sticking out in all directions,
  brown dead leaves mixed with sparse green, overall shape messy and unkempt,
  some branches broken and drooping, gaps showing through the bush.
Condition keywords: overgrown, messy, scraggly, dead patches, unkempt
Palette: dark brown dead branches, sparse dull green, dusty leaves
Lighting: soft golden afternoon, shadow from upper-left
Transparent background PNG, isolated element, 400x600px, 20px padding.
```

**STATE 1 — Mid** → file: `hedge_1_mid.png`
```
[img2img: style_reference.png, strength: 0.35]
Hand-painted cartoon, 2.5D side-view garden element.
ELEMENT: Garden hedge bushes (pair, left and right symmetric)
STATE: trimmed but not finished
Visual details: two bushes roughly trimmed into box shape,
  fresh cuts visible on top and sides, some uneven areas,
  mostly green but still sparse in places, no flowers yet,
  hedge shears left leaning against one bush.
Condition keywords: trimmed, rough cut, in progress, angular, unfinished
Palette: medium green, fresh cut stems showing lighter green
Lighting: soft golden afternoon, shadow from upper-left
Transparent background PNG, isolated element, 400x600px, 20px padding.
```

**STATE 2 — Done** → file: `hedge_2_done.png`
```
[img2img: style_reference.png, strength: 0.35]
Hand-painted cartoon, 2.5D side-view garden element.
ELEMENT: Garden topiary hedge bushes (pair, left and right symmetric)
STATE: fully restored, beautiful topiary
Visual details: two perfectly rounded topiary balls, lush dark green,
  small pink roses blooming at base of each topiary,
  clean and manicured, dense full foliage, slight texture variation.
Condition keywords: lush, manicured, topiary, full, beautiful, roses
Palette: rich dark green topiary, pink roses, warm brown stems at base
Lighting: soft golden afternoon, shadow from upper-left
Transparent background PNG, isolated element, 400x600px, 20px padding.
```

---

### SLOT 3 — Flower Bed (`slot3_flowerbed`)

**STATE 0 — Broken** → file: `flowerbed_0_broken.png`
```
[img2img: style_reference.png, strength: 0.35]
Hand-painted cartoon, 2.5D side-view garden element.
ELEMENT: Small garden flower bed, oval shape
STATE: dry, neglected, before restoration
Visual details: cracked dry earth, small patches of dead brown grass and weeds,
  no flowers at all, one or two dry sticks poking up,
  soil looks pale and depleted, small rocks scattered.
Condition keywords: dry, cracked, barren, neglected, no flowers, dead
Palette: pale dry earth, dull brown dead weeds, dusty grey
Lighting: soft golden afternoon, shadow from upper-left
Transparent background PNG, isolated element, 400x600px, 20px padding.
```

**STATE 1 — Mid** → file: `flowerbed_1_mid.png`
```
[img2img: style_reference.png, strength: 0.35]
Hand-painted cartoon, 2.5D side-view garden element.
ELEMENT: Small garden flower bed, oval shape
STATE: freshly planted, sprouting
Visual details: freshly turned dark moist earth, rich brown soil,
  small green sprouts just emerging, 3-4 tiny seedlings visible,
  small watering can nearby, garden edging border installed.
Condition keywords: planted, sprouting, fresh soil, seedlings, hopeful
Palette: rich dark brown soil, tiny light green sprouts
Lighting: soft golden afternoon, shadow from upper-left
Transparent background PNG, isolated element, 400x600px, 20px padding.
```

**STATE 2 — Done** → file: `flowerbed_2_done.png`
```
[img2img: style_reference.png, strength: 0.35]
Hand-painted cartoon, 2.5D side-view garden element.
ELEMENT: Small garden flower bed, oval shape, fully blooming
STATE: fully restored, blooming with flowers
Visual details: lush green foliage base, three pink rose-like flowers blooming center,
  two bright yellow flowers accent sides, small white daisies filling gaps,
  neat garden edging border, rich dark earth visible between plants.
Condition keywords: blooming, lush, colorful, flourishing, beautiful
Palette: rich green leaves, pink flowers, yellow flowers, white daisies, dark earth
Lighting: soft golden afternoon, shadow from upper-left
Transparent background PNG, isolated element, 400x600px, 20px padding.
```

---

### SLOT 4 — Well (`slot4_well`)

**STATE 0 — Broken** → file: `well_0_broken.png`
```
[img2img: style_reference.png, strength: 0.35]
Hand-painted cartoon, 2.5D side-view garden element.
ELEMENT: Garden stone well
STATE: broken, collapsed, before restoration
Visual details: stone well walls partially collapsed,
  stones fallen and scattered around base, wooden roof cover rotted and fallen,
  rope frayed and hanging uselessly, weeds growing from the cracks,
  overall structure tilting and unsafe.
Condition keywords: collapsed, broken, fallen stones, rotted wood, unsafe
Palette: grey crumbled stone, dark weathered wood, brown dead weeds
Lighting: soft golden afternoon, shadow from upper-left
Transparent background PNG, isolated element, 400x600px, 20px padding.
```

**STATE 1 — Mid** → file: `well_1_mid.png`
```
[img2img: style_reference.png, strength: 0.35]
Hand-painted cartoon, 2.5D side-view garden element.
ELEMENT: Garden stone well
STATE: being rebuilt, work in progress
Visual details: stone walls rebuilt halfway, fresh mortar between clean stones,
  temporary wooden plank across the top, new rope coiled nearby,
  mason's trowel resting on edge, cleared area around base.
Condition keywords: under construction, half-built, fresh mortar, in progress
Palette: clean grey stone, fresh mortar cream, raw wood
Lighting: soft golden afternoon, shadow from upper-left
Transparent background PNG, isolated element, 400x600px, 20px padding.
```

**STATE 2 — Done** → file: `well_2_done.png`
```
[img2img: style_reference.png, strength: 0.35]
Hand-painted cartoon, 2.5D side-view garden element.
ELEMENT: Garden stone well, fully restored
STATE: fully restored, beautiful, completed
Visual details: perfectly built round stone well, clean fitted stones,
  charming wooden peaked roof with terracotta tiles,
  iron crank handle, clean rope with wooden bucket,
  small water droplet visible inside, climbing flowers around base,
  two small potted plants either side.
Condition keywords: beautiful, complete, charming, rustic, functional
Palette: warm grey stone, terracotta roof tiles, dark wood, green climbing plants
Lighting: soft golden afternoon, shadow from upper-left
Transparent background PNG, isolated element, 400x600px, 20px padding.
```

---

### SLOT 5 — Bench (`slot5_bench`)

**STATE 0 — Broken** → file: `bench_0_broken.png`
```
[img2img: style_reference.png, strength: 0.35]
Hand-painted cartoon, 2.5D side-view garden element.
ELEMENT: Garden bench with lamp post
STATE: broken, neglected, before restoration
Visual details: wooden bench with broken seat plank missing in middle,
  front legs bent outward, back support cracked,
  old lamp post next to bench with cracked glass shade,
  lamp not working, paint all chipped off bench, dark weathered wood.
Condition keywords: broken, cracked, chipped paint, bent, unusable
Palette: dark weathered grey wood, cracked paint, rusted metal lamp
Lighting: soft golden afternoon, shadow from upper-left
Transparent background PNG, isolated element, 400x600px, 20px padding.
```

**STATE 1 — Mid** → file: `bench_1_mid.png`
```
[img2img: style_reference.png, strength: 0.35]
Hand-painted cartoon, 2.5D side-view garden element.
ELEMENT: Garden bench with lamp post
STATE: newly built, not yet decorated
Visual details: new wooden bench, all planks intact, sanded smooth,
  freshly painted white but paint still drying (slight wet sheen),
  new lamp post installed, clean metal, lamp not yet lit,
  no cushion yet, no decorations, clean bare ground around it.
Condition keywords: new, plain, freshly painted, clean, undecorated
Palette: fresh white paint, clean natural wood, brushed metal lamp
Lighting: soft golden afternoon, shadow from upper-left
Transparent background PNG, isolated element, 400x600px, 20px padding.
```

**STATE 2 — Done** → file: `bench_2_done.png`
```
[img2img: style_reference.png, strength: 0.35]
Hand-painted cartoon, 2.5D side-view garden element.
ELEMENT: Garden bench with lamp post, fully restored
STATE: fully restored, cozy and beautiful
Visual details: elegant white bench with green cushion and small pillow,
  ornate wrought iron armrests with leaf motif,
  vintage lamp post with warm glowing yellow light,
  pink flower bundles tied to lamp post,
  small potted pink flowers at base of lamp,
  two butterflies resting nearby.
Condition keywords: cozy, elegant, glowing, beautiful, inviting, charming
Palette: white bench, green cushion, warm lamp glow, pink flowers, iron black
Lighting: soft golden afternoon plus warm lamp point light, shadow from upper-left
Transparent background PNG, isolated element, 400x600px, 20px padding.
```

---

## 4. INTEGRATION SPEC (game code)

### Folder structure
```
assets/
  garden_restoration/
    style_reference.png          ← anchor image (không dùng trong game)
    slot1_gate/
      gate_0_broken.png
      gate_1_mid.png
      gate_2_done.png
    slot2_hedge/
      hedge_0_broken.png
      hedge_1_mid.png
      hedge_2_done.png
    slot3_flowerbed/
      flowerbed_0_broken.png
      flowerbed_1_mid.png
      flowerbed_2_done.png
    slot4_well/
      well_0_broken.png
      well_1_mid.png
      well_2_done.png
    slot5_bench/
      bench_0_broken.png
      bench_1_mid.png
      bench_2_done.png
```

### State logic per slot
| slotProg | State hiển thị |
|---|---|
| 0 | STATE 0 (broken) |
| 1–4 | STATE 1 (mid) |
| 5 | STATE 2 (done) |

### CSS layer system
```css
.garden-slot       { position: absolute; }
.garden-slot img   { position: absolute; top:0; left:0; width:100%; height:100%;
                     transition: opacity 0.8s ease; pointer-events: none; }
```

### Position map (absolute, trên SVG background 390×340)
| Slot | left | top | width | height |
|---|---|---|---|---|
| slot1_gate | 70px | 200px | 110px | 140px |
| slot2_hedge | 30px | 220px | 100px | 120px |
| slot4_well | 280px | 205px | 90px | 130px |
| slot5_bench | 255px | 215px | 100px | 120px |
| slot3_flowerbed | 155px | 245px | 80px | 80px |

> Các giá trị position cần adjust sau khi có asset thật.
> Dùng browser DevTools để fine-tune.

### HTML template per slot
```html
<div class="garden-slot" id="g-slot1">
  <img src="assets/garden_restoration/slot1_gate/gate_0_broken.png"
       style="opacity:${prog===0?1:0}">
  <img src="assets/garden_restoration/slot1_gate/gate_1_mid.png"
       style="opacity:${prog>=1&&prog<5?1:0}">
  <img src="assets/garden_restoration/slot1_gate/gate_2_done.png"
       style="opacity:${prog===5?1:0}">
</div>
```

---

## 5. AUDIT CHECKLIST

### Trước khi accept 1 ảnh từ AI gen
- [ ] Perspective: 2.5D side-view, ~15° top-down — không bị flat/top-down thẳng
- [ ] Style: hand-painted cartoon, có watercolor wash texture — không bị vector flat
- [ ] Palette: dùng đúng màu anchor — không có màu lạnh/xanh/neon
- [ ] Background: transparent PNG — không có ground/sky/context bên ngoài element
- [ ] Lighting: warm golden, shadow từ upper-left — không có harsh shadow/cold light
- [ ] Scale: element chiếm ~70% canvas, không bị quá nhỏ hoặc tràn ra ngoài padding
- [ ] Detail: texture rõ (gỗ, đá, lá) — readable ở kích thước nhỏ trên mobile

### Sau khi có đủ 15 asset
- [ ] Gate (0→1→2): narrative rõ ràng, cùng vị trí/scale trong frame
- [ ] Hedge (0→1→2): cặp trái-phải đối xứng, cùng size
- [ ] Flowerbed (0→1→2): cùng shape oval, cùng vị trí center
- [ ] Well (0→1→2): cùng footprint, không scale quá lớn
- [ ] Bench (0→1→2): bench + lamp post consistent position
- [ ] Tất cả 5 slot DONE cùng lúc trông coherent khi xếp trong garden

### Integration test
- [ ] PNG load nhanh (mỗi file < 150KB sau compress)
- [ ] Opacity transition 0.8s smooth, không flicker
- [ ] Không overlap nhau sai — check z-index
- [ ] Retina: test trên 2x device, không bị pixelated

---

## 6. VERSIONING

| Version | Date | Thay đổi |
|---|---|---|
| 1.0 | 2026-06-23 | Khởi tạo master spec, 5 slot × 3 state, 15 prompts |

---

*Mọi thay đổi art direction phải update file này trước khi gen asset mới.*

# Implementation Plan: Thai Alphabet & Granddaughters' Name Tracing Studio

## 1. Project Overview & Child-First Experience
* **Target Widget:** `widget_alphabet.html` (Standalone offline HTML5 / CSS / Vanilla JS).
* **Two Operating Modes:**
  * **Portrait Mode:** 44 Thai Consonants (ก to ฮ) Explorer & single-letter tracing with native audio.
  * **Landscape Mode:** "Granddaughter Name Studio" — rotating phone sideways reveals the wide Name Studio with child-friendly tap-to-talk voice interaction.

---

## 2. Granddaughters' & Family Names
* **Dada:** **ดาด้า** (ด + า + ด้ + า)
* **Sayda:** **เซด้า** (เ + ซ้ + ด + า) [Primary Priority]
* **Seda:** **เซดา** (เ + ซ + ด + า) [Supported Variant]
* **Mom Beam:** **บีม** (บี + ม)
* **Grandma Jeab:** **เจี๊ยบ** (เ + จี๊ + ย + บ)

---

## 3. Critic Pre-Flight Audit & 7 Mandatory Safeguards
The Critic Sub-Agent (`Pro` model) audited mobile Safari and Android Chrome and delivered 7 critical safeguards:
1. **Tap-to-Talk Medallion on Rotation:** Mobile browsers block microphone and audio without a direct user touch. On rotation, show an animated glowing mic button: *"แตะเพื่อคุยกัน"* (Tap to talk). One tap grants the browser audio token.
2. **Offline & Permission Fallback:** If internet is down or mic times out twice, smoothly transition to two visual avatar cards (🌸 เซด้า / 🌟 ดาด้า) so the child is never stuck.
3. **Phonetic Child Voice Normalizer:** Normalizes slurs, elisions, and accents across variants (`ดาด้า`, `ดาดา`, `Dada`, `เซด้า`, `เซดา`, `Sayda`).
4. **Speaker Self-Echo Barrier:** Ensures TTS greeting (*"ชื่อเล่นอะไรคะ?"*) fully finishes + 350ms hardware buffer before the microphone turns on, preventing the phone from hearing itself.
5. **Orientation Debounce:** 150ms debounce on `orientationchange` and `resize` to prevent Safari from reading stale portrait dimensions.
6. **Thai Syllable Cluster Stacking:** Tone marks (like `้` Mai Tho) sit **above** consonants (`ด้`, `ซ้`), not in isolated horizontal boxes. The child traces the base consonant first, then the tone mark above it.
7. **Mom's Settings Hold Gate:** The Settings Cog (⚙️) requires a 2-second hold so fast children's fingers don't accidentally open menus while tracing.

---

## 4. Phase-by-Phase Punch List

### Phase 1: Landscape Name Studio & Voice Interaction Engine
- [ ] Implement debounced rotation listener (150ms) for older iOS Safari & Android Chrome.
- [ ] Build glowing Tap-to-Talk medallion giving transient user activation token.
- [ ] Wire sequential audio: TTS greeting -> 350ms pause -> Web Speech API (`th-TH`).
- [ ] Integrate polite Thai nudge prompt: *"พูดดังๆ อีกทีนะคะ คนเก่ง"* on silence.
- [ ] Add 2-strike fallback to animated avatar cards for 100% offline resilience.
- [ ] Build syllable cluster layout engine for wide landscape tracing (`เซ`, `ด้`, `า`).

### Phase 2: Vector Centerline Extraction for Thai Glyphs
- [ ] Extract authentic monoline medial spines from Apple's schoolbook font `Ayuthaya.ttf`.
- [ ] Build vector coordinate paths for letters needed in both names: `ด`, `า`, `้`, `เ`, `ซ`, `บ`, `ี`, `ม`, `จ`, `ย`.
- [ ] Build initial set of core Thai consonants (`ก` through `ฮ`).
- [ ] Verify zero-blob loops and smooth continuous tangents in 460x460 coordinate space.

### Phase 3: Dual-Layer Rainbow-to-Black Tracing Engine
- [ ] Port the direction-locked wavefront tracing engine from `widget_numbers.html`.
- [ ] Underpass layer: Bold solid black line (`36px` / `30px`) fills smoothly behind finger touch.
- [ ] Overpass layer: Fine rainbow guide line (`12px`) remains visible over uncompleted strokes and crossings.
- [ ] Add celebration chime + confetti cannon when full name or letter is completed.

### Phase 4: Portrait Mode — Thai Consonants Explorer (ก to ฮ)
- [ ] 44 Thai consonant cards with traditional mnemonic words (ก ไก่, ข ไข่, ฃ ขวด...).
- [ ] Audio pronunciation trigger for each consonant.
- [ ] Single-letter tracing modal matching the numbers app.
- [ ] Mom's Settings Cog (⚙️) with 2-second hold gate to toggle Repeat vs. Auto-Advance.

### Phase 5: Mobile Audit & GitHub Pages Deployment
- [ ] Cross-test in headless browser and responsive viewports.
- [ ] Deploy to GitHub Pages at `https://imgt511.github.io/kids/widget_alphabet.html`.
- [ ] Update `CONTRACT.prose.md`, `PROJECT_STATUS.md`, and session logs.

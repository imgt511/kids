# Granddaughters Learning Widgets (สนุกกับการเรียนรู้)

Custom, ultra-lightweight, offline educational micro-widgets built for two young learners in Thailand:
* **Age 5:** Preparing for kindergarten/primary school in Bangkok (Thai & English literacy, touch-to-count).
* **Age 7:** Grade 1/2 arithmetic, bilingual math bridging, and reading confidence.

---

## Architecture Principles
1. **Zero Data / 100% Offline:** Single self-contained HTML files with embedded styles, canvas drawing, and sounds.
2. **Old & Budget Phone Optimized:** No React or heavy bundles. Pure DOM and HTML5 Canvas running at 60 FPS on low-cost devices.
3. **Bilingual Dual-Mode:**
   * Thai numerals (๑, ๒, ๓) and spoken Thai (`th-TH`).
   * English numerals (1, 2, 3) and spoken English (`en-US`).
   * Bridge mode linking both scripts together.
4. **PWA Friendly:** Add directly to the home screen for an app-like experience with no app store downloads.

---

## Widget Directory
* **`index.html`**: Kid-friendly launcher hub with big colorful avatar buttons.
* **`widget_numbers.html`**: Tactile fruit popping counter & addition game (Ages 5 & 7).
* **`widget_tracing.html`**: Stroke tracing for Thai consonants (ก-ฮ) and English alphabet (A-Z).

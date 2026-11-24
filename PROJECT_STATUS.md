# Project Status: Granddaughters Learning Widgets

Last session: 2026-11-24
Tool used: Antigravity
Status: Created automated unit test suites in `tests/` using `pytest` and `vitest` (`vitest.config.mjs`) covering core widgets plus both live audition apps (`voice_audition/` and `alphabet_audition/`). Verified PWA manifest/service-worker sync (`glw-leda-v10`, `thai-voice-audition-v3`, `thai-alphabet-audition-v2`), portal links, stale reference removal, JPEG portraits, all 94 Leda `.m4a` AAC clips, embedded audio payloads, all 30 alphabet audition folders (46 clips each), 33 voice audition folders, Thai alphabet/Name Studio layout and wavefront tracing, numbers tracing, math addition challenge, audition UI controls, and all 3 `sw.js` service workers (14 pytest checks + 28 vitest checks passing 100%). Cleaned up duplicate `installAllOffline()` / `serviceWorker.register("./sw.js")` block inside `setVoice(v)` in `alphabet_audition/index.html`, removed `.agents/rules/testing-catchup-reminder.md`, and added preflight acceptance gates to `CONTRACT.prose.md`.
Next step: Field-test the updated full-glass Name Studio on phones (Pixel 9 Pro, iPhone 17 Pro, iPhone 15 Pro, Bison GT); next milestone: App 2 Math Addition fruit-counting overhaul.
Open issues: Pre-existing missing clip `voice_audition/audio/v30_puck/en_10.m4a` (locked in `tests/test_audition_apps.py`).

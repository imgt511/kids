import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { ROOT, loadWidgetVm } from "./helpers/widgetHarness.mjs";

describe("widget_alphabet.html", () => {
  it("contains all 44 Thai consonants with valid centerline strokes inside [0, 460]", () => {
    const { evalExpr } = loadWidgetVm("widget_alphabet.html");
    const consonants = evalExpr("THAI_CONSONANTS");
    const tracePaths = evalExpr("TRACE_PATHS");

    expect(consonants).toHaveLength(44);
    for (const entry of consonants) {
      const strokes = tracePaths[entry.char];
      expect(Array.isArray(strokes), `Missing strokes for ${entry.char}`).toBe(true);
      expect(strokes.length).toBeGreaterThanOrEqual(1);
      for (const stroke of strokes) {
        expect(stroke.length).toBeGreaterThanOrEqual(2);
        for (const [x, y] of stroke) {
          expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
          expect(x).toBeGreaterThanOrEqual(0);
          expect(x).toBeLessThanOrEqual(460);
          expect(y).toBeGreaterThanOrEqual(0);
          expect(y).toBeLessThanOrEqual(460);
        }
      }
    }
  });

  it("navigates forward and wraps backward across consonants with Leda audio", () => {
    const { vmCtx, evalExpr, getEl, playedAudioSrcs } = loadWidgetVm("widget_alphabet.html");

    vmCtx.nextConsonant();
    expect(evalExpr("currentIndex")).toBe(1);
    expect(getEl("heroChar").innerText).toBe("ข");
    expect(getEl("letterCounter").innerText).toBe("2 / ๔๔");
    expect(playedAudioSrcs.at(-1)).toBe("./audio_leda/short_alpha_02.m4a");

    vmCtx.selectConsonant(0);
    vmCtx.prevConsonant();
    expect(evalExpr("currentIndex")).toBe(43);
    expect(getEl("heroChar").innerText).toBe("ฮ");
    expect(playedAudioSrcs.at(-1)).toBe("./audio_leda/short_alpha_44.m4a");
  });

  it("selects pedagogical coaching prompts and runs adaptive easel audio gating", () => {
    const { vmCtx, evalExpr, storageMap, playedAudioSrcs } = loadWidgetVm("widget_alphabet.html");

    expect(vmCtx.getCoachingPhrase({ char: "ก", name: "ไก่" })).toContain("ไม่มีหัวกลม");
    expect(vmCtx.getCoachingPhrase({ char: "ธ", name: "ธง" })).toContain("ไม่มีหัวกลม");
    expect(vmCtx.getCoachingPhrase({ char: "ร", name: "เรือ" })).toContain("หัวกลมข้างล่าง");
    expect(vmCtx.getCoachingPhrase({ char: "ว", name: "แหวน" })).toContain("หัวกลมข้างล่าง");
    for (const twoStroke of ["ญ", "ฐ", "ศ", "ส", "ษ"]) {
      expect(vmCtx.getCoachingPhrase({ char: twoStroke, name: "test" })).not.toContain(
        "เริ่มเขียนจากหัวกลมก่อน แล้วลากเส้นตามรอยนะคะ"
      );
    }
    expect(vmCtx.getCoachingPhrase({ char: "ข", name: "ไข่" })).toContain(
      "เริ่มเขียนจากหัวกลมก่อน"
    );

    vmCtx.playAdaptiveEaselEntry();
    expect(playedAudioSrcs.at(-1)).toBe("./audio_leda/coach_alpha_01.m4a");
    expect(JSON.parse(storageMap.get("glw_coached_alpha_v2"))["ก"]).toBe(true);
    expect(evalExpr("coachedAlpha['ก']")).toBe(true);

    vmCtx.playAdaptiveEaselEntry();
    expect(playedAudioSrcs.at(-1)).toBe("./audio_leda/short_alpha_01.m4a");
  });

  it("warns on wrong initial touch and completes portrait tracing", () => {
    const { vmCtx, evalExpr, storageMap, playedAudioSrcs } = loadWidgetVm("widget_alphabet.html", {
      localStorageInit: { boo_boo_stars_alpha: "2" }
    });

    vmCtx.openTraceModal();
    const strokes = evalExpr("activeStrokes");
    expect(strokes.length).toBeGreaterThan(0);

    const p0 = strokes[0][0];
    vmCtx.lockInitialTouch(p0.x0 + 150, p0.y0 - 150);
    expect(evalExpr("wrongStartNotified")).toBe(true);
    expect(playedAudioSrcs.at(-1)).toBe("./audio_leda/coach_alpha_01.m4a");

    vmCtx.initTraceModel();
    const freshStrokes = evalExpr("activeStrokes");
    for (const segs of freshStrokes) {
      vmCtx.lockInitialTouch(segs[0].mx, segs[0].my);
      for (const s of segs) {
        vmCtx.advanceWavefront(s.mx, s.my);
        vmCtx.checkTraceCompletion();
      }
    }

    expect(evalExpr("traceCompleted")).toBe(true);
    expect(evalExpr("stars")).toBe(3);
    expect(storageMap.get("boo_boo_stars_alpha")).toBe("3");
  });

  it("enforces 34px lock, 1-to-1 tracking, and zero cross-stroke bleed in portrait tracing", () => {
    const { vmCtx, evalExpr } = loadWidgetVm("alphabet.html");
    const consonants = evalExpr("THAI_CONSONANTS");
    const dIdx = consonants.findIndex((c) => c.char === "ด");
    expect(dIdx).toBeGreaterThan(0);

    vmCtx.selectConsonant(dIdx);
    vmCtx.openTraceModal();
    const strokes = evalExpr("activeStrokes");
    expect(strokes.length).toBeGreaterThanOrEqual(4);

    // Touching >34px away from all strokes does not lock or fill
    vmCtx.lockInitialTouch(10, 10);
    expect(evalExpr("currentCursor")).toBeNull();
    expect(strokes.some((segs) => segs.some((s) => s.filled))).toBe(false);

    // Trace stem0 step-by-step: strictly 1-to-1 with 0 bleed into arch1 or innerLoop
    const stem0 = strokes[0];
    const arch1 = strokes[1];
    const innerLoop = strokes[3];
    vmCtx.lockInitialTouch(stem0[0].mx, stem0[0].my);
    for (let i = 0; i < stem0.length; i++) {
      vmCtx.advanceWavefront(stem0[i].mx, stem0[i].my);
      expect(stem0.filter((s) => s.filled).length).toBe(i + 1);
    }
    expect(arch1.filter((s) => s.filled).length).toBe(0);
    expect(innerLoop.filter((s) => s.filled).length).toBe(0);
  });

  it("lays out Jayda & Dada Name Studio across viewports with isolated combining marks", () => {
    const { vmCtx, evalExpr, getEl, storageMap, playedAudioSrcs, getFullscreenRequests } =
      loadWidgetVm("widget_alphabet.html");

    const box = getEl("nameCanvasBox");
    const nCanvas = getEl("nameCanvas");

    for (const [w, h] of [
      [820, 330],
      [650, 315]
    ]) {
      box.clientWidth = w;
      box.clientHeight = h;
      nCanvas.width = w;
      nCanvas.height = h;

      for (const [girlKey, expectedName] of [
        ["jayda", "เจด้า"],
        ["dada", "ดาด้า"]
      ]) {
        const fsBefore = getFullscreenRequests();
        vmCtx.selectGirl(girlKey);

        expect(evalExpr("currentNameString")).toBe(expectedName);
        expect(getEl("nameCanvasStage").classList.contains("active")).toBe(true);
        expect(getEl("landscapeContainer").classList.contains("picker-mode")).toBe(false);
        expect(getEl("portraitPickerStage").style.display).toBe("none");
        expect(getFullscreenRequests()).toBe(fsBefore + 1);
        expect(playedAudioSrcs.at(-1)).toBe(`./audio_leda/greet_${girlKey}.m4a`);

        const segsList = evalExpr("nameSegments");
        expect(segsList.length).toBeGreaterThan(0);

        const byChar = new Map();
        for (const segs of segsList) {
          expect(segs.length).toBeGreaterThan(0);
          for (const s of segs) {
            expect(Number.isFinite(s.x0) && Number.isFinite(s.y0)).toBe(true);
            expect(Number.isFinite(s.x1) && Number.isFinite(s.y1)).toBe(true);
            expect(s.x0).toBeGreaterThanOrEqual(0);
            expect(s.x0).toBeLessThanOrEqual(w);
            expect(s.x1).toBeGreaterThanOrEqual(0);
            expect(s.x1).toBeLessThanOrEqual(w);
            expect(s.y0).toBeGreaterThanOrEqual(0);
            expect(s.y0).toBeLessThanOrEqual(h);
            expect(s.y1).toBeGreaterThanOrEqual(0);
            expect(s.y1).toBeLessThanOrEqual(h);

            if (!byChar.has(segs.charIdx)) {
              byChar.set(segs.charIdx, {
                isMark: Boolean(segs.isMark),
                minX: Infinity,
                maxX: -Infinity,
                minY: Infinity,
                maxY: -Infinity
              });
            }
            const st = byChar.get(segs.charIdx);
            st.minX = Math.min(st.minX, s.x0, s.x1);
            st.maxX = Math.max(st.maxX, s.x0, s.x1);
            st.minY = Math.min(st.minY, s.y0, s.y1);
            st.maxY = Math.max(st.maxY, s.y0, s.y1);
          }
        }

        const entries = [...byChar.entries()].sort((a, b) => a[0] - b[0]);
        const markEntry = entries.find(([, v]) => v.isMark);
        expect(markEntry).toBeDefined();
        const baseEntry = entries.find(([idx]) => idx === markEntry[0] - 1);
        expect(baseEntry && !baseEntry[1].isMark).toBe(true);

        const gapY = baseEntry[1].minY - markEntry[1].maxY;
        expect(gapY).toBeGreaterThanOrEqual(12);
        expect(markEntry[1].minX).toBeGreaterThanOrEqual(baseEntry[1].minX - 15);
        expect(markEntry[1].maxX).toBeLessThanOrEqual(baseEntry[1].maxX + 20);

        // Wavefront isolation: tracing base 'ด' top must not auto-fill '้'
        const baseTopSeg = segsList.find((s) => s.charIdx === baseEntry[0])[0];
        vmCtx.lockNameTouch(baseTopSeg.mx, baseTopSeg.my);
        vmCtx.advanceNameWavefront(baseTopSeg.mx, baseEntry[1].minY);
        const markFilledEarly = segsList
          .filter((s) => s.charIdx === markEntry[0])
          .some((segs) => segs.some((s) => s.filled));
        expect(markFilledEarly).toBe(false);

        const markSeg = segsList.find((s) => s.charIdx === markEntry[0])[0];
        vmCtx.lockNameTouch(markSeg.mx, markSeg.my);
        const markFilledAfterTouch = segsList
          .filter((s) => s.charIdx === markEntry[0])
          .some((segs) => segs.some((s) => s.filled));
        expect(markFilledAfterTouch).toBe(true);

        // 1-to-1 tracking & zero cross-branch bleed on base 'ด'
        vmCtx.clearNameCanvas();
        const freshSegs = evalExpr("nameSegments");
        const dStrokes = freshSegs.filter((s) => s.charIdx === baseEntry[0]);
        const stem0 = dStrokes[0];
        const arch1 = dStrokes[1];
        const innerLoop = dStrokes[3];
        vmCtx.lockNameTouch(stem0[0].mx, stem0[0].my);
        for (let i = 0; i < stem0.length; i++) {
          vmCtx.advanceNameWavefront(stem0[i].mx, stem0[i].my);
          expect(stem0.filter((x) => x.filled).length).toBe(i + 1);
        }
        expect(arch1.filter((s) => s.filled).length).toBe(0);
        expect(innerLoop.filter((s) => s.filled).length).toBe(0);

        // Full completion when tracing main strokes
        vmCtx.clearNameCanvas();
        const starsBefore = evalExpr("stars");
        const compSegs = evalExpr("nameSegments");
        for (const segs of compSegs) {
          if (segs.length <= 3) continue;
          vmCtx.lockNameTouch(segs[0].mx, segs[0].my);
          for (const s of segs) {
            vmCtx.advanceNameWavefront(s.mx, s.my);
            vmCtx.checkNameCompletion();
          }
        }
        expect(evalExpr("nameCompleted")).toBe(true);
        expect(evalExpr("stars")).toBe(starsBefore + 3);
        expect(storageMap.get("boo_boo_stars_alpha")).toBe(String(starsBefore + 3));
        expect(playedAudioSrcs.at(-1)).toBe(`./audio_leda/praise_${girlKey}.m4a`);
      }
    }

    vmCtx.clearNameCanvas();
    expect(evalExpr("nameCompleted")).toBe(false);
    expect(evalExpr("nameSegments").some((segs) => segs.some((s) => s.filled))).toBe(false);

    vmCtx.resetNameStudio();
    expect(getEl("nameCanvasStage").classList.contains("active")).toBe(false);
    expect(getEl("landscapeContainer").classList.contains("picker-mode")).toBe(true);
    expect(getEl("portraitPickerStage").style.display).toBe("flex");

    vmCtx.selectGirl("unknown");
    expect(evalExpr("currentGirlKey")).toBe("jayda");
    expect(evalExpr("currentNameString")).toBe("เจด้า");
  });
});

describe("alphabet.html (base)", () => {
  it("loads all 44 consonants and navigates with Leda audio", () => {
    const { vmCtx, evalExpr, getEl, playedAudioSrcs } = loadWidgetVm("alphabet.html");

    expect(evalExpr("THAI_CONSONANTS")).toHaveLength(44);
    expect(evalExpr("ENABLE_NAME_STUDIO")).toBe(false);

    vmCtx.nextConsonant();
    expect(evalExpr("currentIndex")).toBe(1);
    expect(getEl("heroChar").innerText).toBe("ข");
    expect(playedAudioSrcs.at(-1)).toBe("./audio_leda/short_alpha_02.m4a");

    vmCtx.selectConsonant(0);
    vmCtx.prevConsonant();
    expect(evalExpr("currentIndex")).toBe(43);
    expect(getEl("heroChar").innerText).toBe("ฮ");
    expect(playedAudioSrcs.at(-1)).toBe("./audio_leda/short_alpha_44.m4a");
  });

  it("completes portrait tracing under base star key without touching family stars", () => {
    const { vmCtx, evalExpr, storageMap } = loadWidgetVm("alphabet.html", {
      localStorageInit: { glw_stars_alphabet_base: "4", boo_boo_stars_alpha: "9" }
    });

    vmCtx.openTraceModal();
    const freshStrokes = evalExpr("activeStrokes");
    for (const segs of freshStrokes) {
      vmCtx.lockInitialTouch(segs[0].mx, segs[0].my);
      for (const s of segs) {
        vmCtx.advanceWavefront(s.mx, s.my);
        vmCtx.checkTraceCompletion();
      }
    }

    expect(evalExpr("traceCompleted")).toBe(true);
    expect(evalExpr("stars")).toBe(5);
    expect(storageMap.get("glw_stars_alphabet_base")).toBe("5");
    expect(storageMap.get("boo_boo_stars_alpha")).toBe("9");
  });

  it("keeps landscape Name Studio disabled even when rotated sideways", () => {
    const { vmCtx, evalExpr } = loadWidgetVm("alphabet.html", {
      innerWidth: 844,
      innerHeight: 390
    });

    vmCtx.handleOrientationCheck();
    vmCtx.toggleLandscapeManual();
    vmCtx.selectGirl("jayda");
    expect(evalExpr("document.body.classList.contains('is-landscape')")).toBe(false);
    expect(evalExpr("currentNameString")).toBe("");
  });

  it("contains zero family-specific references in alphabet.html markup", () => {
    const html = fs.readFileSync(path.join(ROOT, "alphabet.html"), "utf8");
    for (const token of ["jayda", "dada", "เจด้า", "ดาด้า", "index.html", "manifest.json"]) {
      expect(html.toLowerCase()).not.toContain(token.toLowerCase());
    }
  });
});

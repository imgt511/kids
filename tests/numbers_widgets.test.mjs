import { describe, it, expect } from "vitest";
import { loadWidgetVm } from "./helpers/widgetHarness.mjs";

function assertValidDigitPaths(pathMap, expectedKeys) {
  expect(Object.keys(pathMap)).toEqual(expectedKeys);
  for (const key of expectedKeys) {
    const strokes = pathMap[key];
    expect(Array.isArray(strokes)).toBe(true);
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
}

describe("widget_numbers.html (Thai-only)", () => {
  it("validates TRACE_PATHS.thai and buildVectorSvgPaths helper", () => {
    const { vmCtx, evalExpr } = loadWidgetVm("widget_numbers.html");
    const tracePaths = evalExpr("TRACE_PATHS");
    assertValidDigitPaths(tracePaths.thai, ["๑", "๒", "๓", "๔", "๕", "๖", "๗", "๘", "๙", "๑๐"]);

    expect(vmCtx.buildVectorSvgPaths([], "#D63031", 36)).toBe("");
    const svg = vmCtx.buildVectorSvgPaths([[[10, 20], [30, 40]]], "#D63031", 36);
    expect(svg).toContain('<path d="M 10 20 L 30 40"');
    expect(svg).toContain('stroke="#D63031"');
  });

  it("wraps navigation cleanly and updates fruit count", () => {
    const { vmCtx, evalExpr, getEl } = loadWidgetVm("widget_numbers.html");
    expect(getEl("fruitGrid").children.length).toBe(1);

    vmCtx.prevNumber();
    expect(evalExpr("currentIndex")).toBe(9);
    expect(getEl("fruitGrid").children.length).toBe(10);

    vmCtx.nextNumber();
    expect(evalExpr("currentIndex")).toBe(0);
    expect(getEl("fruitGrid").children.length).toBe(1);
  });

  it("opens trace modal with Thai coaching and completes tracing for ๑", () => {
    const { vmCtx, evalExpr, playedAudioSrcs } = loadWidgetVm("widget_numbers.html");
    const embedded = evalExpr("EMBEDDED_AUDIO");

    vmCtx.openTraceModal("thai");
    expect(playedAudioSrcs.at(-1)).toBe(embedded.coach_th_1);

    const strokes = evalExpr("activeStrokes");
    expect(strokes.length).toBeGreaterThan(0);
    for (const segs of strokes) {
      vmCtx.startDraw({ clientX: segs[0].mx, clientY: segs[0].my, cancelable: false });
      for (const s of segs) {
        vmCtx.drawMove({ clientX: s.mx, clientY: s.my, cancelable: false });
      }
      vmCtx.endDraw();
    }
    expect(evalExpr("traceCompleted")).toBe(true);
  });
});

describe("widget_numbers_bilingual.html", () => {
  it("validates Thai and English TRACE_PATHS and getCoachKey mapping", () => {
    const { vmCtx, evalExpr } = loadWidgetVm("widget_numbers_bilingual.html");
    const tracePaths = evalExpr("TRACE_PATHS");

    assertValidDigitPaths(tracePaths.thai, ["๑", "๒", "๓", "๔", "๕", "๖", "๗", "๘", "๙", "๑๐"]);
    assertValidDigitPaths(tracePaths.english, ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]);

    expect(vmCtx.getCoachKey("thai", 0)).toBe("coach_th_1");
    expect(vmCtx.getCoachKey("english", 9)).toBe("coach_en_10");
  });

  it("uses coached state gating across openTraceModal and finishTrace", () => {
    const { vmCtx, evalExpr, storageMap, playedAudioSrcs } = loadWidgetVm(
      "widget_numbers_bilingual.html",
      { localStorageInit: { boo_boo_stars: "4" } }
    );
    const embedded = evalExpr("EMBEDDED_AUDIO");

    vmCtx.openTraceModal("english");
    expect(playedAudioSrcs.at(-1)).toBe(embedded.coach_en_1);

    vmCtx.finishTrace();
    expect(storageMap.get("boo_boo_stars")).toBe("5");
    expect(JSON.parse(storageMap.get("glw_coached_num_bilingual_v2")).english_1).toBe(true);

    vmCtx.openTraceModal("english");
    expect(playedAudioSrcs.at(-1)).toBe(embedded.en_1);
  });

  it("warns once on far initial touch and completes English 1 trace", () => {
    const { vmCtx, evalExpr, playedAudioSrcs } = loadWidgetVm("widget_numbers_bilingual.html");
    const embedded = evalExpr("EMBEDDED_AUDIO");

    vmCtx.openTraceModal("english");
    const strokes = evalExpr("activeStrokes");
    const p0 = strokes[0][0];

    vmCtx.lockInitialTouch(p0.x0 + 180, p0.y0 + 180);
    expect(evalExpr("wrongNumStartNotified")).toBe(true);
    expect(playedAudioSrcs.at(-1)).toBe(embedded.coach_en_1);

    vmCtx.initTraceModel();
    const freshStrokes = evalExpr("activeStrokes");
    for (const segs of freshStrokes) {
      vmCtx.startDraw({ clientX: segs[0].mx, clientY: segs[0].my, cancelable: false });
      for (const s of segs) {
        vmCtx.drawMove({ clientX: s.mx, clientY: s.my, cancelable: false });
      }
      vmCtx.endDraw();
    }
    expect(evalExpr("traceCompleted")).toBe(true);
  });
});

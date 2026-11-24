import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, it, expect } from "vitest";
import { ROOT, loadWidgetVm } from "./helpers/widgetHarness.mjs";

describe("index.html portal", () => {
  it("sums stars across all three widgets from localStorage", () => {
    const emptyVm = loadWidgetVm("index.html");
    emptyVm.vmCtx.updateTotalStars();
    expect(emptyVm.getEl("totalStarCount").innerText).toBe("0");

    const populatedVm = loadWidgetVm("index.html", {
      localStorageInit: {
        boo_boo_stars: "3",
        boo_boo_stars_alpha: "5",
        boo_boo_stars_add: "2"
      }
    });
    populatedVm.vmCtx.updateTotalStars();
    expect(populatedVm.getEl("totalStarCount").innerText).toBe("10");
  });

  it("displays coming-soon toast message with Thai feature title", () => {
    const { vmCtx, getEl } = loadWidgetVm("index.html");
    vmCtx.triggerComingSoon("เกมลบเลขแสนสนุก", "Subtraction Challenge");

    const toast = getEl("toastMsg");
    expect(toast.classList.contains("show")).toBe(true);
    expect(toast.innerText).toContain("เกมลบเลขแสนสนุก");
  });
});

describe("widget_addition.html", () => {
  it("formats Thai numerals up to 20 and falls back to string beyond 20", () => {
    const { vmCtx } = loadWidgetVm("widget_addition.html");
    expect(vmCtx.getThaiNumberStr(0)).toBe("๐");
    expect(vmCtx.getThaiNumberStr(7)).toBe("๗");
    expect(vmCtx.getThaiNumberStr(10)).toBe("๑๐");
    expect(vmCtx.getThaiNumberStr(20)).toBe("๒๐");
    expect(vmCtx.getThaiNumberStr(25)).toBe("25");
  });

  it("generates bounded questions with 3 unique options and matching fruit grid", () => {
    const { vmCtx, evalExpr, getEl } = loadWidgetVm("widget_addition.html");

    for (let i = 0; i < 20; i++) {
      vmCtx.generateMathQuestion();
      const answer = evalExpr("currentAnswer");
      expect(answer).toBeGreaterThanOrEqual(2);
      expect(answer).toBeLessThanOrEqual(10);

      const options = getEl("mathOptions").children;
      expect(options).toHaveLength(3);
      const optionValues = options.map((btn) => parseInt(btn.innerHTML, 10));
      expect(new Set(optionValues).size).toBe(3);
      expect(optionValues).toContain(answer);

      expect(getEl("mathVisualGrid").children).toHaveLength(answer + 1);
    }
  });

  it("handles wrong and correct option clicks cleanly", () => {
    const { evalExpr, getEl, storageMap, playedAudioSrcs } = loadWidgetVm("widget_addition.html", {
      localStorageInit: { boo_boo_stars_math: "1" }
    });

    const answer = evalExpr("currentAnswer");
    const embedded = evalExpr("EMBEDDED_AUDIO");
    const options = getEl("mathOptions").children;
    const wrongBtn = options.find((btn) => parseInt(btn.innerHTML, 10) !== answer);
    const correctBtn = options.find((btn) => parseInt(btn.innerHTML, 10) === answer);

    wrongBtn.onclick();
    expect(wrongBtn.classList.contains("wrong")).toBe(true);
    expect(storageMap.get("boo_boo_stars_math")).toBe("1");

    correctBtn.onclick();
    expect(correctBtn.classList.contains("correct")).toBe(true);
    expect(storageMap.get("boo_boo_stars_math")).toBe("2");
    expect(playedAudioSrcs.at(-1)).toBe(embedded.th_tooktong);
  });
});

describe("sw.js service worker", () => {
  it("registers install, activate, and fetch listeners cleanly", () => {
    const swCode = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");
    const registeredEvents = [];
    const ctx = vm.createContext({
      Promise,
      self: {
        skipWaiting() {},
        clients: { claim: () => Promise.resolve() },
        addEventListener(eventName, handler) {
          registeredEvents.push({ eventName, handler });
        }
      },
      caches: {
        open: () => Promise.resolve({ addAll: () => Promise.resolve(), put: () => Promise.resolve() }),
        keys: () => Promise.resolve([]),
        delete: () => Promise.resolve(true),
        match: () => Promise.resolve(undefined)
      },
      fetch: () => Promise.resolve({ status: 200, clone: () => ({}) })
    });

    new vm.Script(swCode, { filename: "sw.js" }).runInContext(ctx);
    const names = registeredEvents.map((e) => e.eventName);
    expect(names).toEqual(["install", "activate", "fetch"]);
    for (const entry of registeredEvents) {
      expect(typeof entry.handler).toBe("function");
    }
  });
});

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

describe("ui_lang.js language toggle", () => {
  function runUiLang(initialLang = null) {
    const storageMap = new Map();
    if (initialLang !== null) storageMap.set("glw_ui_lang", initialLang);

    const makeMock = (attrs, initialClass = "") => {
      const classes = new Set(initialClass ? initialClass.split(/\s+/) : []);
      return {
        attrs: { ...attrs },
        innerText: attrs["data-i18n-th"] || "",
        innerHTML: attrs["data-i18n-html-th"] || "",
        title: attrs["data-title-th"] || "",
        classList: {
          toggle(name, force) {
            if (force) classes.add(name);
            else classes.delete(name);
          },
          contains(name) {
            return classes.has(name);
          }
        },
        getAttribute(k) {
          return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null;
        },
        setAttribute(k, v) {
          this.attrs[k] = String(v);
        }
      };
    };

    const titleEl = makeMock({
      "data-i18n-th": "ภาษาไทย",
      "data-i18n-en": "English Title"
    });
    const htmlEl = makeMock({
      "data-i18n-html-th": "<b>ไทย</b>",
      "data-i18n-html-en": "<b>English</b>"
    });
    const hintEl = makeMock({
      "data-title-th": "คำใบ้",
      "data-title-en": "English Hint"
    });
    const thBtn = makeMock({ "data-set-lang": "th" }, "active");
    const enBtn = makeMock({ "data-set-lang": "en" });

    let changeCalls = 0;
    const windowObj = {
      onUiLangChange(lang) {
        changeCalls++;
        windowObj.lastLang = lang;
      }
    };

    const ctx = vm.createContext({
      localStorage: {
        getItem: (k) => (storageMap.has(k) ? storageMap.get(k) : null),
        setItem: (k, v) => storageMap.set(String(k), String(v))
      },
      window: windowObj,
      document: {
        querySelectorAll(sel) {
          if (sel === "[data-i18n-th]") return [titleEl];
          if (sel === "[data-i18n-html-th]") return [htmlEl];
          if (sel === "[data-title-th]") return [hintEl];
          if (sel === "[data-set-lang]") return [thBtn, enBtn];
          return [];
        }
      }
    });

    const code = fs.readFileSync(path.join(ROOT, "ui_lang.js"), "utf8");
    new vm.Script(code, { filename: "ui_lang.js" }).runInContext(ctx);
    return { windowObj, storageMap, titleEl, htmlEl, hintEl, thBtn, enBtn, getChangeCalls: () => changeCalls };
  }

  it("defaults to Thai and switches cleanly between Thai and British English", () => {
    const env = runUiLang();
    expect(env.windowObj.getUiLang()).toBe("th");
    expect(env.titleEl.innerText).toBe("ภาษาไทย");
    expect(env.thBtn.classList.contains("active")).toBe(true);
    expect(env.enBtn.classList.contains("active")).toBe(false);

    env.windowObj.setUiLang("en");
    expect(env.windowObj.getUiLang()).toBe("en");
    expect(env.storageMap.get("glw_ui_lang")).toBe("en");
    expect(env.titleEl.innerText).toBe("English Title");
    expect(env.htmlEl.innerHTML).toBe("<b>English</b>");
    expect(env.hintEl.title).toBe("English Hint");
    expect(env.thBtn.classList.contains("active")).toBe(false);
    expect(env.enBtn.classList.contains("active")).toBe(true);
    expect(env.windowObj.lastLang).toBe("en");
    expect(env.getChangeCalls()).toBe(2);

    env.windowObj.setUiLang("th");
    expect(env.storageMap.get("glw_ui_lang")).toBe("th");
    expect(env.titleEl.innerText).toBe("ภาษาไทย");
    expect(env.thBtn.classList.contains("active")).toBe(true);
  });
});

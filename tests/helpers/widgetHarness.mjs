import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, "../..");

/**
 * Read an HTML file relative to ROOT and concatenate its inline and local external <script> blocks.
 */
export function extractInlineScripts(relHtmlPath) {
  const htmlDir = path.dirname(path.join(ROOT, relHtmlPath));
  const html = fs.readFileSync(path.join(ROOT, relHtmlPath), "utf8");
  const scripts = [];
  const regex = /<script\b([^>]*)>([\s\S]*?)<\/script>/g;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const attrs = match[1] || "";
    const srcMatch = /\bsrc\s*=\s*["']([^"']+)["']/.exec(attrs);
    if (srcMatch) {
      const src = srcMatch[1];
      if (!/^https?:\/\//i.test(src)) {
        const scriptPath = path.resolve(htmlDir, src);
        scripts.push(fs.readFileSync(scriptPath, "utf8"));
      }
    } else if (match[2].trim()) {
      scripts.push(match[2]);
    }
  }
  return scripts.join("\n;\n");
}

function createCanvas2dStub() {
  return {
    clearRect() {},
    save() {},
    restore() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
    fillRect() {},
    arc() {},
    fill() {},
    translate() {},
    rotate() {},
    strokeStyle: "#000000",
    fillStyle: "#000000",
    lineWidth: 1,
    lineCap: "round",
    lineJoin: "round",
    globalAlpha: 1
  };
}

function createMockElement(id = "", onIdChange = null) {
  const initialClasses = id === "landscapeContainer" ? ["picker-mode"] : [];
  const classSet = new Set(initialClasses);
  const listeners = new Map();
  let innerHtmlValue = "";
  let innerTextValue = "";
  let idValue = id;

  const el = {
    get id() {
      return idValue;
    },
    set id(newId) {
      idValue = String(newId);
      if (onIdChange && idValue) {
        onIdChange(idValue, el);
      }
    },
    tagName: "DIV",
    type: "",
    value: "",
    text: "",
    disabled: false,
    selected: false,
    className: initialClasses.join(" "),
    classList: {
      add(c) {
        classSet.add(c);
      },
      remove(c) {
        classSet.delete(c);
      },
      contains(c) {
        return classSet.has(c);
      },
      toggle(c, force) {
        if (force === undefined) {
          if (classSet.has(c)) classSet.delete(c);
          else classSet.add(c);
          return classSet.has(c);
        }
        if (force) classSet.add(c);
        else classSet.delete(c);
        return Boolean(force);
      }
    },
    style: {},
    src: "",
    checked: false,
    width: 460,
    height: 460,
    clientWidth: 820,
    clientHeight: 330,
    children: [],
    onclick: null,
    get innerText() {
      return innerTextValue;
    },
    set innerText(val) {
      innerTextValue = String(val);
    },
    get innerHTML() {
      return innerHtmlValue;
    },
    set innerHTML(val) {
      innerHtmlValue = String(val);
      if (innerHtmlValue === "") {
        el.children = [];
      }
    },
    appendChild(child) {
      el.children.push(child);
      return child;
    },
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    dispatchEvent(type, eventObj = {}) {
      for (const fn of listeners.get(type) || []) {
        fn(eventObj);
      }
    },
    scrollIntoView() {},
    getBoundingClientRect() {
      return { left: 0, top: 0, width: el.width || 460, height: el.height || 460 };
    },
    getContext() {
      return createCanvas2dStub();
    }
  };
  return el;
}

/**
 * Execute a widget's inline scripts inside an isolated Node vm context with DOM/Audio mocks.
 */
export function loadWidgetVm(relHtmlPath, options = {}) {
  const {
    localStorageInit = {},
    innerWidth = 844,
    innerHeight = 390,
    protocol = "https:",
    navigator: customNavigator = {},
    caches: customCaches,
    fetch: customFetch
  } = options;

  const storageMap = new Map(
    Object.entries(localStorageInit).map(([k, v]) => [String(k), String(v)])
  );
  const elMap = new Map();
  const createdElements = [];
  const constructedAudios = [];
  const playedAudioSrcs = [];
  const spokenUtterances = [];
  let fullscreenRequests = 0;

  function registerElId(newId, el) {
    elMap.set(newId, el);
  }

  function getEl(id) {
    if (!elMap.has(id)) {
      elMap.set(id, createMockElement(id, registerElId));
    }
    return elMap.get(id);
  }

  function FakeAudioCtx() {
    this.state = "running";
    this.currentTime = 0;
    this.destination = {};
    this.resume = () => Promise.resolve();
    this.createOscillator = () => ({
      type: "",
      frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
      connect() {},
      start() {},
      stop() {}
    });
    this.createGain = () => ({
      gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
      connect() {}
    });
    this.createBiquadFilter = () => ({
      type: "",
      frequency: { setValueAtTime() {} },
      connect() {}
    });
  }

  function FakeUtterance(text) {
    this.text = text;
    this.lang = "";
    this.voice = null;
    this.rate = 1;
    this.pitch = 1;
    this.onend = null;
    this.onerror = null;
  }

  function FakeAudio(src = "") {
    this.src = src;
    this.preload = "";
    this.currentTime = 0;
    this.onended = null;
    this.onerror = null;
    this.onloadedmetadata = null;
    this.pause = () => {};
    this.play = () => {
      playedAudioSrcs.push(this.src);
      return Promise.resolve();
    };
    constructedAudios.push(this);
  }

  const windowListeners = new Map();
  const mockWindow = {
    innerWidth,
    innerHeight,
    AudioContext: FakeAudioCtx,
    webkitAudioContext: FakeAudioCtx,
    addEventListener(type, fn) {
      if (!windowListeners.has(type)) windowListeners.set(type, []);
      windowListeners.get(type).push(fn);
    },
    speechSynthesis: {
      onvoiceschanged: null,
      cancel() {},
      getVoices: () => [],
      speak(u) {
        spokenUtterances.push(u);
      }
    }
  };

  const mockDocument = {
    body: getEl("_body"),
    documentElement: {
      requestFullscreen() {
        fullscreenRequests++;
        return Promise.resolve();
      }
    },
    fullscreenElement: null,
    exitFullscreen() {
      return Promise.resolve();
    },
    getElementById: getEl,
    createElement(tag) {
      const el = createMockElement(`_dyn_${createdElements.length}`, registerElId);
      el.tagName = String(tag).toUpperCase();
      createdElements.push(el);
      return el;
    },
    createTextNode(text) {
      return { nodeType: 3, textContent: String(text) };
    },
    querySelectorAll(selector) {
      if (selector === "#pickBar input[type=checkbox]") {
        return createdElements.filter(
          (el) => el.tagName === "INPUT" && el.type === "checkbox"
        );
      }
      if (selector === "#pickBar input[type=checkbox]:checked") {
        return createdElements.filter(
          (el) => el.tagName === "INPUT" && el.type === "checkbox" && Boolean(el.checked)
        );
      }
      if (selector && selector.startsWith(".")) {
        const cls = selector.slice(1);
        return createdElements.filter((el) => el.className.split(/\s+/).includes(cls));
      }
      return [];
    }
  };

  if (customCaches !== undefined) {
    mockWindow.caches = customCaches;
  }

  const ctxObj = {
    console,
    Math,
    Set,
    Map,
    JSON,
    Promise,
    Infinity,
    isFinite,
    Number,
    Boolean,
    String,
    Array,
    Object,
    localStorage: {
      getItem: (k) => (storageMap.has(k) ? storageMap.get(k) : null),
      setItem: (k, v) => {
        storageMap.set(String(k), String(v));
      },
      removeItem: (k) => {
        storageMap.delete(String(k));
      },
      clear: () => {
        storageMap.clear();
      }
    },
    AudioContext: FakeAudioCtx,
    SpeechSynthesisUtterance: FakeUtterance,
    Audio: FakeAudio,
    window: mockWindow,
    document: mockDocument,
    navigator: customNavigator,
    location: { protocol },
    setTimeout: () => 0,
    clearTimeout() {},
    requestAnimationFrame: () => 0,
    alert() {}
  };

  if (customCaches !== undefined) {
    ctxObj.caches = customCaches;
  }
  if (customFetch !== undefined) {
    ctxObj.fetch = customFetch;
    mockWindow.fetch = customFetch;
  }

  const vmCtx = vm.createContext(ctxObj);
  const code = extractInlineScripts(relHtmlPath);
  const script = new vm.Script(code, { filename: relHtmlPath });
  script.runInContext(vmCtx);

  return {
    vmCtx,
    evalExpr: (expr) => vm.runInContext(expr, vmCtx),
    getEl,
    storageMap,
    constructedAudios,
    playedAudioSrcs,
    spokenUtterances,
    getFullscreenRequests: () => fullscreenRequests
  };
}

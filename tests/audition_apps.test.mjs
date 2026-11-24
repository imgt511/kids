import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, it, expect } from "vitest";
import { ROOT, loadWidgetVm } from "./helpers/widgetHarness.mjs";

describe("voice_audition/index.html", () => {
  it("renders all 33 voices, 10 Thai numbers, 10 English numbers, and 44 consonants", () => {
    const { evalExpr, getEl } = loadWidgetVm("voice_audition/index.html");

    expect(evalExpr("NUMBERS")).toHaveLength(10);
    expect(evalExpr("EN_NUMBERS")).toHaveLength(10);
    expect(evalExpr("CONSONANTS")).toHaveLength(44);
    expect(evalExpr("VOICES")).toHaveLength(33);

    expect(getEl("voiceSelect").children).toHaveLength(33);
    expect(getEl("numbersGrid").children).toHaveLength(10);
    expect(getEl("enNumbersGrid").children).toHaveLength(10);
    expect(getEl("alphabetGrid").children).toHaveLength(44);
  });

  it("switches active voice and creates availability probes under the selected folder", () => {
    const { vmCtx, evalExpr, getEl, constructedAudios } = loadWidgetVm("voice_audition/index.html");
    const initialCount = constructedAudios.length;

    vmCtx.setVoice("v30_leda");

    expect(evalExpr("activeVoice")).toBe("v30_leda");
    expect(getEl("statusText").innerText).toContain("V30_LEDA");

    const newProbes = constructedAudios.slice(initialCount);
    expect(newProbes).toHaveLength(64);
    expect(newProbes.every((a) => a.src.startsWith("./audio/v30_leda/"))).toBe(true);
  });

  it("toggles Pick voices checkboxes and guards empty pick comparison", async () => {
    const { vmCtx, getEl, playedAudioSrcs } = loadWidgetVm("voice_audition/index.html");
    const docCheckboxes = vmCtx.document.querySelectorAll("#pickBar input[type=checkbox]");
    expect(docCheckboxes).toHaveLength(33);

    vmCtx.setAllPicked(false);
    expect(docCheckboxes.every((cb) => cb.checked === false)).toBe(true);

    const playedBefore = playedAudioSrcs.length;
    await vmCtx.comparePickedVoices("num_01", null);
    expect(getEl("statusText").innerText).toBe("Check at least one voice in Pick voices.");
    expect(playedAudioSrcs).toHaveLength(playedBefore);

    vmCtx.setAllPicked(true);
    expect(docCheckboxes.every((cb) => cb.checked === true)).toBe(true);
  });

  it("plays clips with card highlight and clears playing state on end or stop", async () => {
    const { vmCtx, getEl, constructedAudios, playedAudioSrcs } = loadWidgetVm(
      "voice_audition/index.html"
    );
    const card = getEl("card_num_01");

    const playPromise = vmCtx.playClip("v30_leda", "num_01", card);
    expect(card.classList.contains("playing")).toBe(true);
    expect(playedAudioSrcs.at(-1)).toBe("./audio/v30_leda/num_01.m4a");

    constructedAudios.at(-1).onended();
    await playPromise;
    expect(card.classList.contains("playing")).toBe(false);

    vmCtx.playClip("v30_leda", "num_02", card);
    expect(card.classList.contains("playing")).toBe(true);
    vmCtx.stopPlayback();
    expect(card.classList.contains("playing")).toBe(false);
    expect(getEl("statusText").innerText).toBe("Stopped.");
  });

  it("reports local disk mode when offline installer runs over file://", async () => {
    const { vmCtx, getEl } = loadWidgetVm("voice_audition/index.html", {
      protocol: "file:"
    });

    await vmCtx.installAllOffline();
    expect(getEl("cacheInfo").innerText).toBe("Local disk");
  });
});

describe("alphabet_audition/index.html", () => {
  it("renders 30 voices, 44 consonant cards, and registers service worker once", () => {
    let swRegisterCalls = 0;
    const { evalExpr, getEl } = loadWidgetVm("alphabet_audition/index.html", {
      navigator: {
        serviceWorker: {
          register() {
            swRegisterCalls++;
            return Promise.resolve();
          }
        }
      }
    });

    expect(evalExpr("CONSONANTS")).toHaveLength(44);
    expect(evalExpr("VOICES")).toHaveLength(30);
    expect(getEl("voiceSelect").children).toHaveLength(30);
    expect(getEl("grid").children).toHaveLength(44);
    expect(swRegisterCalls).toBe(1);
  });

  it("switches voice cleanly without re-registering service worker", () => {
    let swRegisterCalls = 0;
    const { vmCtx, evalExpr, getEl, constructedAudios } = loadWidgetVm(
      "alphabet_audition/index.html",
      {
        navigator: {
          serviceWorker: {
            register() {
              swRegisterCalls++;
              return Promise.resolve();
            }
          }
        }
      }
    );

    const beforeProbes = constructedAudios.length;
    vmCtx.setVoice("leda");

    expect(evalExpr("activeVoice")).toBe("leda");
    expect(getEl("statusText").innerText).toBe("Active voice: LEDA");
    expect(swRegisterCalls).toBe(1);

    const newProbes = constructedAudios.slice(beforeProbes);
    expect(newProbes).toHaveLength(44);
    expect(newProbes.every((a) => a.src.startsWith("./audio/leda/alpha_"))).toBe(true);
  });

  it("plays master and single clips with card highlight and updates missing state on probes", async () => {
    const { vmCtx, getEl, constructedAudios, playedAudioSrcs } = loadWidgetVm(
      "alphabet_audition/index.html"
    );

    vmCtx.playMaster("p1");
    expect(playedAudioSrcs.at(-1)).toBe("./audio/zephyr/master_p1.m4a");

    const card = getEl("c_1");
    const p = vmCtx.playFile("alpha_01.m4a", card);
    expect(card.classList.contains("playing")).toBe(true);
    expect(playedAudioSrcs.at(-1)).toBe("./audio/zephyr/alpha_01.m4a");

    constructedAudios.at(-1).onended();
    await p;
    expect(card.classList.contains("playing")).toBe(false);

    vmCtx.playFile("alpha_02.m4a", card);
    expect(card.classList.contains("playing")).toBe(true);
    vmCtx.stopAudio();
    expect(card.classList.contains("playing")).toBe(false);

    const probeStart = constructedAudios.length;
    vmCtx.refreshCards();
    const probes = constructedAudios.slice(probeStart);
    expect(probes).toHaveLength(44);

    probes[0].onerror();
    expect(getEl("c_1").classList.contains("missing")).toBe(true);
    probes[0].onloadedmetadata();
    expect(getEl("c_1").classList.contains("missing")).toBe(false);
    probes[1].onerror();
    expect(getEl("c_2").classList.contains("missing")).toBe(true);
  });

  it("handles file:// and unavailable Cache API cleanly in installAllOffline", async () => {
    const fileVm = loadWidgetVm("alphabet_audition/index.html", { protocol: "file:" });
    await fileVm.vmCtx.installAllOffline();
    expect(fileVm.getEl("statusText").innerText).toBe("Local disk mode active.");

    const noCacheVm = loadWidgetVm("alphabet_audition/index.html", { protocol: "https:" });
    await noCacheVm.vmCtx.installAllOffline();
    expect(noCacheVm.getEl("statusText").innerText).toBe("Browser Cache API unavailable.");
  });
});

describe("audition service workers", () => {
  it.each(["voice_audition/sw.js", "alphabet_audition/sw.js"])(
    "%s registers install, activate, and fetch listeners cleanly",
    (relSwPath) => {
      const swCode = fs.readFileSync(path.join(ROOT, relSwPath), "utf8");
      const events = [];
      const ctx = vm.createContext({
        Promise,
        self: {
          skipWaiting() {},
          clients: { claim: () => Promise.resolve() },
          addEventListener(name, handler) {
            events.push({ name, handler });
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

      new vm.Script(swCode, { filename: relSwPath }).runInContext(ctx);
      expect(events.map((e) => e.name)).toEqual(["install", "activate", "fetch"]);
      for (const entry of events) {
        expect(typeof entry.handler).toBe("function");
      }
    }
  );
});

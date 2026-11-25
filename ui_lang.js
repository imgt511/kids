(function () {
  const UI_LANG_KEY = "glw_ui_lang";

  function normalizeLang(lang) {
    return lang === "en" ? "en" : "th";
  }

  function getUiLang() {
    try {
      return localStorage.getItem(UI_LANG_KEY) === "en" ? "en" : "th";
    } catch (e) {
      return "th";
    }
  }

  function applyUiLang(lang) {
    const next = normalizeLang(lang);
    const textAttr = "data-i18n-" + next;
    const htmlAttr = "data-i18n-html-" + next;
    const titleAttr = "data-title-" + next;

    if (typeof document !== "undefined" && typeof document.querySelectorAll === "function") {
      document.querySelectorAll("[data-i18n-th]").forEach((el) => {
        if (typeof el.getAttribute !== "function") return;
        const val = el.getAttribute(textAttr);
        if (val !== null) el.innerText = val;
      });

      document.querySelectorAll("[data-i18n-html-th]").forEach((el) => {
        if (typeof el.getAttribute !== "function") return;
        const val = el.getAttribute(htmlAttr);
        if (val !== null) el.innerHTML = val;
      });

      document.querySelectorAll("[data-title-th]").forEach((el) => {
        if (typeof el.getAttribute !== "function") return;
        const val = el.getAttribute(titleAttr);
        if (val !== null) el.title = val;
      });

      document.querySelectorAll("[data-set-lang]").forEach((btn) => {
        if (typeof btn.getAttribute !== "function") return;
        const isCurrent = btn.getAttribute("data-set-lang") === next;
        if (btn.classList && typeof btn.classList.toggle === "function") {
          btn.classList.toggle("active", isCurrent);
        }
        if (typeof btn.setAttribute === "function") {
          btn.setAttribute("aria-pressed", isCurrent ? "true" : "false");
        }
      });
    }

    if (typeof window !== "undefined" && typeof window.onUiLangChange === "function") {
      window.onUiLangChange(next);
    }
    return next;
  }

  function setUiLang(lang) {
    const next = normalizeLang(lang);
    try {
      localStorage.setItem(UI_LANG_KEY, next);
    } catch (e) {}
    return applyUiLang(next);
  }

  if (typeof window !== "undefined") {
    window.getUiLang = getUiLang;
    window.setUiLang = setUiLang;
    window.applyUiLang = applyUiLang;
  }

  applyUiLang(getUiLang());
})();

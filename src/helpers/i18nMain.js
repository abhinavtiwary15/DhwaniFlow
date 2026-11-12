const i18next = require("i18next");

const enTranslation = require("../locales/en/translation.json");
const arTranslation = require("../locales/ar/translation.json");
const esTranslation = require("../locales/es/translation.json");
const frTranslation = require("../locales/fr/translation.json");
const deTranslation = require("../locales/de/translation.json");
const ptTranslation = require("../locales/pt/translation.json");
const itTranslation = require("../locales/it/translation.json");
const ruTranslation = require("../locales/ru/translation.json");
const jaTranslation = require("../locales/ja/translation.json");
const zhCNTranslation = require("../locales/zh-CN/translation.json");
const zhTWTranslation = require("../locales/zh-TW/translation.json");

const SUPPORTED_UI_LANGUAGES = [
  "en",
  "ar",
  "es",
  "fr",
  "de",
  "pt",
  "it",
  "ru",
  "ja",
  "zh-CN",
  "zh-TW",
];

function normalizeUiLanguage(language) {
  const candidate = (language || "").trim();

  // Check full language-region code first (e.g. "zh-CN", "zh-TW")
  const normalized = candidate.replace(/_/g, "-");
  const fullMatch = SUPPORTED_UI_LANGUAGES.find(
    (lang) => lang.toLowerCase() === normalized.toLowerCase()
  );
  if (fullMatch) return fullMatch;

  // Chinese is the only UI language that is not the primary subtag. OS/browser
  // tags are zh-Hans-CN, zh-Hant-TW, zh-HK, zh_Hant_TW, or bare zh — none of
  // those equal zh-CN/zh-TW, and falling through to "zh" is not in the list.
  const lower = normalized.toLowerCase();
  if (lower === "zh" || lower.startsWith("zh-")) {
    const parts = lower.split("-");
    if (parts.some((part) => part === "hant" || part === "tw" || part === "hk" || part === "mo")) {
      return "zh-TW";
    }
    return "zh-CN";
  }

  // Fall back to base language code (e.g. "en" from "en-US")
  const base = lower.split("-")[0];
  return SUPPORTED_UI_LANGUAGES.includes(base) ? base : "en";
}

const i18nMain = i18next.createInstance();

void i18nMain.init({
  initAsync: false,
  resources: {
    en: {
      translation: enTranslation,
    },
    ar: {
      translation: arTranslation,
    },
    es: {
      translation: esTranslation,
    },
    fr: {
      translation: frTranslation,
    },
    de: {
      translation: deTranslation,
    },
    pt: {
      translation: ptTranslation,
    },
    it: {
      translation: itTranslation,
    },
    ru: {
      translation: ruTranslation,
    },
    ja: {
      translation: jaTranslation,
    },
    "zh-CN": {
      translation: zhCNTranslation,
    },
    "zh-TW": {
      translation: zhTWTranslation,
    },
  },
  lng: normalizeUiLanguage(process.env.UI_LANGUAGE),
  fallbackLng: "en",
  ns: ["translation"],
  defaultNS: "translation",
  interpolation: {
    escapeValue: false,
  },
  returnEmptyString: false,
  returnNull: false,
});

function changeLanguage(language) {
  const normalized = normalizeUiLanguage(language);

  if (i18nMain.language !== normalized) {
    void i18nMain.changeLanguage(normalized);
  }

  return normalized;
}

module.exports = {
  i18nMain,
  changeLanguage,
  normalizeUiLanguage,
  SUPPORTED_UI_LANGUAGES,
};

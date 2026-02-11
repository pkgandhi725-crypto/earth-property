// 🛡️ Edge Case Protection: Static Check
if (typeof TRANSLATIONS === 'undefined') {
    console.error('Earth Property: TRANSLATIONS dictionary missing!');
    window.TRANSLATIONS = { en: {} }; 
}

const RTL_LANGS = Object.freeze(["ar", "ur", "fa", "he"]);
let CURRENT_LANG = "en"; 
let CURRENT_DICT = TRANSLATIONS["en"];

// 💎 Helper: safe translation lookup with key fallback
function t(key) {
    return CURRENT_DICT?.[key] || TRANSLATIONS["en"]?.[key] || `[${key}]`;
}

// Single Source of Truth for Translation
function translateElement(el) {
    if (el.dataset.i18n) {
        el.textContent = t(el.dataset.i18n);
    }
    if (el.dataset.i18nPlaceholder) {
        el.placeholder = t(el.dataset.i18nPlaceholder);
    }
}

function setLanguage(lang) {
    // 1. Validation & Fallback logic
    if (!TRANSLATIONS[lang]) {
        console.warn(`Translation missing for ${lang}, falling back to 'en'`);
        lang = "en";
    }
    if (lang === CURRENT_LANG && localStorage.getItem("earthLang")) return; 

    // 2. State Sync
    CURRENT_LANG = lang;
    CURRENT_DICT = TRANSLATIONS[lang];
    localStorage.setItem("earthLang", lang);

    // 3. Batch DOM Update
    document.querySelectorAll("[data-i18n], [data-i18n-placeholder]").forEach(translateElement);

    // 4. Global Context
    document.body.dir = RTL_LANGS.includes(lang) ? "rtl" : "ltr";
    document.documentElement.lang = lang;
    
    updateActiveLangBtn(lang);
}

function updateActiveLangBtn(lang) {
    document.querySelectorAll(".lang-btn").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.lang === lang);
    });
}

// 🚀 Performance Optimization: MutationObserver for Dynamic Content
const observer = new MutationObserver(mutations => {
    mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
            if (node.nodeType === 1) { // Process only Element nodes
                if (node.hasAttribute('data-i18n') || node.hasAttribute('data-i18n-placeholder')) translateElement(node);
                node.querySelectorAll("[data-i18n], [data-i18n-placeholder]").forEach(translateElement);
            }
        });
    });
});

document.addEventListener("DOMContentLoaded", () => {
    // Single init point to avoid race conditions
    const savedLang = localStorage.getItem("earthLang");
    const browserLang = navigator.language.slice(0, 2);
    const targetLang = savedLang || browserLang;

    setLanguage(TRANSLATIONS[targetLang] ? targetLang : "en");

    // Start observing after initial load
    observer.observe(document.body, { childList: true, subtree: true });
});

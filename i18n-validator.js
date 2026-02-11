// Development-only check
const REQUIRED_KEYS = ["active", "expired", "expiringSoon", "daysLeft", "renew", "delete", "renewSuccess"];

Object.keys(TRANSLATIONS).forEach(lang => {
    REQUIRED_KEYS.forEach(key => {
        if (!TRANSLATIONS[lang][key]) {
            console.error(`⚠️ Earth Property Dev: Missing key [${key}] in [${lang}]`);
        }
    });
});

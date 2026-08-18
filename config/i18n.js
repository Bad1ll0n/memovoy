const i18next       = require('i18next');
const middleware    = require('i18next-http-middleware');

i18next
    .use(middleware.LanguageDetector)
    .init({
        resources: {
            pt: { translation: require('../locales/pt.json') },
            en: { translation: require('../locales/en.json') },
        },
        detection: {
            // Ordem de detecção: primeiro cookie, depois Accept-Language header
            order: ['cookie', 'header'],
            lookupCookie: 'insight-lang',
            caches: ['cookie'],
            cookieOptions: { maxAge: 365 * 24 * 60 * 60 * 1000, httpOnly: false },
        },
        supportedLngs: ['pt', 'en'],
        fallbackLng: 'pt',
        defaultNS: 'translation',
        interpolation: { escapeValue: false },
    });

module.exports = { i18next, middleware };

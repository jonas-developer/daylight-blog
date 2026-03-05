// Simple i18n implementation
const path = require('path');
const fs = require('fs');

// Load translations
const translations = {};
const localesDir = path.join(__dirname, '../locales');

function loadTranslations() {
  const files = fs.readdirSync(localesDir);
  files.forEach(file => {
    if (file.endsWith('.json')) {
      const locale = file.replace('.json', '');
      translations[locale] = JSON.parse(fs.readFileSync(path.join(localesDir, file), 'utf8'));
    }
  });
  console.log('Loaded translations for:', Object.keys(translations));
}

loadTranslations();

// i18n middleware
function i18n(req, res, next) {
  // Detect language
  let locale = 'en';
  
  // Check URL parameter first
  if (req.query.lang && translations[req.query.lang]) {
    locale = req.query.lang;
  }
  // Check cookie
  else if (req.cookies && req.cookies.lang && translations[req.cookies.lang]) {
    locale = req.cookies.lang;
  }
  // Check Accept-Language header
  else {
    const acceptLanguage = req.get('Accept-Language') || '';
    if (acceptLanguage.toLowerCase().includes('sv') || acceptLanguage.toLowerCase().includes('se')) {
      locale = 'sv';
    }
  }
  
  // Set cookie
  res.cookie('lang', locale, { maxAge: 365 * 24 * 60 * 60 * 1000 });
  
  // Translation function
  res.__ = res.locals.__ = function(key) {
    const keys = key.split('.');
    let value = translations[locale];
    for (const k of keys) {
      value = value ? value[k] : null;
    }
    return value || key;
  };
  
  res.locals.locale = locale;
  next();
}

module.exports = { i18n, translations };
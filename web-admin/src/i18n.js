import { computed, ref } from 'vue';
import shell from './locales/shell.js';
import programme from './locales/programme.js';
import operations from './locales/operations.js';
import { errorText } from './locales/errors.js';
import { states } from './locales/states.js';

const languages = {
  en: { column: 0, html: 'en', locale: 'en-HK' },
  'zh-cn': { column: 1, html: 'zh-Hans-CN', locale: 'zh-CN' },
  'zh-hk': { column: 2, html: 'zh-Hant-HK', locale: 'zh-HK' },
};
const preference = 'cityuhk-events-hub.admin.language';
const messages = { ...shell, ...programme, ...operations };
let router;

function supported(value) {
  const key = typeof value === 'string' && value.toLowerCase();
  if (key === 'zh') return 'zh-hk';
  return Object.hasOwn(languages, key) ? key : undefined;
}

function initialLanguage() {
  const explicit = supported(new URL(location.href).searchParams.get('lang'));
  if (explicit) return explicit;
  try { return supported(localStorage.getItem(preference)) || 'en'; }
  catch { return 'en'; }
}

export const language = ref(initialLanguage());
export const locale = computed(() => languages[language.value].locale);

function applyLanguage(code) {
  language.value = code;
  document.documentElement.lang = languages[code].html;
  const column = languages[code].column;
  document.title = ['Ticketing administration', '票务管理', '票務管理'][column] + ' · CityUHK Events Hub';
  document.querySelector('meta[name="description"]').content = [
    'Manage performances, seat availability, ticket sales and check-in.',
    '管理演出场次、座位、票务和入场验票。',
    '管理演出場次、座位、票務及入場驗票。',
  ][column];
  try { localStorage.setItem(preference, code); }
  catch { /* The URL also carries the language when browser storage is unavailable. */ }
}

export function installAdminI18n(appRouter) {
  router = appRouter;
  applyLanguage(language.value);
  router.beforeEach(to => {
    if (!supported(to.query.lang) && language.value !== 'en') {
      return { path: to.path, query: { ...to.query, lang: language.value }, hash: to.hash };
    }
  });
  router.afterEach((to, _from, failure) => {
    if (!failure) applyLanguage(supported(to.query.lang) || language.value);
  });
}

function setLanguage(code) {
  if (!supported(code) || code === language.value) return;
  const route = router.currentRoute.value;
  return router.replace({ path: route.path, query: { ...route.query, lang: code }, hash: route.hash });
}

function t(key, params = {}) {
  const phrase = messages[key]?.[languages[language.value].column];
  if (phrase === undefined) return key;
  return phrase.replace(/\{(\w+)\}/g, (token, name) => params[name] ?? token);
}

function status(code) {
  if (code == null || code === '') return '—';
  return states[code]?.[languages[language.value].column] ?? String(code);
}

function errorMessage(error) {
  return errorText(error, languages[language.value].column);
}

const integer = computed(() => new Intl.NumberFormat(locale.value));
function n(value) {
  return value == null ? '—' : integer.value.format(value);
}

function percent(value, digits = 0) {
  if (value == null) return '—';
  return (Number(value) / 100).toLocaleString(locale.value, {
    style: 'percent', minimumFractionDigits: digits, maximumFractionDigits: digits,
  });
}

export function useAdminI18n() {
  return { t, status, errorMessage, n, percent, language, locale, setLanguage };
}

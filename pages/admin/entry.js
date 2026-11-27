const localLogin = 'http://127.0.0.1:8081/login';
const copy = {
  en: {
    html: 'en', heading: 'Ticketing administration', skip: 'Skip to content', back: 'Back to events',
    guide: 'Setup guide', nav: 'Navigation', languages: 'Page language',
    local: 'Start the ticketing app on this computer, then sign in to manage performances, seats and orders.',
    hosted: 'Sign in to the ticketing console to manage performances, seats and orders.',
    openLocal: 'Open local admin console', openHosted: 'Open admin console',
  },
  'zh-cn': {
    html: 'zh-Hans-CN', heading: '票务管理', skip: '跳至正文', back: '返回活动看板',
    guide: '启动指南', nav: '导航', languages: '页面语言',
    local: '先在这台电脑上启动票务应用，再登录管理后台，查看和管理场次、座位及订单。',
    hosted: '登录票务管理后台，查看和管理场次、座位及订单。',
    openLocal: '打开本机管理后台', openHosted: '打开管理后台',
  },
  'zh-hk': {
    html: 'zh-Hant-HK', heading: '票務管理', skip: '跳至主要內容', back: '返回活動看板',
    guide: '啟動指南', nav: '導覽', languages: '頁面語言',
    local: '先在這部電腦啟動票務應用程式，再登入管理後台，查看及管理場次、座位和訂單。',
    hosted: '登入票務管理後台，查看及管理場次、座位和訂單。',
    openLocal: '開啟本機管理後台', openHosted: '開啟管理後台',
  },
};

function hostedLoginUrl() {
  const value = document.querySelector('meta[name="admin-login-url"]').content.trim();
  if (!/^https:\/\//i.test(value)) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

const hostedLogin = hostedLoginUrl();
function currentLanguage() {
  const lang = new URL(location.href).searchParams.get('lang')?.toLowerCase();
  if (lang === 'zh' || lang === 'zh-hk') return 'zh-hk';
  return lang === 'zh-cn' ? 'zh-cn' : 'en';
}

function render() {
  const lang = currentLanguage();
  const text = copy[lang];
  const login = new URL(hostedLogin || localLogin);
  login.searchParams.set('lang', lang);
  document.getElementById('admin-login').href = login.href;
  const description = hostedLogin ? text.hosted : text.local;
  document.documentElement.lang = text.html;
  document.title = text.heading + ' · CityUHK Events Hub';
  document.querySelector('meta[name="description"]').content = description;
  document.querySelector('nav').setAttribute('aria-label', text.nav);
  document.querySelector('.languages').setAttribute('aria-label', text.languages);
  document.getElementById('entry-description').textContent = description;
  document.getElementById('login-label').textContent = hostedLogin ? text.openHosted : text.openLocal;
  for (const item of document.querySelectorAll('[data-copy]')) item.textContent = text[item.dataset.copy];
  for (const button of document.querySelectorAll('[data-lang]')) button.setAttribute('aria-pressed', String(button.dataset.lang === lang));
  for (const link of document.querySelectorAll('[data-board]')) {
    const url = new URL('../', location.href);
    if (lang !== 'en') url.searchParams.set('lang', lang);
    if (link.dataset.board === 'events') url.hash = 'campus';
    link.href = url.href;
  }
}

for (const button of document.querySelectorAll('[data-lang]')) {
  button.addEventListener('click', () => {
    const lang = button.dataset.lang;
    if (lang === currentLanguage()) return;
    const url = new URL(location.href);
    if (lang === 'en') url.searchParams.delete('lang');
    else url.searchParams.set('lang', lang);
    history.pushState(null, '', url);
    render();
  });
}
window.addEventListener('popstate', render);
render();

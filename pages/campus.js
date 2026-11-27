import { campusCopy } from './campus-copy.js';
import { eventFormats, formatCopy, matchesFormat, renderFormatFilter } from './event-formats.js';
import { demoEntries } from './site.js';

const get = id => document.getElementById(id);
const localeTags = { en: 'en-GB', 'zh-cn': 'zh-Hans-CN', 'zh-hk': 'zh-Hant-HK' };
const sourceRoot = 'https://cap.cityu.edu.hk/';
const refreshIntervalMs = 12 * 60 * 60 * 1000;
let feed, translations = {}, failed = false, loading = false, lastAttempt = 0, timer;
let mode = 'upcoming';
let selectedFormat = 'all';

function language() {
  switch (document.documentElement.lang) {
    case 'zh-Hans-CN': return 'zh-cn';
    case 'zh-Hant-HK': return 'zh-hk';
    default: return 'en';
  }
}

function node(tag, className, text) {
  const result = document.createElement(tag);
  result.className = className;
  if (text) result.textContent = text;
  return result;
}

function urlFor(raw, source = false) {
  try {
    const url = new URL(raw);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
    if (source && (url.origin !== new URL(sourceRoot).origin || !/^\/postPublic\.aspx$/i.test(url.pathname))) return null;
    return url.href;
  } catch {
    return null;
  }
}

function link(href, text, className, eventTitle) {
  const result = node('a', className, text);
  result.href = href;
  result.target = '_blank';
  result.rel = 'noopener noreferrer';
  result.setAttribute('aria-label', text + ' · ' + eventTitle);
  return result;
}

function addOfficialPoster(poster, article, title, actions, label) {
  if (!poster?.sourceUrl) return;
  let original;
  try {
    original = new URL(poster.sourceUrl);
    if (original.protocol !== 'https:' || !/(^|\.)cityu\.edu\.hk$/i.test(original.hostname) || original.username || original.password) return;
  } catch {
    return;
  }
  const fullPoster = link(original.href, label, 'campus-source', title.textContent);
  if (/\.pdf$/i.test(original.pathname)) {
    actions.append(fullPoster);
    return;
  }
  const cover = node('div', 'event-cover official-cover');
  const image = node('img', 'event-poster');
  image.alt = '';
  image.loading = 'lazy';
  image.decoding = 'async';
  image.referrerPolicy = 'no-referrer';
  const head = title.previousElementSibling;
  image.addEventListener('error', () => {
    if (document.activeElement === fullPoster) actions.querySelector('.campus-source')?.focus({ preventScroll: true });
    head.after(title);
    article.classList.remove('pictured-card');
    cover.remove();
  });
  fullPoster.className = 'poster-link';
  cover.append(image, title, fullPoster);
  article.classList.add('pictured-card');
  article.prepend(cover);
  image.src = original.href;
}

// CAP provides Hong Kong times. A date-only deadline remains visible throughout that local day.
function moment(value) {
  if (!value) return NaN;
  return Date.parse(value.length === 10 ? value + 'T00:00:00+08:00' : value);
}
function cutoff(value, precision) {
  return moment(value) + (precision === 'day' ? 86400000 : 0);
}
function sessionEnd(s) {
  if (s.end) return cutoff(s.end, s.precision);
  if (!s.start) return NaN;
  // Without a stated end time, keep the event through its local calendar day.
  return cutoff(s.start.slice(0, 10), 'day');
}

function formatters(lang) {
  const options = { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'Asia/Hong_Kong' };
  return {
    day: new Intl.DateTimeFormat(localeTags[lang], options),
    minute: new Intl.DateTimeFormat(localeTags[lang], { ...options, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }),
  };
}
function displayDate(start, end, precision, formats) {
  const from = moment(start), to = moment(end);
  if (!Number.isFinite(from)) return '';
  const fmt = precision === 'day' || start.length === 10 ? formats.day : formats.minute;
  return to > from ? fmt.formatRange(from, to) : fmt.format(from);
}

function currentEntries(now) {
  const entries = [];
  for (const event of feed?.events || []) {
    const source = urlFor(event.sourceUrl, true);
    if (!source || !event.title) continue;
    const sessions = (event.sessions || []).filter(s => !Number.isFinite(sessionEnd(s)) || sessionEnd(s) > now);
    const deadlines = (event.deadlines || []).filter(d => Object.hasOwn(campusCopy.en.due, d.kind) && cutoff(d.at, d.precision) > now);
    let order;
    if (mode === 'deadlines') {
      if (!deadlines.length || event.status === 'cancelled') continue;
      order = Math.min(...deadlines.map(d => moment(d.at)));
    } else {
      if (event.sessions?.length && !sessions.length && !deadlines.length) continue;
      const dates = [...sessions.map(s => moment(s.start)), ...deadlines.map(d => moment(d.at))].filter(Number.isFinite);
      order = dates.length ? Math.min(...dates) : Infinity;
    }
    // A submission deadline may fall after the event. Keep the published session dates as context.
    entries.push({ event, source, sessions: sessions.length ? sessions : event.sessions || [], deadlines, order });
  }
  return entries;
}

function card(entry, lang, formats) {
  const { event, source, sessions, deadlines } = entry;
  const t = campusCopy[lang];
  const item = translations[event.id];
  const normalize = s => s?.replace(/\s+/g, ' ').trim();
  const reviewed = !item?.sourceTitle || normalize(item.sourceTitle) === normalize(event.title);
  const text = reviewed ? item?.[lang] : null;
  const term = value => text?.terms?.[value] || value;
  const article = node('article', 'campus-card');
  article.dataset.id = event.id;
  const head = node('div', 'campus-card-head');
  if (event.department) head.append(node('span', 'campus-dept', event.department));
  for (const id of entry.formats) head.append(node('span', 'campus-kind', formatCopy[lang].card[id]));
  if (event.status === 'cancelled') head.append(node('span', 'campus-kind', t.cancelled));
  if (lang !== 'en' && !text?.title) head.append(node('span', 'campus-kind', t.original));
  const title = node('h3', 'campus-title', text?.title || event.title);
  if (lang !== 'en' && !text?.title) title.lang = 'en';
  article.append(head, title);
  if (text?.summary) article.append(node('p', 'campus-summary', text.summary));

  if (sessions.length) {
    const list = node('ul', 'campus-sessions');
    for (const session of sessions) {
      const timing = displayDate(session.start, session.end, session.precision, formats);
      const venue = session.venue || event.venue;
      const detail = node('li', '');
      if (session.label) {
        const label = text?.terms?.[session.label] || t.sessionLabels[session.label.toLowerCase()] || session.label;
        detail.append(node('span', 'session-label', label));
      }
      if (timing) {
        const when = node('time', '', timing);
        when.dateTime = session.start;
        detail.append(when);
      } else detail.append(node('span', '', t.noTime));
      if (venue) detail.append(node('span', 'session-venue', term(venue)));
      list.append(detail);
    }
    article.append(list);
  } else {
    article.append(node('p', 'campus-summary', t.noTime));
  }

  // Show an explicitly published deadline even when it has passed; it explains why a form link is absent.
  const shownDeadlines = mode === 'deadlines' ? deadlines : event.deadlines || [];
  for (const d of shownDeadlines) {
    if (!t.due[d.kind] || !Number.isFinite(moment(d.at))) continue;
    article.append(node('p', 'campus-due', t.due[d.kind] + ' · ' + displayDate(d.at, null, d.precision, formats)));
  }

  const actions = node('div', 'campus-actions');
  for (const action of event.actions || []) {
    const href = urlFor(action.url);
    const related = (event.deadlines || []).filter(d => d.kind === action.kind);
    const expired = related.length > 0 && !deadlines.some(d => d.kind === action.kind);
    if (!href || !t.due[action.kind] || event.status === 'cancelled' || expired) continue;
    actions.append(link(href, text?.actionLabels?.[action.kind] || t[action.kind], 'campus-action', title.textContent));
  }
  actions.append(link(source, t.source, 'campus-source', title.textContent));
  article.append(actions);
  addOfficialPoster(event.poster, article, title, actions, t.poster);
  return article;
}

function render() {
  const lang = language(), t = campusCopy[lang], formats = formatters(lang);
  const status = get('campus-status');
  for (const name of ['upcoming', 'deadlines']) {
    const button = get('campus-' + name);
    button.setAttribute('aria-pressed', String(mode === name));
    button.textContent = t[name];
  }
  if (feed) get('campus-asof').textContent = t.checked(formats.minute.format(moment(feed.checkedAt)));
  const now = Date.now();
  const current = currentEntries(now).map(entry => ({ ...entry, formats: eventFormats(entry.event, entry.sessions) }));
  renderFormatFilter(get('campus-formats'), lang, selectedFormat, current.some(entry => entry.formats.includes('other')));
  const entries = current.filter(entry => matchesFormat(entry.formats, selectedFormat)).map(entry => ({
    order: entry.order, title: entry.event.title, article: card(entry, lang, formats),
  }));
  if (mode !== 'deadlines' && matchesFormat(['performance'], selectedFormat)) entries.push(...demoEntries(now));
  entries.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
  const list = get('campus-list');
  const focused = list.contains(document.activeElement) && document.activeElement;
  const focusedId = focused && focused.closest('article')?.dataset.id;
  list.replaceChildren(...entries.map(entry => entry.article));
  if (focusedId) {
    const buttons = list.querySelector('[data-id="' + CSS.escape(focusedId) + '"]')?.querySelectorAll('a,button') || [];
    const replacement = [...buttons].find(button => button.href === focused.href) || buttons[0] || get('campus-' + mode);
    replacement.focus({ preventScroll: true });
  }
  if (!feed) status.textContent = failed ? t.loadError : t.loading;
  else if (failed) status.textContent = t.saved;
  else if (entries.length) status.textContent = '';
  else if (selectedFormat === 'all') status.textContent = mode === 'deadlines' ? t.noDeadlines : t.none;
  else status.textContent = mode === 'deadlines' ? formatCopy[lang].noDeadlines : formatCopy[lang].empty;
}

async function readJson(path) {
  const response = await fetch(path, { cache: 'no-cache' });
  if (!response.ok) throw new Error('HTTP ' + response.status);
  return response.json();
}

function schedule() {
  clearTimeout(timer);
  if (document.hidden) return;
  const now = Date.now();
  let next = loading ? Infinity : lastAttempt + refreshIntervalMs;
  // If the page stays open, remove closed actions at their explicit deadline.
  for (const event of feed?.events || []) {
    const boundaries = [
      ...(event.deadlines || []).map(d => cutoff(d.at, d.precision)),
      ...(event.sessions || []).map(sessionEnd),
    ];
    for (const boundary of boundaries) if (boundary > now) next = Math.min(next, boundary);
  }
  if (Number.isFinite(next)) timer = setTimeout(refresh, Math.max(1, next - now));
}

async function refresh() {
  if (!loading && Date.now() - lastAttempt >= refreshIntervalMs) {
    loading = true;
    lastAttempt = Date.now();
    if (feed) {
      render();
      schedule();
    }
    try {
      const [data, captions] = await Promise.all([
        readJson('./data/campus-events.json'),
        readJson('./data/campus-translations.json').catch(() => translations),
      ]);
      if (!Number.isFinite(moment(data.checkedAt)) || !Array.isArray(data.events)) throw new Error('Invalid CAP feed');
      feed = data;
      translations = captions || {};
      failed = false;
    } catch {
      failed = true;
    } finally {
      loading = false;
    }
  }
  render();
  schedule();
}

get('campus-formats').addEventListener('click', event => {
  const button = event.target.closest('button[data-format]');
  if (!button || button.dataset.format === selectedFormat) return;
  selectedFormat = button.dataset.format;
  render();
});
for (const name of ['upcoming', 'deadlines']) {
  get('campus-' + name).addEventListener('click', () => {
    mode = name;
    render();
  });
}
document.addEventListener('cityuhk-events-hub:language', render);
document.addEventListener('cityuhk-events-hub:demos', render);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) clearTimeout(timer);
  else refresh();
});
render();
refresh();

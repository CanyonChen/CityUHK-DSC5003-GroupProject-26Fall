import { copy, programmeText, productionsZh, staticZh, staticZhCn } from './i18n.js';
import { formatCopy } from './event-formats.js';

const get = id => document.getElementById(id);
const englishPageTitle = document.title;
const seatHash = event => '#seating/' + encodeURIComponent(event.id);
const languages = {
  en: { html: 'en', locale: 'en-GB', query: '', translated: {} },
  zh: { html: 'zh-Hant-HK', locale: 'zh-Hant-HK', query: 'zh-hk', translated: staticZh },
  'zh-cn': { html: 'zh-Hans-CN', locale: 'zh-Hans-CN', query: 'zh-cn', translated: staticZhCn },
};
function languageFromUrl() {
  const code = new URL(location.href).searchParams.get('lang')?.toLowerCase();
  if (code === 'zh-cn') return 'zh-cn';
  if (code === 'zh-hk' || code === 'zh') return 'zh';
  return 'en';
}
let language = languageFromUrl();
let snapshot;
let currentEvent;
let performances = [];
let performance;
let selectedSeat = null;
let returnToCard = null;
let loadFailed = false;
let date, dateTime, percentage, currency;

// Capture the original English once so switching back also restores accessible names.
const staticText = [];
for (const [marker, attribute] of Object.entries({
  'data-i18n': null, 'data-i18n-aria': 'aria-label', 'data-i18n-content': 'content', 'data-i18n-alt': 'alt',
})) {
  for (const node of document.querySelectorAll('[' + marker + ']')) {
    staticText.push({ node, attribute, key: node.getAttribute(marker), english: attribute ? node.getAttribute(attribute) : node.textContent });
  }
}

function resetFormatters() {
  const locale = languages[language].locale;
  const options = { timeZone: 'Asia/Hong_Kong', day: 'numeric', month: 'short', year: 'numeric' };
  date = new Intl.DateTimeFormat(locale, options);
  dateTime = new Intl.DateTimeFormat(locale, { ...options, hour: '2-digit', minute: '2-digit', hour12: false });
  percentage = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 2 });
  currency = new Intl.NumberFormat(locale, {
    style: 'currency', currency: snapshot?.currency || 'HKD', minimumFractionDigits: 0, maximumFractionDigits: 2,
  });
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function followsLinkInThisTab(click) {
  return click.button === 0 && !click.ctrlKey && !click.metaKey && !click.shiftKey && !click.altKey;
}

// Dates order the demonstrators and CAP announcements together. Archived demos remain available.
export function demoEntries(now) {
  if (!snapshot) return [];
  return snapshot.events.map(event => {
    const shows = snapshot.performances.filter(show => show.eventId === event.id)
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    const next = shows.find(show => Date.parse(show.startsAt) >= now);
    const show = next || shows.at(-1);
    const t = copy[language];
    const { title, genre, description, poster } = programmeText(event, language);
    const label = '[Demo] ' + title;
    const article = element('article', 'campus-card pictured-card demo-card event-card');
    article.dataset.id = event.id;
    const heading = element('h3', 'campus-title', label);
    if (poster) {
      const cover = element('div', 'event-cover demo-cover');
      const img = element('img', 'event-poster demo-poster');
      img.alt = '';
      img.loading = 'lazy';
      const illustrated = Boolean(productionsZh[event.id]);
      img.width = illustrated ? 1200 : 1600;
      img.height = illustrated ? 800 : 900;
      img.src = illustrated ? './media/posters/' + event.id + '.webp' : poster;
      cover.append(img, heading);
      article.append(cover);
    } else article.append(heading);
    const format = formatCopy[language === 'zh' ? 'zh-hk' : language].card.performance;
    article.append(element('div', 'campus-card-head', ['CityUHK Events Hub', format, genre === format ? null : genre].filter(Boolean).join(' · ')),
      element('p', 'campus-summary', description));
    const details = [t.performances(shows.length)];
    if (show) details.push(dateTime.format(new Date(show.startsAt)), t.venues[show.venue] || show.venue);
    article.append(element('p', 'demo-meta', details.filter(Boolean).join(' · ')));
    const actions = element('div', 'campus-actions');
    const open = element('a', 'campus-action demo-open', t.openSeats);
    open.href = seatHash(event);
    open.setAttribute('aria-label', t.openSeats + ' · ' + label);
    open.addEventListener('click', click => {
      if (followsLinkInThisTab(click)) {
        history.replaceState({ ...history.state, demoOpener: String(event.id) }, '');
      }
    });
    actions.append(open);
    article.append(actions);
    return { order: next ? Date.parse(next.startsAt) : Infinity, title: label, article };
  });
}

function selectEvent(event) {
  currentEvent = event;
  performances = snapshot.performances.filter(show => show.eventId === event.id)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  performance = performances.find(show => show.startsAt >= snapshot.capturedAt) || performances.at(-1);
  selectedSeat = null;
  renderDetails();
}

function renderDetails(keepRegion = '') {
  const t = copy[language];
  const { title, description } = programmeText(currentEvent, language);
  get('detail-title').textContent = '[Demo] ' + title;
  document.title = get('detail-title').textContent + ' · CityUHK Events Hub';
  get('description').textContent = description;
  get('no-performance').hidden = Boolean(performance);
  get('performance-detail').hidden = !performance;
  if (!performance) return;

  const options = performances.map(show => {
    const label = [dateTime.format(new Date(show.startsAt)), t.venues[show.venue] || show.venue,
      t.shows[show.status] || show.status].join(' · ');
    return new Option(label, show.id);
  });
  const select = get('performance-select');
  select.replaceChildren(...options);
  select.value = performance.id;
  const section = get('section-select');
  section.replaceChildren(...performance.regions.map(r => new Option(t.section(r.region), r.region)));
  if (performance.regions.some(r => r.region === keepRegion)) section.value = keepRegion;
  renderSeats();
  renderOccupancy();
}

function updateView() {
  if (!snapshot) return;
  const hash = location.hash;
  const seating = get('seating');
  const event = hash === '#seating' ? snapshot.events[0] : snapshot.events.find(item => seatHash(item) === hash);
  if (event) {
    if (hash === '#seating') history.replaceState(history.state, '', seatHash(event));
    if (event === currentEvent) return;
    get('main').dataset.view = 'seating';
    seating.hidden = false;
    selectEvent(event);
    get('detail-title').focus({ preventScroll: true });
    window.scrollTo(0, 0);
    return;
  }
  const unknownSeatMap = hash === '#seating' || hash.startsWith('#seating/');
  if (unknownSeatMap) history.replaceState(null, '', '#campus');
  if (!currentEvent && !unknownSeatMap) return;

  currentEvent = null;
  selectedSeat = null;
  seating.hidden = true;
  delete get('main').dataset.view;
  document.title = languages[language].translated.pageTitle || englishPageTitle;

  // The feed may have refreshed while the visitor was inspecting a seat.
  const openerId = returnToCard || history.state?.demoOpener;
  returnToCard = null;
  const opener = openerId && get('campus-list').querySelector('.demo-card[data-id="' + CSS.escape(openerId) + '"] .demo-open');
  const destination = get(location.hash.slice(1)) || get('main');
  const target = opener || destination.querySelector('h1,h2') || destination;
  if (!opener) target.tabIndex = -1;
  target.focus({ preventScroll: true });
  (opener || destination).scrollIntoView({ block: opener ? 'center' : 'start' });
}

get('seat-back').addEventListener('click', click => {
  if (followsLinkInThisTab(click)) {
    returnToCard = currentEvent && String(currentEvent.id);
  }
});
window.addEventListener('hashchange', updateView);

function renderOccupancy() {
  const t = copy[language];
  const container = get('occupancy');
  container.replaceChildren();
  for (const region of performance.regions) {
    const entry = element('div', 'region-item');
    const head = element('div', 'region-head');
    const rate = region.occupancyRate;
    head.append(element('strong', '', t.section(region.region)), element('span', '', rate == null ? '—' : percentage.format(rate)));
    const meter = element('div', 'meter');
    meter.setAttribute('aria-hidden', 'true');
    const fill = element('span');
    fill.style.width = Math.max(0, Math.min(rate ?? 0, 1)) * 100 + '%';
    meter.append(fill);
    entry.append(head, meter, element('p', 'region-detail', t.regionDetail(region)));
    container.append(entry);
  }
}

function seatLabel([region, row, number, status, cents, tier]) {
  const t = copy[language];
  const price = cents == null ? t.priceUnknown : currency.format(cents / 100);
  return t.seatDetail(region, row, number, t.states[status] || status, t.tiers[tier] || tier, price);
}

function inspectSeat(button) {
  const previous = get('seat-map').querySelector('button[tabindex="0"]');
  if (previous) {
    previous.tabIndex = -1;
    previous.setAttribute('aria-pressed', 'false');
  }
  selectedSeat = button.dataset.seat;
  button.tabIndex = 0;
  button.setAttribute('aria-pressed', 'true');
  get('seat-detail').textContent = button.title;
}

function renderSeats() {
  const t = copy[language];
  const seats = performance.seats.filter(([region]) => region === get('section-select').value)
    .sort((a, b) => a[1] - b[1] || a[2] - b[2]);
  const seatMap = get('seat-map');
  seatMap.replaceChildren();
  let row, lastRow, keptButton;
  seats.forEach((seat, index) => {
    const [, rowNo, number, status] = seat;
    if (rowNo !== lastRow) {
      row = element('div', 'seat-row');
      row.append(element('span', 'row-no', t.row(rowNo)));
      seatMap.append(row);
      lastRow = rowNo;
    }
    const button = element('button', 'seat ' + status.toLowerCase(), number);
    button.type = 'button';
    button.title = seatLabel(seat);
    button.dataset.seat = rowNo + '-' + number;
    button.setAttribute('aria-label', button.title);
    button.setAttribute('aria-pressed', 'false');
    button.tabIndex = index ? -1 : 0;
    row.append(button);
    if (button.dataset.seat === selectedSeat) keptButton = button;
  });
  get('seat-count').textContent = t.seats(seats.length);
  if (keptButton) inspectSeat(keptButton);
  else {
    selectedSeat = null;
    get('seat-detail').textContent = seats.length ? t.seatHint : t.emptySection;
  }
}

function applyLanguage() {
  language = languageFromUrl();
  resetFormatters();
  document.documentElement.lang = languages[language].html;
  const adminEntry = document.querySelector('[data-admin-entry]');
  const adminUrl = new URL('./admin/', document.baseURI);
  if (languages[language].query) adminUrl.searchParams.set('lang', languages[language].query);
  adminEntry.href = adminUrl.href;
  for (const { node, attribute, key, english } of staticText) {
    const text = languages[language].translated[key] ?? english;
    if (attribute) node.setAttribute(attribute, text);
    else node.textContent = text;
  }
  for (const code of Object.keys(languages)) get('lang-' + code).setAttribute('aria-pressed', String(language === code));
  document.dispatchEvent(new CustomEvent('cityuhk-events-hub:language'));
  if (loadFailed) get('load-status').textContent = copy[language].loadError;
  if (!snapshot) return;

  const focusedSeat = document.activeElement?.dataset.seat;
  get('snapshot-note').textContent = copy[language].snapshot(date.format(new Date(snapshot.capturedAt)));
  if (currentEvent) renderDetails(get('section-select').value);
  if (focusedSeat) get('seat-map').querySelector('[data-seat="' + CSS.escape(focusedSeat) + '"]')?.focus({ preventScroll: true });
}

for (const code of Object.keys(languages)) {
  get('lang-' + code).addEventListener('click', () => {
    if (language === code) return;
    const url = new URL(location.href);
    if (languages[code].query) url.searchParams.set('lang', languages[code].query);
    else url.searchParams.delete('lang');
    history.pushState(null, '', url);
    applyLanguage();
  });
}
window.addEventListener('popstate', () => {
  if (languageFromUrl() !== language) applyLanguage();
});

get('seat-map').addEventListener('click', event => {
  const button = event.target.closest('button');
  if (button) inspectSeat(button);
});
get('seat-map').addEventListener('keydown', event => {
  const button = event.target.closest('button');
  if (!button || !event.key.startsWith('Arrow')) return;
  const row = button.parentElement;
  const col = [...row.children].indexOf(button);
  let next;
  switch (event.key) {
    case 'ArrowRight': next = button.nextElementSibling; break;
    case 'ArrowLeft': next = button.previousElementSibling; break;
    case 'ArrowUp': next = row.previousElementSibling?.children[col]; break;
    case 'ArrowDown': next = row.nextElementSibling?.children[col]; break;
  }
  event.preventDefault();
  if (next?.matches('button')) {
    inspectSeat(next);
    next.focus();
  }
});

get('performance-select').addEventListener('change', event => {
  performance = performances.find(show => String(show.id) === event.target.value);
  selectedSeat = null;
  renderDetails();
});
get('section-select').addEventListener('change', () => {
  selectedSeat = null;
  renderSeats();
});

async function load() {
  const response = await fetch('./data/snapshot.json');
  if (!response.ok) throw new Error('HTTP ' + response.status);
  snapshot = await response.json();
  resetFormatters();
  get('snapshot-note').textContent = copy[language].snapshot(date.format(new Date(snapshot.capturedAt)));
  get('load-status').hidden = true;
  document.dispatchEvent(new CustomEvent('cityuhk-events-hub:demos'));
  updateView();
}

applyLanguage();
load().catch(error => {
  loadFailed = true;
  get('load-status').textContent = copy[language].loadError;
  if (location.hash === '#seating' || location.hash.startsWith('#seating/')) location.replace('#campus');
  console.error('CityUHK Events Hub catalogue:', error);
});

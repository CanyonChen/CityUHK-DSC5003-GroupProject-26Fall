export const formatIds = ['talk', 'workshop', 'performance', 'conference'];

export const formatCopy = {
  en: {
    label: 'Activity format', empty: 'No events match this format.',
    noDeadlines: 'No upcoming deadlines for this format.',
    options: { all: 'All formats', talk: 'Talks & forums', workshop: 'Workshops', performance: 'Performances', conference: 'Conferences', other: 'Other' },
    card: { talk: 'Talk / forum', workshop: 'Workshop', performance: 'Performance', conference: 'Conference', other: 'Other' },
  },
  'zh-cn': {
    label: '活动形式', empty: '暂无这种形式的活动。', noDeadlines: '这种形式的活动暂无即将到期的报名或投稿期限。',
    options: { all: '全部形式', talk: '讲座与论坛', workshop: '工作坊', performance: '演出', conference: '学术会议', other: '其他' },
    card: { talk: '讲座／论坛', workshop: '工作坊', performance: '演出', conference: '学术会议', other: '其他' },
  },
  'zh-hk': {
    label: '活動形式', empty: '暫無這種形式的活動。', noDeadlines: '這種形式的活動暫無即將到期的報名或投稿限期。',
    options: { all: '全部形式', talk: '講座與論壇', workshop: '工作坊', performance: '演出', conference: '學術會議', other: '其他' },
    card: { talk: '講座／論壇', workshop: '工作坊', performance: '演出', conference: '學術會議', other: '其他' },
  },
};

const markers = {
  talk: /\b(?:talks?|lectures?|seminars?|forums?|colloqui(?:um|a)|panel discussions?)\b|講座|讲座|論壇|论坛|研討會|研讨会/iu,
  workshop: /\b(?:workshops?|masterclasses|masterclass)\b|工作坊|大師班|大师班/iu,
  performance: /\b(?:concerts?|recitals?|musicals?|(?:live|stage|dance|theatre) performances?)\b|音樂會|音乐会|演奏會|演奏会|演出/iu,
  conference: /\b(?:conferences?|congress(?:es)?|symposi(?:um|a)|conventions?)\b|學術會議|学术会议|學術大會|学术大会/iu,
};

function formatsFrom(values) {
  const terms = values.filter(Boolean);
  const found = formatIds.filter(id => terms.some(value => markers[id].test(value)));
  if (!found.includes('performance') && terms.some(value => /^\[?performances?\]?$/iu.test(value.trim()))) {
    found.push('performance');
  }
  return found;
}

export function eventFormats(event, remaining = event.sessions || []) {
  const sessions = event.sessions || [];
  // Once the lecture in a lecture-and-concert programme ends, only the concert is available.
  if (remaining.length && remaining.length < sessions.length && sessions.every(s => formatsFrom([s.label]).length)) {
    return formatsFrom(remaining.map(s => s.label));
  }
  // The heading before the topic identifies the format in e.g. "Seminar on concert acoustics".
  const title = (event.title || '').normalize('NFKC');
  const heading = title.split(/[:：]|\s[–—-]\s|\b(?:on|about)\b/iu)[0];
  const found = formatsFrom([event.category, heading, ...sessions.map(s => s.label)]);
  return found.length ? found : ['other'];
}

export function matchesFormat(formats, selected) {
  return selected === 'all' || formats.includes(selected);
}

export function renderFormatFilter(group, lang, selected, hasOther) {
  const copy = formatCopy[lang];
  const focused = group.contains(document.activeElement) ? document.activeElement.dataset.format : null;
  const caption = document.createElement('span');
  caption.id = 'format-label';
  caption.className = 'format-label';
  caption.textContent = copy.label;
  const options = document.createElement('div');
  options.className = 'format-options';
  for (const id of ['all', ...formatIds, ...(hasOther || selected === 'other' ? ['other'] : [])]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'format-button';
    button.dataset.format = id;
    button.setAttribute('aria-controls', 'campus-list');
    button.setAttribute('aria-pressed', String(id === selected));
    button.textContent = copy.options[id];
    options.append(button);
  }
  group.setAttribute('aria-labelledby', caption.id);
  group.replaceChildren(caption, options);
  if (focused) (options.querySelector('[data-format="' + CSS.escape(focused) + '"]') || options.firstElementChild).focus({ preventScroll: true });
}

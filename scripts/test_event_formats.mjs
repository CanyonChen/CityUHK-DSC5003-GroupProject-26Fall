import test from 'node:test';
import assert from 'node:assert/strict';
import { eventFormats, matchesFormat } from '../pages/event-formats.js';

test('the sessions of a mixed announcement contribute distinct formats', () => {
  const formats = eventFormats({
    title: '(10 & 12 December)[Seminar & Concert] New Model Asians', category: 'Others',
    sessions: [{ label: 'Guest Lecture' }, { label: 'Concert' }],
  });
  assert.deepEqual(formats, ['talk', 'performance']);
  for (const choice of ['all', 'talk', 'performance']) assert.equal(matchesFormat(formats, choice), true);
  assert.equal(matchesFormat(formats, 'workshop'), false);
});

test('distinguishes a verified conference from a generic call for papers', () => {
  const event = { title: 'Call for Papers – Gacha Con 2027', category: 'Others', sessions: [{ label: 'Conference' }] };
  assert.deepEqual(eventFormats(event), ['conference']);
  assert.deepEqual(eventFormats({ ...event, title: 'Student Research Meeting' }), ['conference']);
  assert.deepEqual(eventFormats({ title: 'Call for Papers – Student Journal', category: 'Others' }), ['other']);
});

test('a completed lecture no longer puts the remaining concert in the talks filter', () => {
  const event = { title: '[Seminar & Concert] New Model Asians', sessions: [{ label: 'Guest Lecture' }, { label: 'Concert' }] };
  assert.deepEqual(eventFormats(event, [event.sessions[1]]), ['performance']);
  const incomplete = { ...event, sessions: [{ label: 'Guest Lecture' }, { label: null }] };
  assert.deepEqual(eventFormats(incomplete, [incomplete.sessions[1]]), ['talk', 'performance']);
});

test('uses source format evidence without treating technical subject matter as a performance', () => {
  assert.deepEqual(eventFormats({ title: 'Seminar on concert hall acoustics', category: 'Research Seminar' }), ['talk']);
  assert.deepEqual(eventFormats({ title: 'High-performance computing', category: 'Others' }), ['other']);
  assert.deepEqual(eventFormats({ title: 'SoundLab', sessions: [{ label: 'Listening Workshop' }] }), ['workshop']);
  assert.deepEqual(eventFormats({ title: 'Energy is Power', category: 'Academic Seminar' }), ['talk']);
  assert.deepEqual(eventFormats({ title: 'Performance: New works' }), ['performance']);
  assert.deepEqual(eventFormats({ title: 'Digital media symposium' }), ['conference']);
});

test('recognises clear Chinese formats and leaves missing or unspecified data browsable', () => {
  assert.deepEqual(eventFormats({ title: '講座及音樂會' }), ['talk', 'performance']);
  assert.deepEqual(eventFormats({ title: '聆听工作坊' }), ['workshop']);
  assert.deepEqual(eventFormats({ title: '周年活動', category: 'Others', sessions: [{ label: null }] }), ['other']);
  assert.equal(matchesFormat(['other'], 'all'), true);
});

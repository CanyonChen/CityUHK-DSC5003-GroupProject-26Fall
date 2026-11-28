import test from 'node:test';
import assert from 'node:assert/strict';
import { choosePerformance } from '../pages/demo-performance.mjs';

const shows = [
  { id: 3, startsAt: '2026-11-29T08:20:00Z' },
  { id: 1, startsAt: '2026-11-26T08:30:00Z' },
  { id: 2, startsAt: '2026-11-28T08:20:00Z' },
];
test('selects the upcoming show using current time instead of the snapshot date', () => {
  assert.equal(choosePerformance(shows, Date.parse('2026-11-28T09:00:00Z')).id, 3);
  assert.deepEqual(shows.map(show => show.id), [3, 1, 2]);
});
test('retains the last archived show when all performances have started', () => {
  assert.equal(choosePerformance(shows, Date.parse('2026-12-01T00:00:00Z')).id, 3);
});
test('handles no shows and invalid dates', () => {
  assert.equal(choosePerformance([], 0), undefined);
  assert.equal(choosePerformance([{ startsAt: 'invalid' }], 0), undefined);
});

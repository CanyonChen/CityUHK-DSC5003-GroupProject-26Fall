// Cards and seat details must choose the same upcoming performance.
export function choosePerformance(shows, now = Date.now()) {
  const ordered = shows.filter(show => Number.isFinite(Date.parse(show.startsAt)))
    .slice().sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  return ordered.find(show => Date.parse(show.startsAt) >= now) || ordered.at(-1);
}

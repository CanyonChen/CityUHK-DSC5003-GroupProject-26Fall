/**
 * Coalesce invalidation signals into limited REST refetches.
 *
 * - 300ms debounce so bursts produce one request.
 * - 500ms minimum interval, plus a 500ms max wait so continuous writes are
 *   never starved by the debounce timer.
 * - Only one refresh may be in flight; later signals leave one pending run.
 * - No refresh while the tab is hidden; one catch-up run when it becomes visible.
 */
export function createLiveRefresh(refresh, options = {}) {
  const debounceMs = options.debounceMs ?? 300;
  const minIntervalMs = options.minIntervalMs ?? 500;
  const maxWaitMs = options.maxWaitMs ?? Math.max(debounceMs, minIntervalMs);
  const isHidden = options.isHidden || (() => (
    typeof document !== 'undefined' && document.visibilityState === 'hidden'
  ));

  let debounceTimer = null;
  let maxTimer = null;
  let waitTimer = null;
  let inFlight = false;
  let pending = false;
  let paused = false;
  let closed = false;
  let lastRun = 0;

  function clearTimers() {
    clearTimeout(debounceTimer);
    clearTimeout(maxTimer);
    clearTimeout(waitTimer);
    debounceTimer = null;
    maxTimer = null;
    waitTimer = null;
  }

  function queue() {
    if (closed) return;
    pending = true;
    if (paused || isHidden()) return;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(run, debounceMs);
    if (!maxTimer) maxTimer = setTimeout(run, maxWaitMs);
  }

  async function run() {
    clearTimers();
    if (closed || paused || isHidden()) return;
    if (inFlight) return;

    const wait = Math.max(0, lastRun + minIntervalMs - Date.now());
    if (wait > 0) {
      waitTimer = setTimeout(run, wait);
      return;
    }

    inFlight = true;
    pending = false;
    lastRun = Date.now();
    try {
      await refresh();
    } catch {
      // A page-level load already owns its error state.
    } finally {
      inFlight = false;
      if (pending && !paused && !isHidden()) queue();
    }
  }

  function onVisibilityChange() {
    if (isHidden()) {
      clearTimers();
      return;
    }
    if (pending && !paused) queue();
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibilityChange);
  }

  return {
    push: queue,
    pause() {
      paused = true;
      clearTimers();
    },
    resume() {
      if (!paused) return;
      paused = false;
      if (pending) queue();
    },
    stop() {
      closed = true;
      clearTimers();
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibilityChange);
      }
    },
  };
}

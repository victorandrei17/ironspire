/**
 * Service worker registration (SPEC §17.4).
 *
 * Registration failure is never fatal: the worker only buys offline play and a
 * home-screen install, and a game that refuses to start because a cache could
 * not be created would be a much worse trade.
 */
export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;
  // Registration competes with the first frames for main-thread time, so it
  // waits for load rather than racing the game's own startup.
  window.addEventListener('load', () => {
    void navigator.serviceWorker
      .register('./sw.js')
      .then(() => navigator.serviceWorker.ready)
      .then(() => precacheLoadedResources())
      .catch(() => undefined);
  });
}

/**
 * Hands the worker the list of files this page actually loaded.
 *
 * Necessary because the worker only starts controlling the page AFTER the first
 * load's requests have completed: its fetch handler never sees the hashed
 * bundle on a first visit, so without this the game would fail to open offline
 * until the second visit.
 */
function precacheLoadedResources(): void {
  const controller = navigator.serviceWorker.controller;
  if (controller === null) return;
  const origin = window.location.origin;
  const urls = new Set<string>([window.location.href]);
  for (const entry of performance.getEntriesByType('resource')) {
    if (entry.name.startsWith(origin)) urls.add(entry.name);
  }
  controller.postMessage({ type: 'precache', urls: [...urls] });
}

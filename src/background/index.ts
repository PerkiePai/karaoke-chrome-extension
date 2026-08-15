import { searchLyrics } from '../lrclib/client';

console.log('[karaoke] service worker started');

chrome.runtime.onInstalled.addListener(() => {
  void runSmokeTest();
});

/**
 * Proves at install time that this browser can reach LRCLIB from a service
 * worker. Exists so platform problems surface immediately rather than being
 * mistaken for bugs in song matching later.
 */
async function runSmokeTest(): Promise<void> {
  try {
    const results = await searchLyrics('oasis wonderwall');
    const syncedCount = results.filter((r) => r.syncedLyrics).length;
    console.log(
      `[karaoke] SMOKE OK — ${results.length} results, ${syncedCount} with synced lyrics`,
    );
    console.log('[karaoke] first result:', results[0]);
  } catch (error) {
    console.error('[karaoke] SMOKE FAILED —', error);
  }
}

import { searchLyrics } from '../lrclib/client';
import { handleFetchLyrics } from './handle-fetch-lyrics';
import type { FetchLyricsRequest } from '../messaging/types';

console.log('[karaoke] service worker started');

chrome.runtime.onInstalled.addListener(() => {
  void runSmokeTest();
});

chrome.runtime.onMessage.addListener((message: FetchLyricsRequest, _sender, sendResponse) => {
  if (message?.type !== 'FETCH_LYRICS') return false;

  void handleFetchLyrics(message, (query) => searchLyrics(query)).then(sendResponse);

  // Returning true keeps the message channel open for the async sendResponse
  // above. Without it Chromium closes the channel and the caller gets
  // undefined. This is the single most common MV3 messaging bug.
  return true;
});

async function runSmokeTest(): Promise<void> {
  try {
    const results = await searchLyrics('oasis wonderwall');
    const syncedCount = results.filter((r) => r.syncedLyrics).length;
    console.log(
      `[karaoke] SMOKE OK — ${results.length} results, ${syncedCount} with synced lyrics`,
    );
  } catch (error) {
    console.error('[karaoke] SMOKE FAILED —', error);
  }
}

import { searchLyrics } from '../lrclib/client';
import { handleFetchLyrics } from './handle-fetch-lyrics';
// writeLyricsCache and writeVideoMeta are used by the PICK_CANDIDATE handler added in Task 4.
import { writeLyricsCache, writeVideoMeta, type StorageLike } from './storage';
import type { FetchLyricsRequest } from '../messaging/types';

console.log('[karaoke] service worker started');

const storage: StorageLike = {
  get: (keys) => chrome.storage.local.get(keys) as Promise<Record<string, unknown>>,
  set: (items) => chrome.storage.local.set(items),
  remove: (keys) => chrome.storage.local.remove(keys),
};

chrome.runtime.onInstalled.addListener(() => {
  void runSmokeTest();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'FETCH_LYRICS') {
    void handleFetchLyrics(
      message as FetchLyricsRequest,
      (query) => searchLyrics(query),
      storage,
    ).then(sendResponse);
    return true;
  }
  return false;
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

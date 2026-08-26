import { searchLyrics } from '../lrclib/client';
import { handleFetchLyrics } from './handle-fetch-lyrics';
import { handleSearchCandidates } from './handle-search-candidates';
import { writeLyricsCache, clearNotFoundCache, type StorageLike } from './storage';
import type {
  FetchLyricsRequest,
  SearchCandidatesRequest,
  PickCandidateRequest,
  PickCandidateResponse,
} from '../messaging/types';

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

  if (message?.type === 'SEARCH_CANDIDATES') {
    void handleSearchCandidates(
      message as SearchCandidatesRequest,
      (query) => searchLyrics(query),
    ).then(sendResponse);
    return true;
  }

  if (message?.type === 'PICK_CANDIDATE') {
    const req = message as PickCandidateRequest;
    // Only cache the lyrics — VideoMeta is written synchronously by the content
    // script at pick time, so the background never races with a nudge write.
    void Promise.all([
      writeLyricsCache(storage, req.record.id, req.record),
      clearNotFoundCache(storage, req.videoId),
    ]).then(() => {
      sendResponse({ ok: true } satisfies PickCandidateResponse);
    });
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

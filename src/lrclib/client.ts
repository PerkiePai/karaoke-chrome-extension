import type { LrclibRecord } from '../core/types';

const API_BASE = 'https://lrclib.net/api';

// Browsers forbid setting User-Agent from fetch, so LRCLIB reads this instead.
const CLIENT_HEADER = 'karaoke-chrome-extension v0.1.0 (personal use)';

const DEFAULT_RETRY_AFTER_SEC = 60;

export class LrclibRateLimitError extends Error {
  constructor(readonly retryAfterSec: number) {
    super(`lrclib rate limited; retry after ${retryAfterSec}s`);
    this.name = 'LrclibRateLimitError';
  }
}

export async function searchLyrics(
  query: string,
  fetchImpl: typeof fetch = fetch,
): Promise<LrclibRecord[]> {
  const url = `${API_BASE}/search?q=${encodeURIComponent(query)}`;
  const res = await fetchImpl(url, { headers: { 'Lrclib-Client': CLIENT_HEADER } });

  if (res.status === 429) {
    const header = res.headers.get('retry-after');
    const parsed = header ? Number.parseInt(header, 10) : Number.NaN;
    throw new LrclibRateLimitError(
      Number.isFinite(parsed) ? parsed : DEFAULT_RETRY_AFTER_SEC,
    );
  }

  if (!res.ok) {
    throw new Error(`lrclib search failed: HTTP ${res.status}`);
  }

  return (await res.json()) as LrclibRecord[];
}

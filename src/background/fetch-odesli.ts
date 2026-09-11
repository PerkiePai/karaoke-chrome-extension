export interface OdesliResult {
  title: string;
  artistName: string;
}

const ODESLI_TIMEOUT_MS = 5000;
const ODESLI_BASE = 'https://api.song.link/v1-alpha.1/links';

export async function fetchOdesli(
  videoId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<OdesliResult | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ODESLI_TIMEOUT_MS);
  try {
    const url =
      `${ODESLI_BASE}` +
      `?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}` +
      `&songIfSingle=true`;
    const resp = await fetchImpl(url, { signal: controller.signal });
    if (!resp.ok) return null;
    const data = (await resp.json()) as unknown;
    return extractOdesliResult(data);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function extractOdesliResult(data: unknown): OdesliResult | null {
  if (typeof data !== 'object' || data === null) return null;
  const d = data as Record<string, unknown>;
  const uniqueId = typeof d['entityUniqueId'] === 'string' ? d['entityUniqueId'] : null;
  if (!uniqueId) return null;
  const entities = d['entitiesByUniqueId'];
  if (typeof entities !== 'object' || entities === null) return null;
  const entity = (entities as Record<string, unknown>)[uniqueId];
  if (typeof entity !== 'object' || entity === null) return null;
  const e = entity as Record<string, unknown>;
  const title = typeof e['title'] === 'string' ? e['title'].trim() : null;
  const artistName = typeof e['artistName'] === 'string' ? e['artistName'].trim() : null;
  if (!title || !artistName) return null;
  return { title, artistName };
}

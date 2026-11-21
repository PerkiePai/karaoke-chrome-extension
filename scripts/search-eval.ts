/**
 * Replay eval for lyric search: runs the real `handleFetchLyrics` against live
 * LRCLIB for every labeled video in `scripts/search-eval.csv` and reports how
 * many come back right, wrong, or missing.
 *
 *   npm run eval:search            # score against labels
 *   npm run eval:search -- --fill  # also write results into blank expectedId cells
 *
 * Labels: LRCLIB id(s) — `|`-separated, since LRCLIB stores duplicates of one
 * song — or `none` (no lyrics on LRCLIB / not a song), or blank.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { handleFetchLyrics } from '../src/background/handle-fetch-lyrics';
import { searchLyrics } from '../src/lrclib/client';
import { buildReadings } from '../src/core/readings';
import { parseMusicAttribution, parseArtTrackDescription } from '../src/core/music-attribution';

const CSV_PATH = 'scripts/search-eval.csv';
const ROW_DELAY_MS = 400;
const fill = process.argv.includes('--fill');

interface Row { videoId: string; expectedId: string; note: string }

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

const csvQuote = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

const [header, ...lines] = readFileSync(CSV_PATH, 'utf8').replace(/^﻿/, '').trim().split(/\r?\n/);
const rows: Row[] = lines.map((line) => {
  const [videoId = '', expectedId = '', note = ''] = parseCsvLine(line);
  return { videoId: videoId.trim(), expectedId: expectedId.trim(), note };
});

const log = console.log;
console.log = () => {};
console.warn = () => {};

const counts = { correct: 0, wrong: 0, miss: 0, 'none-ok': 0, unlabeled: 0, error: 0 };
let requests = 0;

for (const row of rows) {
  let got = 'none';
  let detail = '';
  try {
    const html = await (await fetch(`https://www.youtube.com/watch?v=${row.videoId}`, {
      headers: { 'Accept-Language': 'en-US,en', Cookie: 'SOCS=CAI' },
    })).text();
    const player = html.match(/var ytInitialPlayerResponse\s*=\s*(\{.*?\});/s)?.[1];
    if (!player) throw new Error('no ytInitialPlayerResponse');
    const vd = JSON.parse(player).videoDetails as { title: string; author?: string; lengthSeconds?: string };
    const readings = buildReadings(vd.title, vd.author ?? null, parseMusicAttribution(html), parseArtTrackDescription(html));
    const primary = readings[0]!;
    const res = await handleFetchLyrics(
      {
        type: 'FETCH_LYRICS',
        videoId: row.videoId,
        artist: primary.artist,
        track: primary.track,
        durationSec: vd.lengthSeconds ? Number(vd.lengthSeconds) : null,
        alternates: readings.slice(1),
      },
      (query) => { requests++; return searchLyrics(query); },
    );
    if (res.ok) {
      got = String(res.lrclibId);
      detail = `${res.record.trackName} / ${res.record.artistName}`;
    } else if (res.reason !== 'not-found') {
      throw new Error(res.message);
    }
  } catch (error) {
    counts.error++;
    log(`ERROR     ${row.videoId}  ${(error as Error).message}  ${row.note}`);
    continue;
  }

  let verdict: keyof typeof counts;
  if (!row.expectedId) verdict = 'unlabeled';
  else if (row.expectedId.split('|').includes(got)) verdict = got === 'none' ? 'none-ok' : 'correct';
  else verdict = got === 'none' ? 'miss' : 'wrong';
  counts[verdict]++;
  if (fill && !row.expectedId) row.expectedId = got;
  log(`${verdict.padEnd(9)} ${row.videoId}  got=${got} expected=${row.expectedId || '-'}  ${detail}  ${row.note}`);
  await new Promise((r) => setTimeout(r, ROW_DELAY_MS));
}

if (fill) {
  const body = rows.map((r) => [r.videoId, r.expectedId, csvQuote(r.note)].join(','));
  writeFileSync(CSV_PATH, [header, ...body].join('\n') + '\n');
}

log(`SUMMARY correct=${counts.correct} wrong=${counts.wrong} miss=${counts.miss} none-ok=${counts['none-ok']} unlabeled=${counts.unlabeled} error=${counts.error} requests=${requests}`);

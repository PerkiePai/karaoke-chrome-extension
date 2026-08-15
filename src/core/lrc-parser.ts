import type { LyricLine } from './types';

// [mm:ss.xx] / [mm:ss.xxx] / [mm:ss:xx] / [mm:ss]
const TIMESTAMP = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;

/** Parses LRC text into lines sorted ascending by timestamp. */
export function parseLrc(lrc: string): LyricLine[] {
  const lines: LyricLine[] = [];

  for (const raw of lrc.split(/\r?\n/)) {
    TIMESTAMP.lastIndex = 0;
    const timestamps: number[] = [];
    let consumed = 0;
    let match: RegExpExecArray | null;

    while ((match = TIMESTAMP.exec(raw)) !== null) {
      // Timestamps must form an unbroken prefix; anything later is lyric text.
      if (match.index !== consumed) break;
      consumed = match.index + match[0].length;
      timestamps.push(toMs(match[1]!, match[2]!, match[3]));
    }

    // Metadata tags such as [ar:...] contain no digits pair and yield nothing.
    if (timestamps.length === 0) continue;

    const text = raw.slice(consumed).trim();
    for (const timeMs of timestamps) lines.push({ timeMs, text });
  }

  lines.sort((a, b) => a.timeMs - b.timeMs);
  return lines;
}

function toMs(minutes: string, seconds: string, fraction: string | undefined): number {
  const fractionMs = fraction
    ? Math.round(Number.parseFloat(`0.${fraction}`) * 1000)
    : 0;
  return (
    Number.parseInt(minutes, 10) * 60_000 +
    Number.parseInt(seconds, 10) * 1000 +
    fractionMs
  );
}

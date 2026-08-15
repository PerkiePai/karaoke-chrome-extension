import { parseLrc } from '../core/lrc-parser';
import type { LrclibRecord } from '../core/types';

export interface RenderPlan {
  /** Empty string means "hide the status element" — see PanelHandle.setStatus. */
  status: string;
  lines: string[];
}

/**
 * Decides what the panel shows for a record. Pure, so the branch order is
 * testable without a DOM.
 *
 * Synced lyrics are only preferred once they PARSE to at least one timed line:
 * a non-empty LRC body of nothing but metadata tags yields zero lines, and
 * rendering that leaves a blank status over a blank list with no fallback and
 * no explanation.
 */
export function planRender(record: LrclibRecord): RenderPlan {
  const synced = parseLrc(record.syncedLyrics ?? '');
  if (synced.length > 0) {
    return { status: '', lines: synced.map((line) => line.text) };
  }

  if (record.plainLyrics?.trim()) {
    return {
      status: 'No timings available for this track.',
      lines: record.plainLyrics.split(/\r?\n/),
    };
  }

  // Absent lyrics and a declared instrumental are different facts about the
  // record, so they must not share one confidently-wrong message.
  return {
    status: record.instrumental
      ? 'This track is marked instrumental.'
      : 'No lyrics available for this track.',
    lines: [],
  };
}

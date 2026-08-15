/**
 * What the content script should do next, given the page state.
 *
 * Pure and DOM-free so the navigation rules can be tested. The rules exist
 * because YouTube updates its DOM signals at different moments: the video-id
 * attribute can flip to the new video while the heading still holds the old
 * title. Rather than guess which element lags, we remember the title we acted
 * on and re-run when it changes.
 */
export type ReconcileAction =
  | { kind: 'idle' }
  | { kind: 'clear' }
  | { kind: 'activate'; videoId: string }
  | { kind: 'reload'; videoId: string };

export interface ReconcileInput {
  /** Video id in the address bar right now, or null off a watch page. */
  urlVideoId: string | null;
  /** Video id the content script currently believes it is showing. */
  currentVideoId: string | null;
  /** Title read from the DOM this instant, or null if none is readable. */
  detectedTitle: string | null;
  /** Title the currently displayed lyrics were fetched for. */
  renderedTitle: string | null;
  hasPanel: boolean;
  /** True while a lookup is in flight, so we do not stack requests. */
  isLoading: boolean;
}

export function decideReconcile(input: ReconcileInput): ReconcileAction {
  const { urlVideoId, currentVideoId, detectedTitle, renderedTitle, hasPanel, isLoading } = input;

  // Navigation wins over every other consideration.
  if (urlVideoId !== currentVideoId) {
    return urlVideoId === null ? { kind: 'clear' } : { kind: 'activate', videoId: urlVideoId };
  }

  if (urlVideoId === null) return { kind: 'idle' };
  if (!hasPanel || isLoading) return { kind: 'idle' };
  if (detectedTitle === null) return { kind: 'idle' };
  if (detectedTitle === renderedTitle) return { kind: 'idle' };

  return { kind: 'reload', videoId: urlVideoId };
}

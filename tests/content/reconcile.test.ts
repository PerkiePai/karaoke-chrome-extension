import { describe, it, expect } from 'vitest';
import { decideReconcile, type ReconcileInput } from '../../src/content/reconcile';

function input(over: Partial<ReconcileInput> = {}): ReconcileInput {
  return {
    urlVideoId: 'aaa',
    currentVideoId: 'aaa',
    detectedTitle: 'Oasis - Wonderwall',
    renderedTitle: 'Oasis - Wonderwall',
    hasPanel: true,
    isLoading: false,
    ...over,
  };
}

describe('decideReconcile', () => {
  it('activates when the url moves to a new video', () => {
    expect(decideReconcile(input({ urlVideoId: 'bbb', currentVideoId: 'aaa' }))).toEqual({
      kind: 'activate',
      videoId: 'bbb',
    });
  });

  it('activates when arriving at a video from a non-watch page', () => {
    expect(decideReconcile(input({ urlVideoId: 'bbb', currentVideoId: null }))).toEqual({
      kind: 'activate',
      videoId: 'bbb',
    });
  });

  it('clears when leaving a video for a non-watch page', () => {
    expect(decideReconcile(input({ urlVideoId: null }))).toEqual({ kind: 'clear' });
  });

  it('is idle while already off a watch page', () => {
    expect(decideReconcile(input({ urlVideoId: null, currentVideoId: null }))).toEqual({
      kind: 'idle',
    });
  });

  it('is idle when nothing has changed', () => {
    expect(decideReconcile(input())).toEqual({ kind: 'idle' });
  });

  // This is the bug. YouTube swapped the heading in after we already rendered
  // the previous video's title, and nothing was re-checking.
  it('reloads when the title changes under the same video', () => {
    expect(
      decideReconcile(
        input({ renderedTitle: 'LOSO - Old Song', detectedTitle: 'LOSO - New Song' }),
      ),
    ).toEqual({ kind: 'reload', videoId: 'aaa' });
  });

  it('does not reload while a load is already in flight', () => {
    expect(
      decideReconcile(
        input({ renderedTitle: null, detectedTitle: 'LOSO - New Song', isLoading: true }),
      ),
    ).toEqual({ kind: 'idle' });
  });

  it('does not reload before a title has been detected', () => {
    expect(decideReconcile(input({ detectedTitle: null }))).toEqual({ kind: 'idle' });
  });

  it('does not reload when there is no panel to update', () => {
    expect(
      decideReconcile(input({ hasPanel: false, detectedTitle: 'x', renderedTitle: 'y' })),
    ).toEqual({ kind: 'idle' });
  });

  it('prefers navigation over reload when both changed', () => {
    expect(
      decideReconcile(
        input({ urlVideoId: 'bbb', currentVideoId: 'aaa', renderedTitle: 'x', detectedTitle: 'y' }),
      ),
    ).toEqual({ kind: 'activate', videoId: 'bbb' });
  });
});

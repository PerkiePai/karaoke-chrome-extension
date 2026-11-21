import { normalizeTitleCandidates, type ParsedTitle } from './title-normalizer';

interface TitleArtist {
  title: string;
  artist: string;
}

/**
 * Every reading of a video's song, best first. Music attribution and Art Track
 * metadata are label data, so they lead; the raw-title guesses follow, plus the
 * channel name as artist when the title carries none. Shared by the content
 * script and the search eval so both search exactly the same readings.
 */
export function buildReadings(
  rawTitle: string,
  channelName: string | null,
  attribution: TitleArtist | null,
  artTrack: TitleArtist | null,
): ParsedTitle[] {
  const titleReadings = normalizeTitleCandidates(rawTitle);
  if (titleReadings[0]!.artist === null && channelName) {
    titleReadings.push({ artist: channelName, track: titleReadings[0]!.track });
  }
  return [
    ...(attribution ? [{ artist: attribution.artist, track: attribution.title }] : []),
    ...(artTrack ? [{ artist: artTrack.artist, track: artTrack.title }] : []),
    ...titleReadings,
  ];
}

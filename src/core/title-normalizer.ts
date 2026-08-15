export interface ParsedTitle {
  artist: string | null;
  track: string;
}

// Bracketed promo tags. Note the absence of live/acoustic/cover/remix:
// the match scorer relies on those surviving.
const BRACKETED_NOISE =
  /[([]\s*[^)\]]*\b(?:official|lyrics?|audio|m\/?v|visualizer|teaser|hd|4k|\d{3,4}p)\b[^)\]]*\s*[)\]]/gi;

const CJK_BRACKETED_NOISE = /【[^】]*】/g;

const FEATURED = /\s*[([]?\s*\b(?:feat\.?|ft\.?|featuring)\s+[^)\]]*[)\]]?/gi;

const BARE_NOISE = [
  /\|\s*official[^|]*$/gi,
  /\bofficial\s+(?:music\s+)?video\b/gi,
  /\bofficial\s+(?:audio|mv)\b/gi,
  /\b(?:hd|4k|1080p|720p)\b/gi,
];

const SEPARATORS = [' - ', ' – ', ' — ', ' | '];

const EDGE_JUNK = /^[-–—|:\s]+|[-–—|:\s]+$/g;

/** Turns a raw YouTube video title into a best-guess artist and track. */
export function normalizeTitle(rawTitle: string): ParsedTitle {
  let text = rawTitle.normalize('NFC');

  text = text.replace(CJK_BRACKETED_NOISE, ' ');
  text = text.replace(BRACKETED_NOISE, ' ');
  text = text.replace(FEATURED, ' ');
  for (const pattern of BARE_NOISE) text = text.replace(pattern, ' ');

  text = text.replace(/\s+/g, ' ').trim().replace(EDGE_JUNK, '').trim();

  for (const separator of SEPARATORS) {
    const index = text.indexOf(separator);
    // index > 0 so a leading separator never yields an empty artist.
    if (index <= 0) continue;
    const artist = text.slice(0, index).trim();
    const track = text.slice(index + separator.length).trim();
    if (artist && track) return { artist, track };
  }

  return { artist: null, track: text };
}

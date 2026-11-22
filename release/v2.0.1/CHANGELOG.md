# YouTube Karaoke Lyrics v2.0.1

Changes since v2.0.0. The file to install is `youtube-karaoke-lyrics-v2.0.1.zip`.

## Finds more songs

- **Lyrics for more songs.** Titles with extra words after the song name
  (`| Covered by …`, `#hashtags`, `【singer name】`, `(伴奏)`) used to find
  nothing. The extension now retries with just the song and artist. On a test
  set of 77 videos, songs found went from 32 to 40–41.
- **No more "Doesn't look like a music video."** That check hid real songs,
  most often songs uploaded under the Gaming category. Every video is now
  searched.
- **Backing tracks get the song's lyrics.** Instrumental, karaoke, off-vocal,
  伴奏, slowed, reverb, sped-up and nightcore videos now show the original
  song's lyrics.
- **Names with accents work.** Words like `Beyoncé` or `supїdo` used to be
  split up and found nothing.

## Fewer wrong lyrics

- **Covers in another language are never matched to the original.** A
  "Thai ver." or "(Thai Version)" cover won't show the English lyrics.
- **Live and remix videos keep their own version.** They're no longer
  matched to the studio recording just because the name is close.

## Small changes

- **No lyrics? The panel folds out of the way.** It shows "No lyrics found"
  and you can open it to search by hand. The next video opens the panel the
  way you left it.
- **Manual search shows the likely song first.** Results are ranked by how
  well they match the video, with timed lyrics ahead of plain ones.

## Installing / updating

1. Unzip `youtube-karaoke-lyrics-v2.0.1.zip` into a folder.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. **New install:** click **Load unpacked** and choose that folder.
   **Update:** replace the files in your existing folder, then click the
   reload ↻ button on the extension's card.
4. No new permissions.

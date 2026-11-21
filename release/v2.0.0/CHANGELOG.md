# YouTube Karaoke Lyrics v2.0.0

Changes since v1.0.2. The file to install is `youtube-karaoke-lyrics-v2.0.0.zip`.

## New

- **"↓ Current line" button.** If you scroll the lyrics by hand, a small button
  appears at the bottom of the lyrics. Click it to jump back to the line that's
  playing now. Works for both timed and plain-text lyrics.
- **Lyrics cache never fills up.** Every song you've loaded stays saved, so a
  song you've played before opens straight away, even offline. The old version
  kept only the last 50 songs.

## Improved

- **"Not this one?" stays available.** After you pick a different song, the
  "Not this one?" button is still there in case that pick is wrong too.
- **Easier to read.**
  - Long lines that wrap now read as one line.
  - The line playing now is bold.
  - The top and bottom of the lyrics fade out more gently.
- **Buttons look like buttons.** The offset, speed and "Not this one?" buttons
  share one style and light up when you hover over them.
- **Clickable lines show it.** For timed lyrics, hovering over a line lights it
  up and shows "Jump to this line".

## Installing / updating

1. Unzip `youtube-karaoke-lyrics-v2.0.0.zip` into a folder.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. **New install:** click **Load unpacked** and choose that folder.
   **Update:** replace the files in your existing folder, then click the
   reload ↻ button on the extension's card.
4. This version asks for one new permission, **unlimited storage**, for the
   cache. Chrome may switch the extension off after the update. If so, switch
   it back on in `chrome://extensions`.

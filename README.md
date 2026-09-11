# Live Karaoke Lyrics Youtube Extension

Turn any YouTube music video into a karaoke screen. A lyrics panel appears next to the video and highlights the current line as the song plays — no searching, no setup.

[![Download v1.0.0](https://img.shields.io/badge/%E2%9D%A4_Download-v1.0.0-ff69b4?style=for-the-badge)](https://github.com/PerkiePai/karaoke-chrome-extension/releases/download/v1.0.0/youtube-karaoke-lyrics-v1.0.0.zip)

## Preview

![Lyrics panel next to a YouTube video](docs/screenshot.png)

## Features

- **Automatic lyrics** for whatever you're watching — the song is detected and matched for you.
- **Line-by-line highlighting** that follows along in real time with the video.
- **Auto-scrolling lyrics** even when precise timing isn't available, so you're never stuck scrolling manually.
- **Click any line to jump** the video straight to that moment.
- **Sync adjustment** — nudge the timing or tap "sync here" if the lyrics drift out of step.
- **Fix a wrong match** by searching and picking the right song yourself — it's remembered next time.
- **Remembers your preferences** per video, so corrections and timing adjustments stick.

## Install

No Node, npm, or build step required — just download and load the extension.

1. Click the **❤ Download v1.0.0** button above and unzip the file (or grab it from the [Releases page](../../releases)).
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select the unzipped folder.
5. Open a YouTube music video — the lyrics panel appears next to it automatically.

**Updating:** download the newer release zip, remove the old unpacked extension from `chrome://extensions`, then load the new folder the same way.

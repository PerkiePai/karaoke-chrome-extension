# Research Report: YouTube Music Classification & Identification

**Topic**: Classifying YouTube videos as music vs. non-music, and — if music — identifying the song title and artist (for the karaoke-chrome-extension project)

**Items researched**: 44

## Table of Contents

### YouTube-native signals

1. ["Provided to YouTube by <distributor>" Art Track description block](#provided-to-youtube-by-distributor-art-track-description-block)
2. [Innertube /youtubei/v1/player + /youtubei/v1/next endpoints](#innertube-youtubei-v1-player-youtubei-v1-next-endpoints)
3. ["Music in this video" panel (YouTube Content ID music metadata panel)](#music-in-this-video-panel-youtube-content-id-music-metadata-panel)
4. [Video title/channel/description heuristic parsing (this project's src/core/title-normalizer.ts, comparable to community references goto-bus-stop/get-artist-title and its port lttkgp/youtube_title_parse)](#video-title-channel-description-heuristic-parsing-this-project-s-src-core-title-normalizer-ts-comparable-to-community-references-goto-bus-stop-get-artist-title-and-its-port-lttkgp-youtube-title-parse)
5. ["Artist - Topic" channels / Official Artist Channel (OAC) badge](#artist-topic-channels-official-artist-channel-oac-badge)
6. [YouTube Data API v3 (videoCategoryId / topicDetails)](#youtube-data-api-v3-videocategoryid-topicdetails)
7. [yt-dlp YouTube extractor (yt_dlp/extractor/youtube/ module family, e.g. _video.py)](#yt-dlp-youtube-extractor-yt-dlp-extractor-youtube-module-family-e-g-video-py)
8. [ytInitialData HTML scrape (Music in this video panel)](#ytinitialdata-html-scrape-music-in-this-video-panel)
9. [YouTube Music (music.youtube.com) page scraping and reverse-engineered InnerTube endpoints, as implemented by ytmusicapi](#youtube-music-music-youtube-com-page-scraping-and-reverse-engineered-innertube-endpoints-as-implemented-by-ytmusicapi)
10. [YouTube timedtext caption endpoint (/api/timedtext) and Data API v3 Captions resource](#youtube-timedtext-caption-endpoint-api-timedtext-and-data-api-v3-captions-resource)

### Audio fingerprinting (identification)

11. [AcoustID + Chromaprint](#acoustid-chromaprint)
12. [ACRCloud](#acrcloud)
13. [AudD](#audd)
14. [Gracenote (Nielsen)](#gracenote-nielsen)
15. [Olaf (Overly Lightweight Acoustic Fingerprinting)](#olaf-overly-lightweight-acoustic-fingerprinting)
16. [Panako](#panako)
17. [NeuralFP / audfprint / Echoprint](#neuralfp-audfprint-echoprint)
18. [Shazam / ShazamKit (Apple official SDK)](#shazam-shazamkit-apple-official-sdk)
19. [SongRec (open-source Shazam client, Rust/GPL)](#songrec-open-source-shazam-client-rust-gpl)
20. [SoundHound Houndify](#soundhound-houndify)

### Audio/ML classification

21. [CLAP (LAION clap-htsat-*)](#clap-laion-clap-htsat)
22. [Essentia.js](#essentia-js)
23. [MERT (MERT-v1-95M/330M)](#mert-mert-v1-95m-330m)
24. [MuQ / MuQ-MuLan](#muq-muq-mulan)
25. [PANNs (Pretrained Audio Neural Networks)](#panns-pretrained-audio-neural-networks)
26. [Singing Voice Detection (SVD)](#singing-voice-detection-svd)
27. [Demucs / Spleeter (source separation)](#demucs-spleeter-source-separation)
28. [VGGish](#vggish)
29. [YAMNet via MediaPipe Audio Classifier (@mediapipe/tasks-audio)](#yamnet-via-mediapipe-audio-classifier-mediapipe-tasks-audio)

### Metadata resolution & lyrics

30. [BetterLyrics cf-api](#betterlyrics-cf-api)
31. [Deezer public API](#deezer-public-api)
32. [Discogs API](#discogs-api)
33. [iTunes/Apple Search API](#itunes-apple-search-api)
34. [LRCLIB (lrclib.net)](#lrclib-lrclib-net)
35. [MusicBrainz + ListenBrainz](#musicbrainz-listenbrainz)
36. [Musicfetch](#musicfetch)
37. [Musixmatch richsync (word-level sync)](#musixmatch-richsync-word-level-sync)
38. [NetEase Cloud Music & QQ Music lyrics APIs](#netease-cloud-music-qq-music-lyrics-apis)
39. [Odesli / Songlink API](#odesli-songlink-api)
40. [Spotify Web API (search + ISRC lookup)](#spotify-web-api-search-isrc-lookup)
41. [syncedlyrics (Python library, reference)](#syncedlyrics-python-library-reference)
42. [Whisper / whisper-web (Transformers.js)](#whisper-whisper-web-transformers-js)

### Extension architecture constraints

43. [CORS / host_permissions reachability (LRCLIB, iTunes, Deezer, Odesli, Spotify, Musixmatch, ACRCloud)](#cors-host-permissions-reachability-lrclib-itunes-deezer-odesli-spotify-musixmatch-acrcloud)
44. [chrome.tabCapture + offscreen document (MV3 audio architecture)](#chrome-tabcapture-offscreen-document-mv3-audio-architecture)

---

## Detailed Findings

## YouTube-native signals

### "Provided to YouTube by <distributor>" Art Track description block

**Basic Info**

- *Name*: "Provided to YouTube by <distributor>" Art Track description block
- *Type*:

  Metadata parsing — identifier via regex-parseable, label/distributor-supplied plain-text description block

- *Maintainer*:

  Distributor/label-supplied content, delivered through Google's 'Art Track' auto-generated-video product for audio releases without a dedicated video asset; Google operates the ingestion pipeline, but the actual text is authored/templated by rights-holders and aggregators (DistroKid, CD Baby, TuneCore, The Orchard, major-label distribution arms, etc.) at release time, not by Google or the end uploader.


**Technical Approach**

- *Required input*:

  Video description text only — sourced from Data API videos.list snippet.description, Innertube /player's videoDetails.shortDescription, or watch-page HTML. No audio needed.

- *Minimum clip length*: 0s.

**Accuracy & Reliability**

- *Pitch speed cover robustness*:

  Same structural limitation as the Topic-channel and engagement-panel signals: this is per-video upload metadata tied to one canonical Art Track upload, not derived from audio analysis, so it provides zero coverage for sped-up/nightcore/pitch-shifted reuploads or cover versions, which by definition would not be genuine label-issued Art Track uploads carrying this exact text.

- *Evaluation dataset*:

  None official/benchmarked; the format and a working regex for it are documented informally through developer-community discussion (Stack Overflow-style threads and issue trackers such as ytdl-org/youtube-dl#26013 and yt-dlp#622/#3847/#8971), not a formal labeled evaluation set.

- *Confidence calibration*:

  No numeric score is emitted, but a successful match against the strict 'Provided to YouTube by' anchor text can reasonably be treated as a high, fixed-confidence result given the text is label/distributor-authored and not editable by the uploader, unlike free-text titles.


**Integration Feasibility**

- *Api availability*:

  Free — the description text is obtained through whichever transport is already in use (the free-tier-quota Data API, or free HTML/Innertube scraping); no separate paid service exists specifically for this signal.

- *Chrome extension usability*:

  Pure client-side regex execution over text already available from another call; no additional network request and no incremental CORS/host_permissions requirement beyond whatever already-fetched description text is being reused.

- *Audio access requirement*: None.
- *Client vs server*:

  Entirely local regex parsing; no data beyond the already-retrieved description text is sent anywhere.

- *Bundle weight cold start*:

  Negligible — a compiled regular expression run once per description, effectively sub-millisecond marginal cost.


**Latency**

- *Realtime capability*: Yes, effectively instant once the description text is already in hand from another call.

**Output**

- *Karaoke specific outputs*: None.

**Licensing & Legal**

- *Tos restrictions*:

  Same general ToS caveat as Items 2/3 applies only if the description text is sourced via free HTML/Innertube scraping (automated-access clause); if instead sourced via the official Data API's videos.list description field, this specific data point is fully ToS-compliant regardless of what regex is subsequently applied to already-authorized API output.

- *Risk tolerance note*:

  Lower incremental risk than Items 2/3/4 in isolation, since the underlying description text is commonly retrievable via the fully official Data API path — the 'unofficial' risk profile only attaches if it is instead sourced via free HTML/Innertube scraping rather than the keyed API.


**Pipeline Role**

- *Cascade position*:

  Enrichment — runs after an initial music/non-music gate (e.g. the Topic-channel check or engagement-panel presence) to extract a more structured, higher-confidence title/artist/album/release-date than generic title-string heuristics, and is particularly valuable as a fallback specifically when the 'Music in this video' panel (Items 2/3) is absent but the upload is nonetheless a genuine Art Track.

- *Failure mode*:

  Fails silently — a non-match simply yields no structured result and the pipeline falls through to weaker title-heuristic parsing; low risk of a confidently-wrong answer overall because the anchor text 'Provided to YouTube by' is distinctive and very unlikely to false-positive-match a genuinely non-music description.

- *Cost model at scale*: $0 — regex execution over already-available text, no incremental cost regardless of volume.
- *Geo region availability*:

  Subject to the same territory-scoped Content-ID/licensing gating as Items 2/3/4 for whether the Art Track exists or is visible in a given region at all; once visible, the description text itself carries no further region restriction.


**Uncertain fields** (excluded above, listed for reference)

- method
- classification_or_hitrate
- catalog_language_bias
- breakage_risk
- identification_fields
- isrc_availability

---

### Innertube /youtubei/v1/player + /youtubei/v1/next endpoints

**Basic Info**

- *Name*: Innertube /youtubei/v1/player + /youtubei/v1/next endpoints
- *Type*:

  Metadata parsing — identifier, via unofficial-but-versioned JSON API (the same internal endpoint YouTube's own web/mobile clients call)

- *Maintainer*:

  Unofficial — Google/YouTube operates the endpoint solely for its own first-party clients; there is no public SLA, documentation, or maintainer. The request shape and required client-context fields are reverse-engineered and actively tracked by community projects: yt-dlp, YouTube.js (LuanRT), Invidious, pytube/pytubefix, NewPipe.


**Technical Approach**

- *Method*:

  Direct JSON POST to https://www.youtube.com/youtubei/v1/player and https://www.youtube.com/youtubei/v1/next, with a request body containing videoId plus a context.client block (clientName/clientVersion mimicking a real client such as WEB, ANDROID, or TVHTML5_SIMPLY_EMBEDDED_PLAYER) and the public, shared INNERTUBE_API_KEY passed as a `key` query parameter. No HTML fetch or regex needed: /player returns videoDetails.musicVideoType and microformat.playerMicroformatRenderer directly as structured JSON fields; /next returns the identical engagementPanels -> structuredDescriptionContentRenderer -> videoAttributeViewModel tree that ytInitialData embeds inline in the HTML page, just delivered as a clean, independently-fetchable JSON response.

- *Required input*:

  Video ID plus a client-context payload (clientName/clientVersion and, for some clients, a signatureTimestamp/visitor ID); no audio, no full HTML page fetch required.

- *Minimum clip length*: 0s — pure metadata lookup, same as the HTML-scrape approach it parallels.

**Accuracy & Reliability**

- *Pitch speed cover robustness*:

  Same limitation as the HTML-scrape approach — content attribution metadata is attached per-video at ingestion time and does not follow pitch/speed-altered reuploads; musicVideoType is a static per-video classification, not derived from audio analysis at request time.

- *Catalog language bias*:

  Same bias as the HTML-scrape approach, since it is the same backing data delivered through a different transport — skews toward Content-ID/CMS-enrolled catalogs (Western majors, K-pop/J-pop via aggregators) and under-covers unclaimed indie/doujin/VTuber-original content.

- *Evaluation dataset*:

  None published; documented purely through reverse-engineering effort (yt-dlp's extractor code and wiki, YouTube.js source, Invidious commit history), not a formal labeled benchmark.

- *Confidence calibration*:

  No numeric confidence score; musicVideoType is a small closed enum and engagementPanel presence is binary, same calibration profile as the HTML-scrape item.


**Integration Feasibility**

- *Chrome extension usability*:

  Directly fetchable as a JSON POST from a background/service-worker context once www.youtube.com (or the youtubei.googleapis.com alt-host) is declared in host_permissions, bypassing CORS the same way any host_permissions-declared cross-origin request does. Advantage over HTML scraping: request/response shape is tied to a specific, chooseable client-context version rather than free-form page markup, decoupling the integration from unrelated HTML/layout churn (though not from the underlying JSON schema churn shared with Item 2).

- *Audio access requirement*: None.
- *Client vs server*:

  The video ID and a spoofed client-context identity leave the machine as a JSON POST to Google's own servers (the same destination the normal page load already contacts) — comparable privacy posture to HTML scraping, no third-party service involved, but it is a distinguishable extra background network call rather than simply reading the tab's already-loaded DOM.


**Latency**

- *Realtime capability*:

  Yes — typically sub-second per request, comparable to or faster than the HTML-scrape approach since no full page markup needs to be transferred or parsed.


**Output**

- *Identification fields*:

  title, artist, album from /next's structured-description panel (identical fields to Item 2), plus musicVideoType and a microformat category from /player as an additional coarse signal; still no ISRC and no numeric confidence score.

- *Isrc availability*: No.
- *Karaoke specific outputs*: None.

**Licensing & Legal**

- *Risk tolerance note*:

  This exact approach — direct Innertube calls with a spoofed client context — is the technical backbone of very widely deployed and long-running tools: yt-dlp, YouTube.js, Invidious, pytube/pytubefix, NewPipe. All operate in the same 'unofficial but ecosystem-normalized' gray area the project's own risk framing already applies to ytInitialData scraping, ytmusicapi, and SongRec.


**Pipeline Role**

- *Cascade position*:

  Enrichment / alternative gate — could either replace Item 2 as the primary gate (same underlying data, cleaner and more decoupled transport), or serve as a fallback/enrichment call specifically when the already-loaded page's ytInitialData failed to parse (e.g. the known truncated-regex edge case), fetching the same tree via a clean JSON request instead of re-parsing HTML.

- *Cost model at scale*:

  $0 monetarily (no official billing or quota), but carries an unbounded 'soft cost' of IP/session throttling or bot-detection risk under heavy repeated per-session use, a materially different risk shape than Item 2's simple reuse of a page load the browser was making anyway.

- *Geo region availability*:

  Same territory-scoped licensing variability as Item 2 for panel presence (Content-ID claims are region-scoped); no additional region gating is documented on the endpoint transport itself beyond YouTube's normal geo-restriction behavior for the underlying video.


**Uncertain fields** (excluded above, listed for reference)

- classification_or_hitrate
- api_availability
- bundle_weight_cold_start
- breakage_risk
- tos_restrictions
- failure_mode

---

### "Music in this video" panel (YouTube Content ID music metadata panel)

**Basic Info**

- *Name*: "Music in this video" panel (YouTube Content ID music metadata panel)
- *Type*:

  Metadata-resolver; also functions as an implicit music-vs-non-music binary signal, since its presence implies the video was Content-ID-claimed as containing identified music

- *Maintainer*:

  Google / YouTube (official first-party feature, populated via the Content ID copyright-management system and rights-holder-supplied metadata)


**Technical Approach**

- *Method*:

  Metadata parsing/scraping. The panel's text (song title, artist, sometimes licensor) is embedded in the watch page's ytInitialData JSON (engagement-panel / video-description music section) and rendered client-side. The underlying detection is done server-side by Content ID audio fingerprinting against rights-holder reference files, but that matching process itself is not exposed to third parties — only its output (a short metadata block) is exposed via the panel.

- *Required input*:

  Video URL / watch-page HTML (the embedded ytInitialData JSON blob). No client-side audio processing is involved.

- *Minimum clip length*:

  0s — this is precomputed server-side metadata; the consumer only reads an already-resolved tag, it does not analyze any clip length itself.


**Accuracy & Reliability**

- *Catalog language bias*:

  Coverage is entirely downstream of which rights holders have enrolled reference audio in Content ID. Major-label Western catalogs and large K-pop/J-pop label partners (e.g. SM, YG) are broadly represented. Anime/VTuber coverage depends on whether the responsible agency (e.g. Aniplex, Cover Corp) has enrolled the audio. Indie, self-released, and unclaimed uploads are the weakest segment and frequently receive no panel at all even when a human would clearly identify the content as music, consistent with the official doc's own caveat that the panel requires "sufficient data from the copyright owner."

- *Confidence calibration*:

  No confidence score is exposed. The panel is a binary presence/absence UI element carrying a flat text metadata block, not a probabilistic score that can be threshold-tuned.


**Integration Feasibility**

- *Api availability*:

  No official API exists to query this data. It is free to read as part of normal public page load (no API key, no documented rate limit beyond ordinary YouTube page-load throttling), but entirely unofficial/unsupported for programmatic third-party consumption.

- *Chrome extension usability*:

  Directly reachable with no extra permissions: a content script already injected on the youtube.com watch page can read the ytInitialData object already loaded into that same page, so no CORS issue, no host_permissions expansion, and no backend proxy is required.

- *Audio access requirement*: None — pure text/DOM/JSON read, no raw audio access of any kind.
- *Client vs server*:

  Fully client-side; nothing beyond the normal page load leaves the user's machine, and no video ID is sent to any third party beyond YouTube itself (which the user is already communicating with by viewing the page).

- *Bundle weight cold start*:

  Zero added bundle weight; the data is already present in the page the extension runs in, so reading it is an effectively free, synchronous, sub-millisecond operation once the page has loaded.

- *Breakage risk*:

  Moderate. This reads an unofficial, undocumented internal object shape (ytInitialData renderer keys/nesting), not a stable public API. Google has changed this panel's underlying markup across redesigns before — e.g., third-party projects such as Invidious have had to add dedicated patches to support parsing the "music description section" as YouTube's own structure evolved. No official SLA or community-maintained patch channel exists specifically for this; blast radius on breakage is limited to this one signal silently returning nothing.


**Latency**

- *Realtime capability*:

  Effectively instant — reading already-loaded page JSON is a synchronous, sub-millisecond client-side operation once the page itself has finished loading.


**Output**

- *Karaoke specific outputs*:

  None — no BPM, musical key, vocal/instrumental activity flag, or word-level timing is provided by this panel.


**Licensing & Legal**

- *Risk tolerance note*:

  Lower-risk than the other unofficial techniques surveyed in this project, since it only reads DOM/JSON data already delivered to the user's own browser for a page the user is already viewing (broadly comparable to how many legitimate extensions, e.g. ad blockers, read page content), rather than making unauthorized outbound requests to a private Google endpoint or using scraped authentication credentials.


**Pipeline Role**

- *Cascade position*:

  Gate / high-precision enrichment. When present, this is an extremely high-precision, officially-labeled signal confirming both "this is music" and the correct title/artist directly, so it should run first and cheaply short-circuit the rest of the identification cascade. Its absence is NOT proof the video isn't music (high false-negative rate for unclaimed/indie content), so it cannot serve as the sole non-music classifier.

- *Failure mode*:

  Fails silently. Either the panel is entirely absent (most likely exactly for the indie/unclaimed population this project most needs to handle), or, less commonly, is present but incomplete (only 10 of N songs shown, or a generic/compilation credit). It does not produce a confidently wrong answer — it produces no answer.

- *Cost model at scale*:

  Free — piggybacks on the page load the extension already performs; no additional per-query cost or documented ceiling.


**Uncertain fields** (excluded above, listed for reference)

- classification_or_hitrate
- pitch_speed_cover_robustness
- evaluation_dataset
- identification_fields
- isrc_availability
- tos_restrictions
- geo_region_availability

---

### Video title/channel/description heuristic parsing (this project's src/core/title-normalizer.ts, comparable to community references goto-bus-stop/get-artist-title and its port lttkgp/youtube_title_parse)

**Basic Info**

- *Name*:

  Video title/channel/description heuristic parsing (this project's src/core/title-normalizer.ts, comparable to community references goto-bus-stop/get-artist-title and its port lttkgp/youtube_title_parse)

- *Type*: Metadata-resolver — pure regex/text-normalization parser, not an ML/NLP model and not a classifier
- *Maintainer*:

  In-house (this project, karaoke-chrome-extension). Closest community open-source analogs are goto-bus-stop/get-artist-title (npm) and its Python port lttkgp/youtube_title_parse.


**Technical Approach**

- *Method*:

  Regex-based text parsing with no ML/NLP model, operating purely on the raw video title string. Pipeline in the current implementation: (1) collapse a duplicated artist name that straddles a bracketed tag via DUPLICATED_ACROSS_BRACKETS; (2) strip CJK and ASCII/full-width bracketed promo noise, gated on a shared promo-keyword allowlist (official/lyrics/audio/MV/visualizer/teaser/HD/4K/resolution) rather than blanket-stripping every bracket, deliberately preserving non-promo bracket content such as '(Live)' and Japanese quotation-mark titles '「…」'; (3) strip bracketed and bare feat./ft./featuring credits separately, since a bracketed credit can safely run to its closing bracket while a bare credit must stop at the next separator or string end to avoid swallowing the track title; (4) strip bare noise patterns (pipe-delimited promo suffixes, 'official video/audio', resolution tags, trailing language qualifiers like '- English'); (5) split on the first-by-position separator among ' - ', ' – ', ' — ', ' | ', ' /', '/ ' (earliest occurring position wins, not a fixed priority order), requiring a non-empty artist and track on both sides; (6) fall back to returning the whole cleaned string as track with a null artist if no separator splits cleanly. A companion normalizeTitleCandidates function also emits an artist/track-swapped alternative candidate, since some regions (the code specifically calls out Thai uploads) commonly use 'Song - Artist' order, deferring final disambiguation to a downstream match-scorer against a lyrics/metadata source.

- *Required input*:

  Title text string only. Channel name and description are named in this item's task description as potential future inputs, but the current title-normalizer.ts implementation consumes only the title.

- *Minimum clip length*: 0s — pure text parsing with no audio or time dimension involved at all.

**Accuracy & Reliability**

- *Pitch speed cover robustness*:

  Not applicable in the audio sense since text parsing never touches audio, but a text-analog form of this robustness is a deliberate design choice: the regex specifically does NOT strip '(Live)', '(Cover)', '(Remix)', or '(Acoustic)' bracket content, so a downstream match-scorer can use those variant tags to disambiguate cover/live/remix versions rather than collapsing them into the studio-original title. Inline code comments document this as a previously-fixed regression, where an earlier blanket bracket-stripper had collapsed 'Yellow (Live)' into plain 'Yellow', silently losing the variant signal.

- *Catalog language bias*:

  Explicitly engineered for broader-than-ASCII coverage: handles full-width brackets (【】「」『』（）) alongside ASCII ()[], and specifically accounts for Japanese quotation-mark brackets (「」/『』) being used as literal title-quoting punctuation rather than promo noise — a real documented failure mode the code fixed. It also explicitly handles the Thai convention of reversed 'Song - Artist' title order via the candidate-swap function. This gives it broader non-Western coverage than the community reference reviewed (get-artist-title's documentation shows no CJK-specific or reversed-order handling). Coverage for any region/genre is otherwise entirely contingent on whether uploaders in that community follow ANY recognizable delimiter convention at all — heuristic parsing has no fallback when they don't.

- *Confidence calibration*:

  No confidence score is emitted by the parser. It returns a deterministic best-guess {artist, track} pair (or {artist: null, track} on failure) plus, via normalizeTitleCandidates, a ranked list of plausible readings (best guess first) for a downstream scorer to disambiguate — the parser itself performs no certainty calibration.


**Integration Feasibility**

- *Api availability*:

  Not applicable — this is local in-repo TypeScript code, not an API or service; free and unlimited by definition with no network dependency.

- *Chrome extension usability*:

  Fully native to the extension — it already is extension code (src/core/title-normalizer.ts) and runs synchronously wherever it's called (content script or background), requiring zero permissions and no network access.

- *Audio access requirement*: None whatsoever — pure string input, no audio access of any kind.
- *Client vs server*: 100% client-side; no data of any kind leaves the user's machine for this step.
- *Bundle weight cold start*:

  Negligible — a small, dependency-free regex module with effectively zero cold-start cost, executing in microseconds per title.

- *Breakage risk*:

  Low breakage risk from YouTube-side changes, since it depends only on the plain-text title string YouTube always exposes and not on any page structure or API. It does carry ongoing false-positive/false-negative maintenance risk purely from the diversity of real-world title conventions, evidenced by the multiple historical bugs already documented and fixed in the code comments. Unlike Items 1, 2, 3, and 5, this is a fully self-maintained (in-house) surface with no external community patching it — all maintenance burden falls on this project.


**Latency**

- *Realtime capability*:

  Yes — trivially real-time; pure synchronous regex execution against a short string, effectively instant (sub-millisecond) with no network or model-inference latency of any kind.


**Output**

- *Identification fields*:

  artist (nullable string) and track (string) only in the current implementation — no album, no ISRC, and no confidence score.

- *Isrc availability*: None — video titles never carry ISRC data, so this method cannot produce one under any circumstance.
- *Karaoke specific outputs*:

  None — no BPM, musical key, vocal-activity flag, or timing information. Output is limited to the two text fields above and is intended to serve as a query key for downstream lyrics/metadata lookups (e.g. feeding an LRCLIB search), not as a final karaoke data source in itself.


**Licensing & Legal**

- *Tos restrictions*:

  None applicable — parsing a title string the extension already has legitimate access to (it is visible in the DOM of the page the user is on) raises no YouTube Terms of Service concerns; this is the lowest-risk technique of the five items surveyed.

- *Risk tolerance note*:

  No conflict between official policy and practice exists here, because nothing unofficial is being accessed. Heuristic title-text parsing is a universally accepted client-side technique, used openly by multiple published open-source packages (get-artist-title, youtube_title_parse) without any ToS controversy.


**Pipeline Role**

- *Cascade position*:

  Gate — the cheapest possible technique among the five (zero cost, zero latency, zero network), and should run first/always as the primary query-generation step feeding downstream lookups (e.g. an LRCLIB search). Its output is a candidate guess rather than a verified identification, so it should not be trusted alone as final identification without corroboration from a downstream match-scorer.

- *Failure mode*:

  Higher risk of a confident-but-wrong answer than the more server-verified items in this survey (1, 2, 5), because it has no verification step of its own — a plausible-looking but incorrect artist/track split (e.g. misreading a non-'Artist - Title' string, or the pipeline picking the wrong swapped candidate) can silently propagate downstream unless caught by a match-scorer or lyrics-lookup step. When no separator is found at all it fails more gracefully, returning a null artist rather than guessing one — the safer of its two failure modes.

- *Cost model at scale*: Free at unlimited scale — no infrastructure and no per-query cost, purely local compute.
- *Geo region availability*:

  Not region-gated in any technical sense, but effectiveness varies materially by regional title-writing convention — the code's explicit Thai reversed-order handling and CJK bracket handling are direct evidence this is a real, non-uniform, region-dependent accuracy factor. Regions/genres with unconventional title formatting (e.g. all-lowercase indie titles with no separator at all, or titles that are themselves a stylistic lyric fragment) will see materially worse hit-rate purely from title-writing style, independent of any technical or geographic restriction.


**Uncertain fields** (excluded above, listed for reference)

- classification_or_hitrate
- evaluation_dataset

---

### "Artist - Topic" channels / Official Artist Channel (OAC) badge

**Basic Info**

- *Name*: "Artist - Topic" channels / Official Artist Channel (OAC) badge
- *Type*:

  Classifier (near-binary, high precision) + identifier — channel-name/badge heuristic that simultaneously flags music and supplies the artist name directly

- *Maintainer*:

  Google/YouTube auto-generates Topic channels from the Content ID / YouTube Music ingestion pipeline; the Official Artist Channel program is Google-operated but nomination-gated — requests only come from labels, distributors, or Music Service Partners, not self-serve by the artist.


**Technical Approach**

- *Method*:

  Metadata parsing/heuristic: check the uploading channel's display title for the literal suffix ' - Topic' (marking an auto-generated, audio-ingestion-only distributor channel), or check the channel header's badge renderer for the Official Artist Channel music-note verified-artist badge; when the '- Topic' suffix matches, the channel title with that suffix stripped is used directly as the artist string.

- *Required input*:

  Channel title/handle text and, for the OAC path, badge metadata — obtainable from whichever transport already supplies channel context (ytInitialData HTML, Innertube /next channel header, or Data API channels.list snippet.title). No audio, no extra video-level fetch beyond what's already retrieved for other purposes.

- *Minimum clip length*: 0s.

**Accuracy & Reliability**

- *Pitch speed cover robustness*:

  Robust in a different sense than audio-fingerprint methods: channel identity is entirely independent of audio content, so it never misfires due to nightcore/speed/pitch edits — but by the same token it provides zero coverage when a nightcore or sped-up reupload is posted by an unrelated reuploader channel rather than the original Topic channel, even though the underlying song is unchanged. Strong on precision, weak on recall for edited/reuploaded audio.

- *Evaluation dataset*:

  None published by Google; the 'near 100% precision' characterization is a widely repeated community/heuristic claim (reverse-engineering communities, music-tech blogs, yt-dlp-adjacent discussions) rather than a measured benchmark against a labeled dataset.

- *Confidence calibration*:

  Effectively binary — either the channel title ends in ' - Topic' or carries the OAC badge, or it doesn't; no numeric score, though the binary match itself can reasonably be treated as a fixed high-confidence flag once triggered.


**Integration Feasibility**

- *Api availability*:

  Free — channel title/badge data rides on whatever transport is already fetching channel context (ytInitialData HTML, Innertube, or the free-tier-quota Data API's channels.list); no separate paid service is required specifically for this check.

- *Chrome extension usability*:

  Trivial client-side string check on data the extension already has for other purposes (channel name is always present in page/video metadata); no extra network call, no additional CORS/host_permissions concern beyond whatever transport already supplies the channel context.

- *Audio access requirement*: None.
- *Client vs server*:

  Entirely local string comparison; no additional data leaves the client beyond whatever channel metadata was already fetched incidentally for other purposes.

- *Bundle weight cold start*: Negligible — a string-suffix check or small badge lookup, effectively 0ms marginal cost.

**Latency**

- *Realtime capability*: Yes, effectively instant — a string check with no network round-trip of its own.

**Output**

- *Identification fields*:

  artist, extracted directly from the channel title (minus the ' - Topic' suffix), plus a near-certain music-content flag; does not by itself supply song title, album, or ISRC — must be paired with video-title parsing or the description/panel signals (Items 2/3/5) for the actual song title.

- *Isrc availability*: No.
- *Karaoke specific outputs*: None.

**Licensing & Legal**

- *Tos restrictions*:

  Reading a channel's already-public display name/badge carries the same general ToS caveat as whatever transport delivers it (none if sourced via the official Data API's channels.list; the general unofficial-scraping caveat if sourced via ytInitialData/Innertube) — the data point itself (a public channel name) carries no special restriction beyond its transport.

- *Risk tolerance note*:

  Same risk bucket as Items 2/3 if sourced via HTML/Innertube; zero additional risk if the channel title is instead pulled via the fully official Data API channels.list endpoint for this specific field.


**Pipeline Role**

- *Cascade position*:

  Gate — very cheap and very high precision, well suited as an early high-confidence gate to short-circuit further audio-based classification/fingerprinting once a Topic-channel or OAC match is found; naturally complements Items 2/5 for the actual song-title extraction once the music/artist determination is made.

- *Cost model at scale*:

  $0 — no dedicated API call; rides entirely on whatever transport already supplies the channel name for other purposes.

- *Geo region availability*:

  Topic-channel generation is tied to the same Content-ID/label-ingestion pipeline as Items 2/3, subject to territory-by-territory licensing variability in which catalogs get ingested at all, but once a Topic channel or OAC badge exists it is globally visible metadata, unlike engagement-panel presence which can be region-gated per individual viewer.


**Uncertain fields** (excluded above, listed for reference)

- classification_or_hitrate
- catalog_language_bias
- breakage_risk
- failure_mode

---

### YouTube Data API v3 (videoCategoryId / topicDetails)

**Basic Info**

- *Name*: YouTube Data API v3 (videoCategoryId / topicDetails)
- *Type*:

  Metadata-resolver / coarse classifier — official REST endpoint returning uploader-assigned category metadata, not a content-analyzed classification

- *Maintainer*: Google / YouTube (official, part of Google Cloud API family)

**Technical Approach**

- *Method*:

  Metadata parsing via REST call: videos.list snippet.categoryId returns one of ~15-32 fixed category IDs (10 = 'Music', assigned by the uploader at publish time, not derived from audio/video analysis); videos.list topicDetails.topicCategories returns Wikipedia-category URLs (successor to the deprecated Freebase-based topicIds). No fingerprinting, no ML inference — pure metadata lookup.

- *Required input*: Video ID (11-char) + registered API key. No audio, no page HTML, no video URL scraping.
- *Minimum clip length*: 0s — pure metadata lookup, no audio/time window needed at all.

**Accuracy & Reliability**

- *Pitch speed cover robustness*:

  Not applicable in the audio-fingerprinting sense — the endpoint never analyzes audio content at all, so it has no concept of surviving nightcore/speed/pitch edits; classification is entirely a function of whatever categoryId the original uploader picked, which is copied unchanged onto any reupload/edit unless the re-uploader manually changes it. This means edited reuploads are classified identically to the source only because the metadata field, not the audio, is being read.

- *Evaluation dataset*:

  None published — this is categorical upload metadata, not a benchmarked ML classifier, so there is no AudioSet/GTZAN/MAEB-style evaluation to cite.

- *Confidence calibration*:

  No confidence score at all — categoryId and topicCategories are flat categorical/enum values with no probability or threshold to tune.


**Integration Feasibility**

- *Chrome extension usability*:

  Directly callable via HTTPS from an extension (background service worker or content script) once www.googleapis.com is declared in host_permissions — standard CORS-enabled JSON REST endpoint, no proxy structurally required, but the API key must be bundled in the extension package, which is exposed to reverse-engineering/abuse unless restricted (e.g., by HTTP referrer or by routing through a backend).

- *Audio access requirement*: None — metadata-only call; no tabCapture, no offscreen document, no user gesture needed.
- *Client vs server*:

  Video ID and the extension's API key are sent directly from the client to Google's servers; no user audio ever leaves the machine. No backend proxy is strictly required, but a client-embedded key is a privacy/security consideration for Web Store disclosure and key-abuse risk versus proxying through a project-owned backend.

- *Breakage risk*:

  Low for the categoryId field itself — it is a stable, versioned, officially documented part of the API with years of continuous support. Materially higher/already-realized risk for topicDetails, which is a known partial deprecation (Freebase-era topic IDs frozen since 2017) — exactly the reason the project already evaluated and rejected this item. No active community patching is needed since it is an official, documented surface, but there is also no upside left to extract from topicDetails specifically.


**Latency**

- *Realtime capability*:

  Technically fast enough (sub-second) for in-browser use, but this item was already evaluated and rejected by the project for cost/quota-dependency reasons rather than latency.


**Output**

- *Identification fields*:

  A broad category label only (e.g. 'Music', 'Entertainment') and, via topicDetails, a coarse Wikipedia-category URL; no song title, artist, album, or confidence score is ever returned by this signal — it cannot identify a song on its own and would have to be combined with other signals for karaoke attribution.

- *Isrc availability*: No — categoryId/topicDetails carry no ISRC or any track-level identifier.
- *Karaoke specific outputs*: None — no BPM, key, vocal/instrumental activity, or word-level timing is exposed by this endpoint.

**Licensing & Legal**

- *Tos restrictions*:

  Governed by the YouTube API Services Terms of Service and associated Developer Policies (quota limits, restrictions on caching/re-displaying data beyond permitted windows, restrictions on reselling API data). Being the fully official channel, it carries the lowest ToS risk of any item in this research set.

- *Risk tolerance note*:

  None applicable — this is the officially sanctioned, lowest-risk path of all five items; the project's rejection was purely a cost/benefit call (API-key/quota dependency for no accuracy gain over free scraping), not a ToS or reliability concern.


**Pipeline Role**

- *Cascade position*:

  Not used (rejected by project). Had it been adopted, its natural role would have been an early, low-precision gate (broad music/non-music pre-filter) rather than a source of song identification, since it cannot name a track or artist.

- *Failure mode*:

  Fails silently in the sense that a wrong/self-reported categoryId simply yields a plausible-but-incorrect broad category (e.g., a music video filed as 'People & Blogs') rather than a crash — but because this signal never claims to identify a specific song/artist, it cannot itself produce a 'confidently wrong song name' the way a fingerprint mismatch could.

- *Geo region availability*:

  Globally available with no inherent region-gating on the classification fields themselves, though age-restricted, region-blocked, or otherwise limited videos may return partial/empty data regardless of category.


**Uncertain fields** (excluded above, listed for reference)

- classification_or_hitrate
- catalog_language_bias
- api_availability
- bundle_weight_cold_start
- cost_model_at_scale

---

### yt-dlp YouTube extractor (yt_dlp/extractor/youtube/ module family, e.g. _video.py)

**Basic Info**

- *Name*: yt-dlp YouTube extractor (yt_dlp/extractor/youtube/ module family, e.g. _video.py)
- *Type*: Metadata-resolver / reference implementation (parser, not a classifier)
- *Maintainer*:

  yt-dlp open-source project — a community-driven fork of youtube-dl, maintained by a large, actively rotating group of volunteer contributors on GitHub


**Technical Approach**

- *Method*:

  Metadata parsing — extracts and normalizes fields from YouTube's internal ytInitialData / ytInitialPlayerResponse and InnerTube 'player'/'next' endpoint JSON responses (using traverse_obj JSON-path helpers) into a canonical field set including track, artist/artists, album, creators, alt_title, release_date/release_year. No ML or audio fingerprinting is involved — it is a deterministic structured-data extractor covering both ordinary YouTube 'Music in this video' style metadata and music.youtube.com-native watch pages.

- *Required input*:

  A video URL or video ID; yt-dlp itself performs the HTTP requests server-side/wherever it runs to fetch the watch page and InnerTube player response JSON.

- *Minimum clip length*:

  0s — this metadata extraction path does not require decoding any audio at all (separate from yt-dlp's unrelated audio/video download capability).


**Accuracy & Reliability**

- *Pitch speed cover robustness*:

  Not applicable in the audio sense — this is a metadata reader, not an audio classifier, so it carries no such fragility itself; it reports whatever title/artist metadata the source upload carries regardless of whether the underlying audio has been pitch/speed altered by the uploader.

- *Evaluation dataset*:

  None in the sense of a formal benchmark corpus; correctness is validated via yt-dlp's own extractor test suite (_TESTS blocks asserting expected info_dict values) run in CI against live YouTube responses.

- *Confidence calibration*:

  No confidence score is emitted; each field is either populated (from structured YT-Music JSON) or left None/absent — a binary presence signal per field, not a calibrated probability.


**Integration Feasibility**

- *Api availability*:

  Free and open-source (permissive/public-domain-style license), requires no API key or quota because it talks directly to YouTube's own unofficial internal endpoints (the same ones the web player uses). No official rate limit, but subject to YouTube's general anti-bot throttling and, as of 2025-2026, escalating bot-detection/PO-token requirements that the project has had to add workarounds for.

- *Audio access requirement*:

  None for the metadata-only path used here; yt-dlp's separate audio/video download capability is unused and unrelated to pure metadata lookup.

- *Client vs server*:

  If actually executed (not merely used as a design reference), the video ID and response data go to wherever yt-dlp is run — necessarily a backend server, since it cannot run in the browser. Using it purely as a reference for hand-porting logic keeps the shipped extension fully client-side, since no yt-dlp code itself ships to the browser.

- *Bundle weight cold start*:

  Not applicable to the extension bundle if used only as a design reference. If deployed as a backend microservice, yt-dlp is a multi-MB Python package and spawning a process per request carries non-trivial cold-start latency (hundreds of ms to low seconds) compared to steady-state in-process reuse.

- *Breakage risk*:

  Low-to-moderate impact on this project specifically because it is an extremely actively maintained project (frequent, sometimes weekly, releases exist precisely because YouTube changes break it regularly) — high breakage frequency at the YouTube-source level, but very fast community patch turnaround, making it a reliable 'someone already solved this edge case' reference even though the underlying project itself churns constantly.


**Latency**

- *Realtime capability*:

  Not realtime as a live in-browser service — a full yt-dlp metadata fetch involves multiple network round-trips and typically takes on the order of 1+ seconds, and it cannot run in-browser at all. Used purely as a reference/spec for hand-porting logic into title-normalizer.ts, the resulting hand-written TypeScript regex is itself instant.


**Output**

- *Identification fields*:

  track, artist/artists (list), album, creators, alt_title, release_date, release_year, plus channel/uploader as fallback identity fields — the richest structured field set among the five items surveyed, and directly mappable to this project's needed title/artist output shape.

- *Karaoke specific outputs*:

  None — no BPM, musical key, vocal/instrumental activity, or word-level timing fields; output is purely descriptive catalog metadata.


**Licensing & Legal**

- *Tos restrictions*:

  yt-dlp operates by calling YouTube's unofficial internal endpoints (the same ones used by the web/mobile clients) rather than the official YouTube Data API — a long-standing, widely-known grey area against YouTube's Terms of Service prohibition on unauthorized automated access. YouTube/Google-adjacent legal action has touched this space before, most notably the 2020 RIAA DMCA takedown notice against youtube-dl (yt-dlp's predecessor) over its ability to download copyrighted audio, which GitHub initially honored and then reinstated after EFF intervention.

- *Risk tolerance note*:

  This is a canonical example of 'official policy conflicts with widely-deployed unofficial practice' as called out in the field definitions. yt-dlp has millions of users and is broadly tolerated/undisturbed in practice despite the underlying ToS conflict, but it is not an officially sanctioned integration path. Using its logic purely as a reference for hand-written regex (no live runtime calls to yt-dlp or YouTube internals from the shipped extension) sidesteps most of that operational risk while still benefiting from its battle-tested edge-case coverage.


**Pipeline Role**

- *Cascade position*:

  Reference/design-input rather than a live runtime pipeline stage for this Chrome-extension project, since it cannot run client-side. If ever deployed as a backend enrichment service instead, it would function as a fallback/enrichment stage — more expensive than pure client-side regex, invoked only on a miss.

- *Failure mode*:

  Fails silently for its structured metadata fields when that structured data is unavailable, returning None/empty rather than a wrong guess. Its generic title-guessing fallback path for unclaimed content, however, carries the same confident-but-wrong risk as any regex-based title parser (comparable to Item 4).

- *Cost model at scale*:

  Free/open-source with no licensing fee; the only cost is compute/hosting if run as a backend service (a Python process per invocation), plus the ongoing engineering cost of tracking upstream releases to avoid drifting out of sync with YouTube-side changes.


**Uncertain fields** (excluded above, listed for reference)

- classification_or_hitrate
- catalog_language_bias
- chrome_extension_usability
- isrc_availability
- geo_region_availability

---

### ytInitialData HTML scrape (Music in this video panel)

**Basic Info**

- *Name*: ytInitialData HTML scrape (Music in this video panel)
- *Type*:

  Metadata parsing/scraping — identifier (yields title + artist + album directly) via unofficial extraction of Google-authored JSON embedded in page HTML

- *Maintainer*:

  Unofficial/community — no vendor maintains this as a product; it consumes Google's own internally-generated JSON that YouTube embeds in the watch page for its own renderer to use. Current project implementation: src/core/music-attribution.ts (and src/content/music-attribution.ts).


**Technical Approach**

- *Method*:

  Regex-extract the `var ytInitialData = {...};` blob from raw watch-page HTML, JSON.parse it, then walk engagementPanels -> engagementPanelSectionListRenderer (matching panelIdentifier == 'engagement-panel-structured-description') -> content.structuredDescriptionContentRenderer.items -> horizontalCardListRenderer.cards -> card.videoAttributeViewModel, reading {title, subtitle, secondarySubtitle.content} as {title, artist, album}. Every step is optional-chained; any shape mismatch resolves to null rather than throwing.

- *Required input*:

  Raw watch-page HTML — either fetched via fetch(videoUrl) or read directly from the already-loaded tab's DOM in a content script. No audio, no API key.

- *Minimum clip length*:

  0s — pure metadata lookup, the data is present in the page source at load time with no time-window requirement.


**Accuracy & Reliability**

- *Classification or hitrate*:

  Per YouTube's own Help Center: the panel only covers the first 10 songs for videos containing many songs, is Content-ID-driven (populated by copyright-management claims or YouTube Audio Library matches), and can be absent for reasons unrelated to music-vs-non-music truth: insufficient distributor metadata, not-yet-identified/recently-claimed uploads, or videos marked 'made for kids'. When present, title/artist/album precision is high (label-supplied data); but absence of the panel does NOT imply the video isn't music — live performances, karaoke tracks, DJ mixes, and indie/unclaimed uploads commonly have no panel at all despite being music, so this cannot serve as a standalone music/non-music classifier, only a high-precision positive signal.

- *Pitch speed cover robustness*:

  Poor by construction — the panel is a metadata attachment to one specific uploaded video's Content ID claim, not derived from analyzing the audio at request time. A nightcore/sped-up/pitch-shifted reupload of the same underlying song requires its own independent Content ID claim and will very likely show no panel at all, even though the source track is identical.

- *Evaluation dataset*:

  None published/benchmarked — behavior is confirmed empirically (project's own SESSION.md notes from fetching real watch-page HTML, and Google's own Help Center documentation of the panel's constraints), not measured against a labeled dataset such as AudioSet or GTZAN.

- *Confidence calibration*:

  Binary presence/absence only — no numeric confidence score. When the panel is present its contents can be treated as high, fixed confidence (label-supplied); there is no gradation or tunable threshold.


**Integration Feasibility**

- *Api availability*:

  Free — no API key, no quota, no registration; a plain HTTP GET of the publicly served watch page (or a same-tab DOM read with zero extra network cost).

- *Chrome extension usability*:

  Directly usable from an extension: either fetch the page with host_permissions declared for www.youtube.com (bypasses standard CORS the way any host_permissions-declared cross-origin request does), or — cheaper — read document.documentElement.outerHTML / existing inline script content from the tab the user is already on via a content script, which needs no extra network permission at all.

- *Audio access requirement*: None — no tabCapture, no offscreen document, no user gesture, no audio access whatsoever.
- *Client vs server*:

  Entirely client-side: the video ID is already known (it's the tab the user is on) and the HTML/JSON is parsed locally; no third-party service is contacted beyond YouTube's own already-being-loaded page. Strong privacy posture and works fully offline once the HTML is available; only requires network if re-fetching a fresh copy of the page rather than reusing the loaded DOM.

- *Bundle weight cold start*:

  Negligible — a regex match plus JSON.parse over an already-available string; sub-to-low-tens-of-milliseconds even though the ytInitialData blob itself can be several hundred KB to a few MB.

- *Breakage risk*:

  Highest of the YouTube-native signal group: depends on an unversioned, undocumented internal renderer JSON tree (engagementPanelSectionListRenderer / structuredDescriptionContentRenderer / videoAttributeViewModel) that Google has changed shape before without notice — e.g. the Invidious project's commit history shows a prior migration from an older 'videoDescriptionMusicSectionRenderer' list-style renderer to the current 'videoAttributeViewModel' card-style renderer. No deprecation notices are ever issued for these internal schemas; breakage is silent and only caught by real-world testing. Blast radius is contained in the current implementation because parse failures already resolve to null (documented explicitly in the source file's own comments) rather than throwing, but the function requires ongoing manual maintenance whenever YouTube ships a redesign. The current regex's non-greedy match up to the first literal '};' is also a known, separately flagged truncation risk if a string value inside the blob happens to contain that exact substring.


**Latency**

- *Realtime capability*:

  Yes — regex + JSON parse of already-available HTML completes in well under 50ms; the dominant cost, if any, is the initial HTML fetch, not the extraction itself.


**Output**

- *Identification fields*:

  title (song title), artist (subtitle), album (secondarySubtitle.content) — no ISRC, no numeric confidence score.

- *Isrc availability*: No — the videoAttributeViewModel exposes only title/subtitle/album text, never an ISRC.
- *Karaoke specific outputs*:

  None — no BPM, musical key, vocal/instrumental activity, or word-level timing is exposed by this panel.


**Licensing & Legal**

- *Tos restrictions*:

  Technically falls under YouTube's Terms of Service clause restricting 'automated means' of accessing the Service without prior written permission when the HTML is re-fetched out-of-band (e.g. a background fetch()). Reading the currently-loaded tab's own already-rendered DOM inside a content script — no extra network request beyond what the browser already made to display the page to the user — is a materially lower-risk, arguably not-'automated-access-at-all' case than a separate background re-fetch.

- *Risk tolerance note*:

  This exact pattern (parsing ytInitialData) is the backbone of extremely widely-deployed unofficial tools — yt-dlp, youtube-dl, Invidious, and many browser extensions — all operating in the same ToS-gray, community-normalized zone the project's own code comments already acknowledge. YouTube has not historically pursued takedowns specifically for read-only metadata scraping of this kind (as distinct from stream-ripping/downloading), but there is no official sanction and no SLA.


**Pipeline Role**

- *Cascade position*:

  Gate — this is the current implementation's first-line, cheap, high-precision check: zero marginal cost, label-supplied truth when present, so it runs before any fingerprinting/ML fallback in the pipeline.

- *Failure mode*:

  Fails silently by design: both a parse failure (malformed/truncated JSON) and a genuinely absent panel resolve to the same null 'no attribution data' result, explicitly documented as the intended behavior in the source file's own comments — never a confidently-wrong song/artist answer.

- *Cost model at scale*:

  $0 — no API, no quota; the only cost is the bandwidth of the HTML page itself (typically several hundred KB up to a few MB per watch page) if re-fetched rather than read from the already-loaded tab, which is effectively free since the browser already downloaded it.


**Uncertain fields** (excluded above, listed for reference)

- catalog_language_bias
- geo_region_availability

---

### YouTube Music (music.youtube.com) page scraping and reverse-engineered InnerTube endpoints, as implemented by ytmusicapi

**Basic Info**

- *Name*:

  YouTube Music (music.youtube.com) page scraping and reverse-engineered InnerTube endpoints, as implemented by ytmusicapi

- *Type*: Metadata-resolver (structured catalog lookup/enrichment; not a classifier)
- *Maintainer*:

  Community open-source project sigma67/ytmusicapi (Python, 3,000+ GitHub stars per repository overview). The underlying InnerTube API it calls is Google's private/internal interface and is neither maintained nor supported by Google for third-party use.


**Technical Approach**

- *Method*:

  Metadata parsing/scraping — either (a) scraping the rendered music.youtube.com page's embedded ytInitialData, or (b) directly calling YouTube Music's internal InnerTube endpoints (e.g. POST https://music.youtube.com/youtubei/v1/search, .../browse, .../next) with headers/cookies that emulate the official web client, exactly as ytmusicapi does. No ML or audio fingerprinting is involved — it is a structured catalog lookup against YouTube Music's own database, either by search query text or by browsing a known videoId for canonical watch-page metadata.

- *Required input*:

  A search query string (e.g. a title/artist guess from the title-normalizer heuristic) OR a known YouTube videoId to browse for canonical metadata. Raw audio is never required.

- *Minimum clip length*: 0s — a text-query/ID catalog lookup, not an audio-length-dependent operation.

**Accuracy & Reliability**

- *Pitch speed cover robustness*:

  Not directly applicable since this is a catalog/text lookup rather than audio analysis. When used to confirm a title/artist guess (e.g. from the title-normalizer heuristic), it will correctly resolve to the canonical studio track regardless of whether the source YouTube video's own audio was sped-up/nightcore-edited by the uploader, since matching is driven by the text query rather than audio fingerprinting. Conversely, it offers no way to identify covers or live performances that are not themselves separately catalogued as distinct YouTube Music entries.

- *Confidence calibration*:

  Search results returned via ytmusicapi/InnerTube include a ranked list of typed results (resultType: song/video/album/artist), but no explicit numeric confidence/relevance score is exposed for consumers to threshold on; result ranking order is the closest available proxy for confidence.


**Integration Feasibility**

- *Api availability*:

  No official public API for YouTube Music exists at all (confirmed: the official YouTube Data API v3 does not expose music-specific fields like artist/album in its video snippet). ytmusicapi itself is free and open-source, but requires the caller to supply their own authentication material (cookies from a logged-in browser session, or OAuth credentials) extracted manually — there is no keyless/anonymous path for the full feature set, though basic search can work unauthenticated in many cases. No official rate limit exists; usage is governed by the same anti-bot risk as any InnerTube consumer.

- *Chrome extension usability*:

  Poor direct fit. Calling music.youtube.com InnerTube endpoints from a Chrome extension content script is subject to CORS, and per Chrome's 2021+ policy change, cross-origin fetches must be relayed through the extension's background service worker rather than made directly from a content script, even with host_permissions granted. A content script running on youtube.com (not music.youtube.com) also does not automatically have access to any music.youtube.com session cookies. Practically, this likely requires a backend proxy holding its own dedicated YouTube Music session rather than relying on the end user's own session, which adds operational complexity and a shared-credential risk (one flagged/banned service account breaks the feature for all users).

- *Audio access requirement*: None — text query or video ID only, no raw audio access needed.
- *Client vs server*:

  If deployed via a backend proxy (the realistic architecture given the CORS/auth constraints above), the video ID and/or the derived title/artist guess leaves the user's machine to that backend, and the backend's own YouTube Music session further communicates with Google — a materially different, less-private architecture than purely client-side metadata items.

- *Bundle weight cold start*:

  No extension-bundle weight if implemented purely as a backend call (nothing ships client-side). Server-side cold start for a Python ytmusicapi process is comparable to yt-dlp (moderate, sub-second to a few seconds depending on hosting).

- *Breakage risk*:

  High relative to the other items surveyed. It is a fully unofficial, authenticated, reverse-engineered API with no Google support. GitHub issue history shows recurring authentication breakage (OAuth failures such as issue #921, SAPISIDHASH cookie-signing issues such as issue #576, and 2025-2026 PO-token bot-detection changes) requiring active community patching. Blast radius on breakage is total failure of this enrichment step until the library ships a fix, and self-hosted credentials can additionally get flagged/banned by Google independent of any upstream code changes.


**Latency**

- *Realtime capability*:

  Moderately fast if implemented (a single HTTP round-trip search/browse call, typically low hundreds of ms), but not purely client-side/in-browser given the CORS and authentication constraints above, so real end-to-end latency in this project's architecture would include an added network hop to a backend proxy. Still fast enough to function as a near-real-time enrichment step rather than a hard blocker.


**Output**

- *Identification fields*:

  Rich structured fields via ytmusicapi: title, artist(s), album, duration, videoId, resultType (song/video/album), thumbnail, and further catalog detail via get_song()/get_watch_playlist(). This is one of the most complete canonical-identification field sets among the YouTube-native items surveyed, and notably can be used to validate/correct a rough title-parser guess against an authoritative catalog match.


**Licensing & Legal**

- *Tos restrictions*:

  This is one of the clearest Terms-of-Service-conflict items surveyed. YouTube Music has no public API, and ytmusicapi operates entirely outside the official YouTube API Services Terms of Service framework by emulating authenticated web-client requests using session cookies. Google's Developer Policies broadly prohibit accessing YouTube data through unauthorized/unofficial means, and using end-user or scraped session credentials to do so compounds the exposure, including potential account flagging/suspension risk for whichever account's cookies are used.

- *Risk tolerance note*:

  Explicitly one of the canonical 'official policy conflicts with widely-deployed unofficial practice' examples, alongside ytInitialData scraping and SongRec. ytmusicapi is broadly used in the open-source community (thousands of stars, many downstream projects) despite this conflict, and its own README self-identifies as 'not supported nor endorsed by Google.' A team shipping a commercial product (versus a personal script) should weigh that this represents materially higher legal/ToS exposure than the pure-metadata-read items, and it additionally requires live authenticated sessions rather than anonymous page reads.


**Pipeline Role**

- *Cascade position*:

  Enrichment/fallback — too heavy (authentication, backend proxy dependency, high breakage risk) to gate on. Best used as a verification/correction step after a cheap client-side guess (the title-normalizer heuristic) or as a fallback catalog search when other signals are inconclusive, given its strong structured-metadata payoff when it does work.

- *Failure mode*:

  Mixed. Authentication/breakage failures fail loudly or silently as an error state (no answer, relatively safe), but a wrong top-ranked search-result match — since no calibrated confidence score is exposed to threshold on — risks a confident-but-wrong identification being surfaced as if authoritative, which is a real visible-product-defect risk for a karaoke overlay unless the pipeline cross-checks the match against another signal.

- *Cost model at scale*:

  Free in the sense of no licensing fee for the open-source library itself, but real infrastructure cost if self-hosting a backend proxy, plus the ongoing operational cost/risk of maintaining valid, non-banned authentication credentials at scale — effectively an ongoing 'keep the scraper working' maintenance cost rather than a metered per-query price.


**Uncertain fields** (excluded above, listed for reference)

- classification_or_hitrate
- catalog_language_bias
- evaluation_dataset
- isrc_availability
- karaoke_specific_outputs
- geo_region_availability

---

### YouTube timedtext caption endpoint (/api/timedtext) and Data API v3 Captions resource

**Basic Info**

- *Name*: YouTube timedtext caption endpoint (/api/timedtext) and Data API v3 Captions resource
- *Type*:

  Metadata-resolver used as a weak classifier signal (captions as a zero-cost time-aligned lyrics fallback plus a heuristic music-vs-talk indicator)

- *Maintainer*:

  Google/YouTube. The /api/timedtext endpoint itself is undocumented/internal (it is the same URL YouTube's own web player calls to render on-screen captions, with no public spec). The officially documented Data API v3 captions.list/captions.download resource exists in parallel but requires the video owner's OAuth consent, making it unusable for arbitrary third-party videos.


**Technical Approach**

- *Method*:

  Metadata parsing/scraping via a plain HTTP GET to the internal timedtext endpoint, e.g. https://www.youtube.com/api/timedtext?v=VIDEO_ID&lang=en[&kind=asr]&fmt=json3, returning a time-aligned transcript (either uploader-provided manual captions or kind=asr auto-generated captions). Available caption tracks and their baseUrl must first be discovered by parsing captions.playerCaptionsTracklistRenderer.captionTracks out of the InnerTube player response / ytInitialPlayerResponse.

- *Required input*:

  Video URL/ID, plus the caption track's baseUrl obtained from the player response (not derivable from the video ID alone without that intermediate lookup).

- *Minimum clip length*:

  0s to fetch — it is a bulk transcript fetch, not a rolling/streaming classifier — but usable content only exists once YouTube has finished caption processing, which can lag upload by minutes to hours for ASR tracks.


**Accuracy & Reliability**

- *Pitch speed cover robustness*:

  Not directly applicable since this is not an audio classifier, but indirectly relevant: YouTube's ASR is speech-tuned and is widely reported to perform poorly on or skip singing/music-heavy audio entirely, which is precisely why caption absence is informative as a weak music signal in the first place.

- *Catalog language bias*:

  ASR auto-captions are limited to a bounded set of supported languages (strongest for English and a handful of major languages), and even within supported languages, ASR quality on sung lyrics is materially worse than on spoken dialogue. Uploader-provided manual captions (which occasionally do contain full lyrics, e.g. dedicated 'lyric video' uploads) are entirely optional and at uploader discretion, so usable lyric-caption coverage skews toward channels that specifically publish official lyric videos (disproportionately Western/major-label) and away from indie, non-major-language, or anime content unless that specific uploader chose to add them.

- *Confidence calibration*:

  No calibrated score is available; caption presence/absence and the kind=asr flag (ASR vs. manual) are binary/categorical signals, not a tunable probability.


**Integration Feasibility**

- *Api availability*:

  The internal /api/timedtext endpoint is free, keyless, and requires no quota (it is the exact URL the in-page player itself calls), but is entirely undocumented and unofficial. The officially documented Data API v3 captions endpoints require OAuth and only work for videos the authenticated account owns, making them impractical for this project's need to read captions on arbitrary third-party videos.

- *Chrome extension usability*:

  Directly reachable from a content script running on youtube.com pages (same-origin, or via the extension's own fetch with youtube.com host_permissions); no CORS blocking has been widely reported for this specific endpoint since it is designed to be called by the in-page player itself. Heavy per-user request volume, however, risks the same IP-based 429/blocking behavior documented for standalone scraping tools like youtube-transcript-api.

- *Audio access requirement*: None — pure text/JSON fetch, no raw audio decoding, no user gesture or tab-audio capture needed.
- *Client vs server*:

  Fully client-side feasible — the request goes directly from the user's browser to YouTube's own servers (which the user is already communicating with by viewing the page); no third-party server is involved unless a proxy/backend is deliberately introduced.

- *Bundle weight cold start*:

  Negligible bundle weight (a fetch call plus JSON parsing); first-fetch latency is a single network round trip, typically tens to low hundreds of ms, with no model to download.

- *Breakage risk*:

  Historically stable in practice — third-party writeups describe it as in continuous use since roughly 2014, and Google has not deprecated it since its own player depends on it — but as an undocumented surface it nominally carries the same breakage risk as any unofficial API, and is increasingly subject in 2025-2026 to bot-detection/PO-token countermeasures that have begun affecting related scraping tools such as youtube-transcript-api. No official support channel exists; fixes are patched informally by the open-source community maintaining transcript-fetching tools.


**Latency**

- *Realtime capability*:

  Yes for a single fetch-and-parse (one HTTP round trip, negligible compute), suitable for near-instant in-browser use once the caption track's baseUrl is known; discovering that baseUrl first (via the player response) adds one additional round trip.


**Output**

- *Identification fields*:

  Not an identification method by itself — it does not directly yield title/artist/album. It yields a raw time-aligned text transcript usable as (a) karaoke lyric text directly when captions happen to contain full song lyrics, (b) input to a downstream lyrics-matching step, or (c) a coarse heuristic signal feeding the music-vs-talk classification gate.

- *Isrc availability*: None — transcripts carry no rights-management identifiers of any kind.
- *Karaoke specific outputs*:

  Word/segment-level timing IS available — the fmt=json3/srv3 response formats provide per-segment (and often near-word-level) start times and durations, making this one of the few zero-cost sources in this survey offering genuinely time-aligned text. Most reliable when the caption track is a manually-authored official lyric-video caption; auto (ASR) captions on sung audio are comparatively low quality. No BPM, musical key, or vocal-activity data is provided.


**Licensing & Legal**

- *Risk tolerance note*:

  Widely used in practice by many open-source transcript tools (youtube-transcript-api has broad, long-standing adoption) despite being unofficial and despite Google's escalating anti-bot measures — a clear tolerated-but-unsanctioned pattern. The added wrinkle specific to a karaoke product is that lyrics text carries its own separate copyright regime (distinct from the sound recording itself), a consideration most generic transcript-scraping use cases (typically non-lyrical spoken content) do not have to weigh.


**Pipeline Role**

- *Cascade position*:

  Enrichment/fallback — cheap enough to attempt on every video, but output quality is too unreliable to gate on. Best used as (a) a weak prior feeding the music/non-music classifier alongside other signals, and (b) an opportunistic lyrics-timing fallback when a dedicated synced-lyrics source (e.g. LRCLIB) misses.

- *Failure mode*:

  Fails silently when no caption track exists (common for many music videos) or yields low-value ASR text for sung audio rather than a confidently wrong music/artist identification. The real visible-product risk arises only if low-trust ASR text were mistakenly surfaced to the user as if it were verified lyrics — the pipeline should treat ASR-sourced text as lower-trust than a dedicated lyrics source to avoid this.

- *Cost model at scale*:

  Free, with no documented per-query ceiling beyond the informal rate-limiting/IP-blocking risk under heavy request volume noted above.


**Uncertain fields** (excluded above, listed for reference)

- classification_or_hitrate
- evaluation_dataset
- tos_restrictions
- geo_region_availability

---

## Audio fingerprinting (identification)

### AcoustID + Chromaprint

**Basic Info**

- *Name*: AcoustID + Chromaprint
- *Type*:

  Identifier (open-source audio fingerprinting library + free/crowdsourced lookup API backed by MusicBrainz metadata)

- *Maintainer*:

  Chromaprint library: created by Lukas Lalinsky, open-source (LGPL) C library, GitHub org acoustid/chromaprint. AcoustID web service/database: AcoustID OU (non-profit-adjacent open project with a commercial licensing arm for high-volume use); closely tied to the MusicBrainz project/foundation


**Technical Approach**

- *Method*:

  Fingerprinting -- Chromaprint analyzes chroma (12 pitch-class) features of the audio, sampled 8 times/second, over roughly the first two minutes of a track, producing a compact (~2.5 KB) binary fingerprint; the AcoustID web service then looks this fingerprint up against a crowdsourced fingerprint database that is cross-linked to MusicBrainz recording metadata

- *Required input*:

  Raw audio (a local audio file, or a captured/decoded audio buffer) processed by the Chromaprint algorithm (via native fpcalc binary, bindings like pyacoustid, or a community JS/WASM port such as chromaprint.js); the AcoustID API call itself needs only the derived fingerprint text plus a duration value, not raw audio bytes

- *Minimum clip length*:

  Chromaprint is explicitly designed and tuned around near-full-track analysis (its own documentation notes that 'recordings that differ by more than seven seconds in length will always be given a different AcoustID, even if the shorter fingerprint is identical to a section of the longer one'), so short clips are a known weak point -- a documented community bug report (beetbox/pyacoustid issue #70) shows a 30-second clip of a well-known song returning zero results via lookup while the same song's full track matched successfully.


**Accuracy & Reliability**

- *Pitch speed cover robustness*:

  Chromaprint's own design philosophy is explicitly stated as trading precision/robustness for search performance ('Chromaprint is not a general purpose audio fingerprinting solution; it trades precision and robustness for search performance'), and its duration-matching behavior (see minimum_clip_length) makes it fragile against edited-length reuploads, sped-up/nightcore edits, and partial clips; no robustness claims for covers or live versions were found, and the design suggests weak robustness to any of these compared to commercial neural-fingerprinting competitors.


**Integration Feasibility**

- *Api availability*:

  Free for non-commercial/open-source use, rate-limited to 3 requests/second (no request-count cap mentioned, just a rate ceiling); commercial use requires a paid plan (e.g., Small plan ~EUR50/month for 1M searches with no rate limiting, Medium plan ~EUR100/month for 15M searches with no rate limiting) via AcoustID's commercial arm. Requires a free application API key ('client' parameter) registered at acoustid.org; fingerprint *submission* (contributing new fingerprints) additionally requires a separate user API key, but lookup alone only needs the app key.

- *Audio access requirement*:

  Requires raw audio (ideally close to the full track length, given the duration-matching behavior described above) rather than a short snippet; in a browser extension this means capturing substantial tab audio over time (e.g., via chrome.tabCapture with a user gesture) rather than a quick few-second sample, which is a meaningfully heavier audio-access requirement than fingerprinters designed for short clips, and would still fail on DRM-protected or otherwise inaccessible audio streams.

- *Client vs server*:

  Because the lookup API itself is CORS-open and requires no secret signing, the derived fingerprint (not raw audio) can be sent directly from the user's browser to AcoustID's servers without a mandatory first-party backend -- a comparatively strong privacy/architecture story, assuming the fingerprint-generation step itself can be done client-side in WASM/JS.

- *Breakage risk*:

  Low breakage risk for the API/protocol itself since it is a stable, long-running open project (Chromaprint has been MusicBrainz's sole supported fingerprint format since 2013) with clear documented behavior -- the main practical risk is not sudden breakage but the pre-existing accuracy/short-clip limitation (documented, not a regression) and reliance on an unofficial, possibly under-maintained JS/WASM port for in-browser fingerprint generation.


**Output**

- *Identification fields*:

  Returns an AcoustID (fingerprint-database ID) plus a match 'score', and -- when the 'meta' parameter requests recordings/releases/releasegroups data -- linked MusicBrainz recording title, artist name(s), artist ID(s), and release information. No native confidence percentage beyond the raw score field.


**Licensing & Legal**

- *Risk tolerance note*:

  Lower legal risk than reverse-engineered options (SongRec) since AcoustID is an open, self-declared free-for-non-commercial-use API with published terms and an above-board commercial upgrade path -- the main compliance task is simply confirming whether the karaoke extension's usage pattern (and any monetization) requires moving from the free tier to a paid AcoustID Business plan.


**Pipeline Role**

- *Cascade position*:

  Poorly suited as a cheap, high-precision always-on gate given its short-clip weakness; better suited as a low-cost fallback/enrichment step when a longer audio sample is already available (e.g., after several seconds/minutes of accumulated playback), or as a secondary cross-check against another fingerprinter's result via its free MusicBrainz-linked metadata.

- *Failure mode*:

  Fails silently with an empty results array on no-match (as demonstrated by the documented short-clip GitHub issue) rather than hallucinating a wrong title/artist, since it is genuine database lookup against submitted fingerprints -- low risk of a confidently-wrong karaoke overlay, but correspondingly higher risk of simply returning nothing for short/edited clips, which could look like a broader 'classification failure' to end users even when the audio genuinely is a real, catalogued song.

- *Cost model at scale*:

  Free tier's 3 requests/second rate cap is generous for a single extension's realistic per-session load (a handful of identification calls per user session would stay well within that ceiling in aggregate across a small-to-medium user base, since it's a rate limit not a total-count quota) -- but crossing into 'commercial use' per AcoustID's ToS would require the paid Small (~EUR50/month for 1M searches) or Medium (~EUR100/month for 15M searches) plan, which is inexpensive relative to commercial competitors at comparable volume.


**Uncertain fields** (excluded above, listed for reference)

- catalog_language_bias
- evaluation_dataset
- confidence_calibration
- chrome_extension_usability
- bundle_weight_cold_start
- realtime_capability
- isrc_availability
- karaoke_specific_outputs
- tos_restrictions
- geo_region_availability

---

### ACRCloud

**Basic Info**

- *Name*: ACRCloud
- *Type*:

  Identifier (commercial audio fingerprinting API, also offers cover-song and broadcast-monitoring add-ons)

- *Maintainer*: ACRCloud Corp (commercial vendor, HQ China/Germany, data centers in multiple global regions)

**Technical Approach**

- *Method*:

  Server-side audio fingerprinting (acoustic fingerprint matched against a reference database); also offers a separate 'Cover Song Identification' product using different matching logic, and file/URL scanning tools (including direct YouTube/TikTok/Instagram URL ingestion) that download and fingerprint media server-side

- *Required input*:

  Raw audio/video bytes (file upload, base64, or streamed buffer) or a source URL (YouTube/TikTok/Instagram/Facebook/Twitter) that ACRCloud's own scanning tools fetch server-side; NOT raw page HTML or title text

- *Minimum clip length*:

  ~10 seconds per single-request SDK recognition attempt (docs: 'SDKs will use 10 seconds of an audio clip for the recognition of a single request'); shorter samples reduce match probability


**Integration Feasibility**

- *Chrome extension usability*:

  The Identification API endpoint itself returns 'Access-Control-Allow-Origin: *' (CORS is open, verified directly), but every request must be HMAC-SHA1 signed using a secret key (signature = base64(hmac_sha1(access_secret, 'POST\n/v1/identify\n{access_key}\n{datatype}\n1\n{timestamp}'))). Embedding access_secret inside a distributed Chrome extension exposes it to extraction/abuse, so a backend proxy that holds the secret and signs requests is the practical requirement despite open CORS.

- *Audio access requirement*:

  Requires raw audio bytes (a real audio/video sample), not just metadata. In a Chrome extension context this means capturing tab audio (e.g., chrome.tabCapture, which needs a user gesture) or downloading the source video, which will fail on DRM-protected or age-restricted/gated YouTube content that cannot be captured or fetched normally.

- *Client vs server*:

  Because of the HMAC secret, the practical architecture sends the audio sample (or its derived fingerprint) from the user's machine to a developer-controlled backend, which then calls ACRCloud -- so raw audio leaves the client machine to at least one intermediary server, with privacy/Chrome-Web-Store-disclosure implications for a karaoke extension.

- *Breakage risk*:

  Official, actively maintained commercial API with SLA-backed uptime (not a scraped/unofficial surface), so breakage risk from ACRCloud's own infrastructure is low; the higher risk is business risk (pricing changes, trial expiry, account suspension) rather than technical breakage.


**Output**

- *Identification fields*:

  Returns title, artist(s), album, release date, label, and a numeric match score; also provides external IDs/links to Spotify, Apple Music, Deezer, YouTube, and standard industry identifiers ISRC and UPC/ISWC when available via the linked Music Metadata product.

- *Isrc availability*:

  Yes -- ACRCloud explicitly advertises ISRC (and ISWC/UPC) as part of its identification/metadata response, making it usable as a join key for downstream lookups.


**Licensing & Legal**

- *Risk tolerance note*:

  Because ACRCloud is an official, contractually-licensed commercial vendor (not a scraped/reverse-engineered surface like ytInitialData or SongRec), it carries materially lower legal/ToS risk than the unofficial options in this comparison set -- the trade-off is cost and secret-key handling complexity rather than legal exposure.


**Pipeline Role**

- *Cascade position*:

  Best suited as an enrichment or fallback step (not a cheap always-on gate) given its per-request cost and signing overhead; would typically run only after a cheaper music-vs-non-music classifier has already gated out non-music content.

- *Failure mode*:

  Fails relatively silently (no-match / empty result with a low score) rather than confidently hallucinating a wrong title/artist, because it is fingerprint-based matching against a real reference database rather than generative guessing -- reduces risk of a visibly wrong karaoke overlay, though false-positive risk still exists for very similar tracks/remixes.


**Uncertain fields** (excluded above, listed for reference)

- classification_or_hitrate
- pitch_speed_cover_robustness
- catalog_language_bias
- evaluation_dataset
- confidence_calibration
- api_availability
- bundle_weight_cold_start
- realtime_capability
- karaoke_specific_outputs
- tos_restrictions
- cost_model_at_scale
- geo_region_availability

---

### AudD

**Basic Info**

- *Name*: AudD
- *Type*: Identifier (commercial audio fingerprinting API with a free tier)
- *Maintainer*:

  AudD, LLC (commercial vendor; also publishes an official Chrome extension and open-source SDKs/tools under github.com/AudDMusic)


**Technical Approach**

- *Method*:

  Server-side neural-network-based audio fingerprinting matched against a ~160M-track reference database; enterprise endpoint additionally chunk-scans long audio/video files in 12-second windows to find every song within them

- *Required input*:

  Raw audio bytes via HTTP URL, multipart file upload, or base64-encoded audio in the 'audio' parameter (standard endpoint, 10MB file-size cap); a special stream-monitoring mode also accepts a live stream/YouTube-stream identifier in the form 'youtube:<video_id>' for continuous monitoring via webhook/long-polling

- *Minimum clip length*:

  Standard endpoint analyzes up to ~12 seconds of audio per request; no hard published minimum, but very short clips can trigger a 'file too small to fingerprint' error


**Integration Feasibility**

- *Api availability*:

  Free tier: 300 free requests on signup, no credit card required. Pay-as-you-go: $5 per 1,000 requests, with volume discounts down to $2 per 1,000 requests at higher tiers (e.g., 100k/month for $450, 200k/month for $800, 500k/month for $1,800). Stream monitoring priced separately (~$45/stream/month against AudD's own database, ~$25/month against a customer-provided catalog). Simple bearer-token (api_token) authentication -- no HMAC signing required.

- *Chrome extension usability*:

  Confirmed directly usable from a Chrome extension: AudD publishes and maintains an official production Chrome Web Store extension (github.com/AudDMusic/chrome-extension, Manifest V3, current example version 3.1.4) that captures tab audio client-side via the 'tabCapture' permission and calls https://api.audd.io/ directly, declared in host_permissions -- no backend proxy required for the core recognition call. The identify endpoint itself was directly verified to return 'Access-Control-Allow-Origin: *'.

- *Audio access requirement*:

  Requires raw audio; in the official extension this is obtained via chrome.tabCapture (which requires user-invoked activation, e.g., clicking the extension's action icon) or by supplying a media URL. It would fail to capture audio from DRM-protected playback paths and cannot recognize muted/blocked tabs; age-restricted YouTube videos should still work as long as tab audio is actually playing.

- *Client vs server*:

  Because the API token can be used directly from the client (no secret-signing scheme), audio (or a URL/identifier referencing it) can be sent straight from the user's browser to AudD's servers, without a mandatory first-party backend intermediary -- simpler privacy story but also means the API token is exposed in the shipped extension code, enabling potential token abuse/quota theft unless mitigated (e.g., per-user tokens, rate-limiting, or a lightweight proxy).

- *Bundle weight cold start*:

  No ML model ships inside the extension; recognition is entirely server-side, so bundle weight is minimal (just the extension's own JS/UI code). Vendor states standard-endpoint response time is 'under 2 seconds', implying low cold-start overhead beyond the network round-trip of uploading a short audio clip.

- *Breakage risk*:

  Official, actively maintained commercial API with an actual shipping Chrome extension as a reference implementation (regularly updated, e.g., manifest v3 migration already done) -- low technical breakage risk compared to unofficial/reverse-engineered surfaces; primary risk is pricing/quota changes rather than the API disappearing.


**Latency**

- *Realtime capability*:

  Vendor-stated standard-endpoint response time of 'under 2 seconds' makes it feasible for in-browser, near-instant recognition once a short audio sample has been captured and uploaded.


**Licensing & Legal**

- *Risk tolerance note*:

  Because AudD is an official, contractually-licensed commercial vendor with its own production Chrome extension as precedent, it carries materially lower ToS/legal risk than reverse-engineered options like SongRec; residual risk is around exposing the API token client-side leading to quota abuse rather than legal exposure to the developer.


**Pipeline Role**

- *Cascade position*:

  Well suited as either a cheap-ish enrichment step or even a primary identification call given its low per-request cost ($5/1,000 = $0.005/request) and sub-2-second latency; still likely gated behind a lightweight music-vs-non-music classifier to avoid spending paid quota identifying non-music content.

- *Failure mode*:

  Fails relatively silently with an empty/no-match result rather than confidently hallucinating, since it is fingerprint-based matching against a real catalog rather than generative guessing -- lowers risk of a visibly wrong karaoke overlay, though close-variant tracks (same song, different official remix) could still produce a technically-correct-but-not-exact match.

- *Cost model at scale*:

  At $5 per 1,000 requests (or as low as $2/1,000 at high volume), a free consumer extension issuing even one identification call per user session could scale into real recurring cost quickly beyond the 300 free trial requests; e.g., 10,000 sessions/month at 1 call each would cost roughly $50/month at standard pricing, and dedicated stream-monitoring is priced per-stream/month rather than per-call.


**Uncertain fields** (excluded above, listed for reference)

- classification_or_hitrate
- pitch_speed_cover_robustness
- catalog_language_bias
- evaluation_dataset
- confidence_calibration
- identification_fields
- isrc_availability
- karaoke_specific_outputs
- tos_restrictions
- geo_region_availability

---

### Gracenote (Nielsen)

**Basic Info**

- *Name*: Gracenote (Nielsen)
- *Type*:

  Commercial audio fingerprinting/identification service plus large-scale entertainment metadata resolver; industry incumbent

- *Maintainer*:

  Gracenote, a Nielsen company (Nielsen completed its $560M acquisition of Gracenote from Tribune Media in February 2017); originated from the earlier CDDB (CD Database) project from the 1990s


**Technical Approach**

- *Method*:

  Audio fingerprinting via two product modes — MusicID-Stream (fingerprints a snippet that can come from anywhere within a track, suited to streamed/ambient/microphone audio) and MusicID-File (fingerprints a full audio file) — combined with a very large proprietary metadata database (100M+ music tracks claimed) accessed through the GNSDK (a native C/C++ client library) or the Music Web API

- *Required input*:

  Raw audio is first processed on-device into a Gracenote-proprietary fingerprint using the GNSDK client library, then that fingerprint is submitted as an XML document (entity-encoded) to Gracenote's Web Services for matching — raw audio itself is never sent directly, only the derived fingerprint

- *Minimum clip length*:

  Approximately 6.5 seconds of audio is required to generate a usable MusicID-Stream fingerprint for most use cases, per Gracenote's own developer documentation


**Accuracy & Reliability**

- *Evaluation dataset*:

  Not published — proprietary/private catalog and matching pipeline, no academic or vendor-neutral benchmark found


**Integration Feasibility**

- *Api availability*:

  Requires developer registration to obtain a Client ID/API key. The standard developer license is explicitly for non-commercial use only (the developer must not derive revenue from the application/service using it); a limited free 'Sample' plan with roughly 30-day trial access exists for evaluation. Full commercial use requires a negotiated sales contract — there is no public rate card or commercial self-serve signup

- *Chrome extension usability*:

  Fingerprint generation depends on the GNSDK, a native C/C++ library (not a JavaScript/WASM library), so it cannot run directly in-browser. Integration requires a native application, mobile SDK, or backend service to perform fingerprint generation before calling Gracenote's Web Services — a backend proxy (or native component) is required, making direct Chrome extension integration non-trivial

- *Audio access requirement*:

  Requires raw audio capture plus on-device/on-server fingerprint generation via the native GNSDK before any network call can be made — this cannot be accomplished in pure client-side JavaScript, reinforcing the need for a native or server-side component

- *Client vs server*:

  The GNSDK-derived fingerprint (not raw audio) is transmitted to Gracenote's cloud service for matching — this is a third-party data flow (data leaves the user's machine to a Nielsen-owned service), requiring privacy disclosure; no offline/fully-local operation is possible for the matching step itself

- *Bundle weight cold start*:

  The GNSDK is a native, platform-specific binary library (separate builds needed per OS/architecture — desktop, mobile, embedded/automotive) rather than a lightweight installable JS package, making integration considerably heavier than a typical web SDK; specific size/latency figures are not published

- *Breakage risk*:

  Low from a technical-breakage standpoint — this is an official, contractually-supported product from a large, established enterprise vendor (Nielsen) with decades of history (via its CDDB origins), not a reverse-engineered or scraped surface. The main risk is business/commercial (contract terms, pricing, or access changes) rather than technical instability


**Latency**

- *Realtime capability*:

  Designed for real-time use cases such as automotive infotainment (radio station/track ID in connected cars) and broadcast recognition, implying sub-few-second recognition performance typical of mature commercial fingerprint-ID products


**Output**

- *Identification fields*:

  Rich commercial metadata: track title, artist, album, genre, album artwork, track length, and lyrics are all cited as available fields; ISRC is available at the track level (returned as an XID element, e.g. `<XID DATASOURCE="gracenote" DATATYPE="isrc">...`) when the LINK option is requested, though not every track in the database has an ISRC populated

- *Isrc availability*:

  Yes — ISRC is exposed as an XID data element in track-level API responses (via the LINK parameter), sourced through DDEX metadata feeds, though coverage is not guaranteed for every track


**Licensing & Legal**

- *Tos restrictions*:

  The standard developer license strictly prohibits commercial/revenue-generating use; any production or monetized deployment requires a separately negotiated commercial contract with Nielsen/Gracenote sales, which likely (though not publicly confirmed) includes restrictions on reselling recognition results and may involve region-specific terms tied to underlying label/publisher licensing agreements

- *Risk tolerance note*:

  Not applicable in the same way as scraping-based tools — Gracenote is a fully commercial, contract-gated service with no notable pattern of widespread unofficial/reverse-engineered community usage; the main practical tension is between the free non-commercial developer tier (unusable for a shipped product generating any revenue) and the requirement to negotiate a paid commercial contract to legitimately ship a real product


**Pipeline Role**

- *Cascade position*:

  Poorly suited as a low-cost, always-on gate for a lightweight/free Chrome extension given the native SDK integration burden and non-commercial-only free tier; more appropriate as an enrichment/fallback tier within a well-funded, commercial-grade deployment (its natural fit is automotive/CE and broadcast, per its market position) rather than a hobbyist or freemium browser extension

- *Failure mode*:

  Fails silently with no match/result when a track is unrecognized, consistent with standard mature commercial fingerprint-ID product behavior; no public reports found of systematically confident-but-wrong results


**Uncertain fields** (excluded above, listed for reference)

- classification_or_hitrate
- pitch_speed_cover_robustness
- catalog_language_bias
- confidence_calibration
- karaoke_specific_outputs
- cost_model_at_scale
- geo_region_availability

---

### Olaf (Overly Lightweight Acoustic Fingerprinting)

**Basic Info**

- *Name*: Olaf (Overly Lightweight Acoustic Fingerprinting)
- *Type*:

  Open-source audio fingerprinting identifier (self-hosted, compiles to WebAssembly for in-browser client-side use)

- *Maintainer*:

  Joren Six (independent researcher, affiliated with IPEM, Ghent University) — single-maintainer open-source project


**Technical Approach**

- *Method*:

  Landmark-based acoustic fingerprinting (combinatorial hashing of spectral peak pairs, in the tradition of Wang's Shazam-style algorithm), implemented as a portable C library/application

- *Required input*:

  Raw PCM audio, captured via Web Audio API in-browser (WASM build) or read from audio files (CLI build); requires the app to have already extracted and stored fingerprints for a self-built reference catalog


**Accuracy & Reliability**

- *Catalog language bias*:

  None inherent — Olaf ships no catalog; coverage entirely depends on whatever reference tracks the developer indexes themselves, so language/genre bias is fully self-determined

- *Evaluation dataset*:

  Author's own scale test using the FMA (Free Music Archive) full dataset; no standardized academic benchmark (e.g., GTZAN, MagnaTagATune) evaluation reported

- *Confidence calibration*:

  Match decisions are based on a raw matching-hash-count/consistency heuristic (via Jenkins hash matching), not an explicitly calibrated probability score; thresholds can be tuned empirically but no documented calibration methodology


**Integration Feasibility**

- *Api availability*:

  Free and fully open-source, AGPL-3.0 licensed; no API keys, no rate limits, entirely self-hosted — but AGPL is copyleft, which has implications for a closed-source Chrome extension (see tos_restrictions)

- *Chrome extension usability*:

  Compiles via Emscripten directly to WebAssembly and is designed to run in-browser combined with the Web Audio API, so it can execute fully client-side with no CORS/backend-proxy issue for the fingerprinting computation itself — however the reference catalog (which can reach many GB for a large song set) must be hosted/queried somewhere reachable by the extension, reintroducing a server dependency at scale

- *Audio access requirement*:

  Requires raw audio access via getUserMedia (microphone) or tab-audio capture; microphone access requires an explicit user gesture and permission grant; tab-audio capture in a Chrome extension has its own MV3 constraints

- *Client vs server*:

  Can be architected fully client-side — audio and fingerprinting stay on-device if a small catalog is bundled locally; for realistic-size catalogs the fingerprint database is more practically hosted on a self-controlled server the developer operates, meaning audio-derived fingerprints (not raw audio) would be queried against it. Either way, no third-party vendor ever sees the data — strong privacy posture compared to commercial cloud APIs

- *Breakage risk*:

  Single-maintainer academic/research project with a small community; used in some embedded (ESP32) and research contexts giving it real-world mileage, but long-term maintenance depends on one individual continuing the project — moderate abandonment risk over a multi-year horizon


**Latency**

- *Realtime capability*:

  Yes for the matching step — benchmarks show query throughput of roughly 80x real-time against a 100,000-track database on capable hardware; in-browser WASM performance for smaller catalogs should comfortably support near-instant client-side matching


**Output**

- *Identification fields*:

  Returns only an internal match identifier (via Jenkins hash) plus timing offset — output available as CSV/JSON/human-readable text, but NOT title/artist/album/ISRC unless the developer separately maintains and joins their own metadata table keyed to those catalog IDs

- *Isrc availability*:

  No — purely a self-built catalog with no bundled metadata layer; ISRC would have to be sourced and joined externally

- *Karaoke specific outputs*:

  None built in — no BPM, musical key, vocal/instrumental activity, or word-level lyric timing; would require pairing with separate audio-analysis libraries


**Licensing & Legal**

- *Tos restrictions*:

  AGPL-3.0 license means any modified version used to provide a network service (which a Chrome extension backend effectively would be) must have its complete corresponding source made available to users — a significant consideration for a closed-source product. The author also explicitly flags patent risk: 'be aware of the patents US7627477 B2 and US6990453 and perhaps others' covering landmark-fingerprinting techniques used in the algorithm, and advises consulting an IP specialist

- *Risk tolerance note*:

  Separate from the AGPL/patent issue above, building a reference catalog by fingerprinting copyrighted YouTube audio (to enable identification) is itself a copyright gray area outside of Olaf's own license terms — this is a broader legal question shared by any self-built-catalog fingerprinting approach (Olaf, Panako, audfprint, Echoprint) and not something the tool itself resolves


**Pipeline Role**

- *Cascade position*:

  Could theoretically serve as a zero-marginal-cost gate given free WASM execution, but the substantial upfront engineering required to build, host, and maintain a usable reference catalog (comparable in effort to building a mini-Shazam) makes it more realistic as a longer-term investment / fallback than an immediate cheap gate

- *Failure mode*:

  Fails silently with no match when hash-consistency threshold isn't met — low risk of a confident-but-wrong answer if thresholds are tuned conservatively, consistent with hash-count-based fingerprinting systems generally

- *Cost model at scale*:

  Zero per-query licensing/API cost since it's self-hosted open source; the real cost is infrastructure — storage and compute to build and serve the reference fingerprint database, which scales with catalog size (15GB for 100k tracks) and is a hidden but real ongoing expense

- *Geo region availability*: None — fully self-hosted with no geo-gating imposed by the tool itself

**Uncertain fields** (excluded above, listed for reference)

- minimum_clip_length
- classification_or_hitrate
- pitch_speed_cover_robustness
- bundle_weight_cold_start

---

### Panako

**Basic Info**

- *Name*: Panako
- *Type*:

  Open-source audio fingerprinting identifier, specialized for robustness to time-scale and pitch modification

- *Maintainer*:

  Joren Six (independent researcher, IPEM, Ghent University) — same author as Olaf; software published/peer-reviewed via JOSS (Journal of Open Source Software)


**Technical Approach**

- *Method*:

  Three fingerprinting algorithms are implemented: a baseline duplicate-detection algorithm and two spectral-peak-pair algorithms; the flagship 'Panako algorithm' encodes constellations of spectral peaks in a way that is specifically designed to remain matchable under time-scale (speed) and pitch modification, unlike classic Shazam-style landmark hashing. Runs on the JVM (Java library/CLI, built with Gradle)

- *Required input*:

  Raw audio files (MP3, OGG, FLAC, WAV) fed to a Java command-line application (`panako store` to index, `panako query` to match); requires Java JDK 11+


**Accuracy & Reliability**

- *Classification or hitrate*:

  Author-reported evaluation (80/20 indexed/held-out split, random 10-20s query fragments with induced distortions) shows reliable identification with 100% specificity (no false positives against the held-out non-matching 20%) across time-stretch, pitch-shift, speed change, GSM compression, band-pass filtering, and other audio effects; reference database sizes tested up to tens of thousands of tracks (~30,000 songs cited in the JOSS paper) and FMA-scale sets in the Panako 2.0 update

- *Catalog language bias*:

  None inherent — no built-in catalog; coverage is entirely determined by whatever the developer chooses to index into their own reference database

- *Evaluation dataset*:

  Author's own custom evaluation harness (an indexed folder of audio split 80/20, with randomly generated and algorithmically modified 10-20s query fragments) rather than a standardized public benchmark like GTZAN or MagnaTagATune

- *Confidence calibration*:

  Returns a 'percentage of seconds for which fingerprints match' plus estimated time/pitch modification percentages — a semi-quantitative match-strength score that can be thresholded, but it is not a formally calibrated probability


**Integration Feasibility**

- *Api availability*:

  Free and fully open-source, AGPL-3.0 licensed; no API keys or rate limits; entirely self-hosted (Docker image available for deployment)

- *Chrome extension usability*:

  Runs on the JVM as a Java application — there is no WebAssembly/browser-native build path documented (unlike Olaf). It must run as a standalone server/backend process (Docker-deployable), meaning a Chrome extension would need to capture audio and transmit it over the network to a self-hosted Panako backend for matching — a backend proxy is required

- *Audio access requirement*:

  Requires raw audio capture (microphone or tab-audio) on the client, which must then be transmitted to the backend Java service for fingerprint extraction and matching; microphone access needs an explicit user gesture

- *Client vs server*:

  Server-side processing required; audio leaves the browser/client and is sent to whatever server runs Panako — since this would be the developer's own self-hosted infrastructure rather than a third-party vendor, privacy posture is controllable but still not purely client-side/offline the way Olaf's WASM build can be

- *Bundle weight cold start*:

  Not applicable as a browser bundle since it runs server-side; JVM startup plus reference-database load constitute the 'cold start' on the server. Steady-state processing throughput is high — the author reports roughly 47-81 seconds of audio processed per second of real time on commodity hardware

- *Breakage risk*:

  Single-maintainer academic project (same author/ecosystem as Olaf), published via JOSS giving it a degree of peer-reviewed credibility, but a small community and modest ongoing development pace — moderate long-term maintenance risk typical of individually-maintained research software


**Latency**

- *Realtime capability*:

  Server-side matching is comfortably faster than real-time (47-81x reported), so the fingerprinting/matching step itself is not the bottleneck; overall end-to-end 'real-time' feel for a browser extension depends on network round-trip to the self-hosted backend, since there is no in-browser execution path


**Output**

- *Identification fields*:

  Query output includes match path/filename, timing offsets, a match score, and estimated pitch/time modification percentage — these are references to whatever was indexed (e.g., a filename), not title/artist/album/ISRC metadata, unless the developer separately maintains and joins their own metadata table

- *Isrc availability*:

  No — self-built catalog only, no bundled metadata layer; ISRC would need to be sourced and joined externally

- *Karaoke specific outputs*:

  None built in directly, though the estimated time/pitch-modification percentage output could hint that a track has been sped up or pitch-shifted; no BPM, musical key, vocal/instrumental separation, or word-level lyric timing is produced


**Licensing & Legal**

- *Risk tolerance note*:

  Building a reference catalog from copyrighted YouTube audio (necessary to make Panako useful for this use case) raises copyright questions independent of Panako's own open-source license — the same broader legal gray area shared by Olaf, audfprint, and Echoprint when self-hosting a fingerprint database of commercial music


**Pipeline Role**

- *Cascade position*:

  Best suited as a specialized fallback/enrichment tier specifically for cases where a primary Chromaprint-based matcher fails due to speed/pitch-shifted (nightcore-style) reuploads — not a good fit as a cheap always-on gate given the JVM backend requirement and engineering overhead of building and hosting a catalog

- *Failure mode*:

  Fails silently with no match when match-percentage falls below threshold; the author's reported 100% specificity in testing suggests a low risk of confident-but-wrong matches when the system is configured as tested

- *Cost model at scale*:

  Zero per-query licensing cost (open source, self-hosted), but requires ongoing infrastructure spend to run a JVM server and store/maintain the reference fingerprint database, scaling with catalog size and query volume

- *Geo region availability*: None — fully self-hosted, no geo-gating imposed by the tool itself

**Uncertain fields** (excluded above, listed for reference)

- minimum_clip_length
- pitch_speed_cover_robustness
- tos_restrictions

---

### NeuralFP / audfprint / Echoprint

**Basic Info**

- *Name*: NeuralFP / audfprint / Echoprint
- *Type*:

  Three separate research-grade / open-source fingerprinting identifiers, spanning classic hash-based (audfprint, Echoprint) and learned-embedding (NeuralFP) approaches — grouped here as a comparison set rather than one product

- *Maintainer*:

  audfprint: Dan Ellis (Columbia LabROSA), community-maintained on GitHub (dpwe/audfprint). Echoprint: originally The Echo Nest, transferred to Spotify after its 2014 acquisition; the API was shut down May 31, 2016 and the GitHub repos (spotify/echoprint-server, spotify/echoprint-codegen) are now public archives with no active maintenance. NeuralFP: Sungkyun Chang et al. (Seoul National University / mimbres on GitHub), official implementation of the ICASSP 2021 paper 'Neural Audio Fingerprint for High-Specific Audio Retrieval Based on Contrastive Learning'


**Technical Approach**

- *Method*:

  audfprint = classic landmark/combinatorial-hash fingerprinting (Wang/Shazam-style), implemented in Python using librosa. Echoprint = classic landmark-hash fingerprinting with a C++ codegen library (MIT) and an Apache-2.0-licensed matching server. NeuralFP = deep-learning approach: a CNN encoder trained with contrastive learning produces 128-dimensional embeddings per short audio segment, indexed and searched via approximate/exact nearest-neighbor search rather than discrete hash matching

- *Required input*:

  audfprint: audio files decoded via ffmpeg. Echoprint: raw PCM processed by the C++ codegen library into 'Echoprint codes.' NeuralFP: raw waveform converted to mel-spectrogram input for a CNN, requiring a GPU-backed inference pipeline for practical throughput

- *Minimum clip length*:

  audfprint/Echoprint: no strict documented minimum, but landmark-hash approaches of this style typically need several seconds (~5-10s) to accumulate enough consistent matching hashes for a confident decision. NeuralFP: explicitly benchmarked across query lengths from 1s up to 10s (see accuracy figures below), so it can attempt matches on clips as short as 1 second, with accuracy improving significantly as length increases


**Accuracy & Reliability**

- *Classification or hitrate*:

  NeuralFP (ICASSP 2021 paper, 100K-track reference database): exact top-1 hit-rate of 61.0% at 1s query, 82.2% at 2s, 87.1% at 3s, 91.8% at 5s, 93.1% at 6s, and 95.2% at 10s; near-match (within ±1 index / ±500ms) rates are slightly higher (67.1% to 95.5% over the same range). audfprint/Echoprint: no formal published hit-rate benchmark; audfprint's own docs describe a heuristic rule of thumb that '5-6 consistently-timed matching hashes indicate a true match,' with random chance producing fewer than 1% temporally-consistent false hash matches

- *Catalog language bias*:

  All three are self-built-catalog systems with no bundled commercial catalog, so there is no inherent language/genre bias from the tools themselves. NeuralFP's published research dataset is built from the Free Music Archive (FMA), an internet-sourced, indie/Creative-Commons-leaning, Western-skewing corpus — this affects only the published research benchmark, not what a developer could index if self-hosting

- *Evaluation dataset*:

  audfprint: no formal published benchmark. Echoprint: originally evaluated against The Echo Nest's internal multi-million-track commercial catalog prior to the 2016 shutdown, not independently reproducible today. NeuralFP: custom 'Neural Audio Fingerprint Dataset' built from FMA — 10,000 training songs (30s clips), 500 validation songs, 500 test songs, plus a 100,000-track full-length database for large-scale retrieval testing; dataset available in an 11.2GB 'mini' version and a 443GB 'full' version

- *Confidence calibration*:

  audfprint/Echoprint use a raw matching-hash-count threshold heuristic rather than a calibrated probability. NeuralFP produces a similarity/distance score (cosine similarity or L2 distance) from nearest-neighbor search that can be empirically thresholded, but is not documented as a formally calibrated confidence score


**Integration Feasibility**

- *Api availability*:

  All three are free, open-source, self-hosted, with no API keys or rate limits. audfprint: MIT license. Echoprint: MIT (codegen) + Apache 2.0 (server), but the original hosted Echo Nest API service is permanently shut down — only self-hosting the old open-source code remains possible. NeuralFP: MIT license, distributed as research code (training pipeline + Docker support) rather than a packaged service

- *Chrome extension usability*:

  None of the three compile to WebAssembly or run natively in-browser (unlike Olaf) — audfprint requires a Python runtime, Echoprint requires its C++ codegen library/server, and NeuralFP requires a Python/TensorFlow (or similar deep-learning framework) GPU-backed inference service. A backend proxy is required for all three in any Chrome extension architecture

- *Audio access requirement*:

  All three require raw audio capture on the client (microphone or tab-audio) which must then be transmitted to a backend server for fingerprint/embedding extraction and matching; microphone access requires an explicit user gesture

- *Client vs server*:

  Server-side processing required for all three; audio (or audio-derived data) leaves the browser to reach whichever backend the developer stands up. Since none of these are third-party hosted commercial services (Echoprint's original hosted API is dead), any deployment would be against infrastructure the developer controls themselves, which is better for privacy than a commercial cloud API but still not purely client-side/offline

- *Bundle weight cold start*:

  Not applicable as an in-browser bundle since all three run server-side. audfprint is lightweight (Python + librosa). Echoprint's C++ codegen is lightweight but built on a roughly 15-year-old, largely unmaintained codebase, raising build/toolchain friction on modern systems. NeuralFP is the heaviest: it needs an NVIDIA GPU with CUDA 10+ for practical performance, and its published datasets range from 11.2GB (mini) to 443GB (full) — inference-only deployment with a precomputed embedding index would be substantially lighter than the full research/training setup

- *Breakage risk*:

  Echoprint: HIGH — officially archived and unmaintained since the Spotify acquisition, hosted API shut down in 2016, and the open-source code has stale, decade-plus-old dependencies. audfprint: moderate — a single-maintainer academic tool with sporadic updates and around 34 open GitHub issues at time of research, no formal support commitment. NeuralFP: research-paper reference code (not a maintained production library) — the surrounding research area is active (multiple 2024-2025 follow-up papers/repos such as PFANN, GraFPrint, neural-music-fp), but no single implementation is positioned as a stable, production-supported package


**Output**

- *Identification fields*:

  All three fundamentally return catalog/track identifiers and match offsets/timestamps from whatever reference set was indexed — none natively return title/artist/album/ISRC metadata. Echoprint historically resolved IDs to rich metadata via The Echo Nest's separate resolver service, which no longer exists; a modern deployment of any of the three would require the developer to maintain and join their own external metadata table

- *Isrc availability*:

  No — none of the three provide ISRC natively; it would need to be sourced and joined from a separate metadata layer maintained by the developer

- *Karaoke specific outputs*:

  None of the three produce BPM, musical key, vocal/instrumental activity, or word-level lyric timing natively — all would need to be paired with separate audio-analysis tooling


**Licensing & Legal**

- *Tos restrictions*:

  All three use permissive licenses (MIT for audfprint and NeuralFP; MIT/Apache-2.0 for Echoprint) with no AGPL-style copyleft obligation, which is more favorable than Olaf/Panako for use inside a closed-source Chrome extension. That said, the same broader issue applies to all self-built-catalog fingerprinters: fingerprinting copyrighted YouTube audio to build a reference database sits outside any of these tools' own license terms and raises separate copyright questions

- *Risk tolerance note*:

  Echoprint's official hosted API is permanently dead — anyone wanting to use it today must self-host the abandoned open-source server, which is a legacy/unsupported-software risk rather than a live vendor relationship. NeuralFP is explicitly research code, not something its authors position as production-ready; treating it as such (without independent hardening/testing) carries real deployment risk. None of the three have an 'official policy vs. widely-deployed unofficial practice' tension the way YouTube-scraping tools (ytInitialData, ytmusicapi) do, since there's no vendor policy governing self-hosted open-source software


**Pipeline Role**

- *Cascade position*:

  All three sit in a research/fallback tier rather than being turnkey production services — meaningful use of any of them requires substantial upfront engineering (standing up a server, training/hosting a model for NeuralFP, and building a reference catalog), making them a longer-horizon investment rather than an immediate low-cost gate

- *Failure mode*:

  audfprint/Echoprint fail silently (no match) when the hash-consistency threshold isn't met, which is a safe default. NeuralFP's nearest-neighbor search will always return a 'nearest' result even for a genuinely unmatched query unless an explicit distance/similarity threshold is applied — without careful thresholding this risks a confident-but-wrong answer, which would be a visible product defect for a karaoke overlay

- *Cost model at scale*:

  Zero licensing/per-query cost for all three since they are open source, but real infrastructure costs apply: compute/storage for indexing and hosting a reference catalog (audfprint, Echoprint), and additionally GPU compute for embedding generation and vector-index hosting/updates at scale for NeuralFP

- *Geo region availability*:

  None — all three are self-hosted with no vendor-imposed geo-gating (Echoprint's original hosted service, which is now defunct, was likewise not region-gated in any documented way)


**Uncertain fields** (excluded above, listed for reference)

- pitch_speed_cover_robustness
- realtime_capability

---

### Shazam / ShazamKit (Apple official SDK)

**Basic Info**

- *Name*: Shazam / ShazamKit (Apple official SDK)
- *Type*:

  Infrastructure/architecture constraint -- an official native identifier SDK that is NOT usable as a web/Chrome-extension API; included here as a correction to an earlier 'no official API' assumption

- *Maintainer*:

  Apple Inc. (Shazam was acquired by Apple in 2018; ShazamKit is distributed as part of Apple's developer platform)


**Technical Approach**

- *Method*:

  Native on-device audio-signature generation matched against Shazam's server-side catalog (or a developer-supplied custom catalog created via a separate signature-generation pipeline, per Apple's WWDC22 'Create custom catalogs at scale with ShazamKit' session)

- *Required input*:

  Raw audio captured via native platform microphone/audio-session APIs (AVAudioEngine on Apple platforms, or the Android SDK's equivalent audio capture) -- not a URL, page HTML, or title text; there is no browser/JavaScript capture path


**Integration Feasibility**

- *Chrome extension usability*:

  NOT usable inside a Chrome extension. ShazamKit is distributed only as native frameworks: Swift for iOS/iPadOS/macOS/tvOS/visionOS/watchOS, and a separate Kotlin SDK for Android. There is no JavaScript/Web SDK, no documented REST endpoint intended for direct third-party web use, and no browser integration path -- this is the key correction versus an earlier assumption that 'no official API exists at all' (an official SDK does exist, it is simply platform-native and architecturally incompatible with a Chrome extension's JS/web execution context).

- *Audio access requirement*:

  Requires raw audio captured through native OS audio APIs on a supported platform (iOS/iPadOS/macOS/tvOS/visionOS/watchOS/Android) -- entirely inapplicable to a browser-based Chrome extension's tabCapture/WebAudio model, since ShazamKit cannot be invoked from within a browser JS runtime at all.

- *Client vs server*:

  On supported native platforms, Apple states audio itself is not shared with Apple/Shazam -- only an irreversible audio signature is sent for matching -- offering a strong privacy posture, but this is moot for a Chrome extension since the SDK cannot run there in the first place.

- *Breakage risk*:

  As an official first-party Apple SDK, breakage risk (for the platforms it does support) is low and backed by Apple's own maintenance -- but this is irrelevant to the karaoke-chrome-extension project since the SDK cannot be used there at all; the only 'risk' from this project's perspective is mistakenly assuming ShazamKit is a viable path for a web extension.


**Output**

- *Identification fields*:

  MediaItem/match results include title, artist, and per Apple's published Android SDK API reference, an 'isrc' field, plus artwork and links back to Apple Music where applicable; genre and match-offset/timecode data are also referenced in Apple's documentation.

- *Isrc availability*:

  Yes -- confirmed in Apple's own ShazamKit for Android API reference (MediaItem.isrc), so ISRC is available as a join key on native platforms; irrelevant in practice for this project since the SDK cannot be called from a Chrome extension.


**Licensing & Legal**

- *Risk tolerance note*:

  This item is purely a documentation correction: an official Apple SDK genuinely exists (contradicting an earlier assumption of 'no official API'), but it is a native-only SDK with no web/JS surface, so it does not resolve the Chrome-extension integration problem the karaoke project needs solved -- unofficial reverse-engineered options (e.g., SongRec, ShazamAPI-style Python libraries) exist specifically because the *official* SDK cannot be called from a browser.


**Pipeline Role**

- *Cascade position*:

  Not applicable -- cannot be inserted into a browser-based pipeline at all; would only be relevant if the karaoke product were reimplemented as a native iOS/Android/macOS app rather than a Chrome extension.


**Uncertain fields** (excluded above, listed for reference)

- minimum_clip_length
- classification_or_hitrate
- pitch_speed_cover_robustness
- catalog_language_bias
- evaluation_dataset
- confidence_calibration
- api_availability
- bundle_weight_cold_start
- realtime_capability
- karaoke_specific_outputs
- tos_restrictions
- failure_mode
- cost_model_at_scale
- geo_region_availability

---

### SongRec (open-source Shazam client, Rust/GPL)

**Basic Info**

- *Name*: SongRec (open-source Shazam client, Rust/GPL)
- *Type*:

  Identifier (unofficial, reverse-engineered client that talks to Shazam's real, undocumented consumer endpoint)

- *Maintainer*:

  Community open-source project (originally marin-m on GitHub; GNU GPL v3 license; ~2,000+ stars, 1,000+ commits); related community forks/wrappers exist (e.g., rustyforks/SongRec, benjitusk/songrec) and sibling reverse-engineered libraries like Numenorean/ShazamAPI and shazamio/ShazamIO reimplement the same protocol in other languages


**Technical Approach**

- *Method*:

  Fingerprinting -- generates a Shazam-compatible audio signature client-side (sequences of frequency/amplitude/time peak tuples) and submits it to Shazam's real, unofficial/undocumented HTTP endpoint, which does the actual server-side database matching (client-side fingerprint generation is described by the project as comparatively simple, since 'much of the processing is done server-side')

- *Required input*:

  Raw audio (from an arbitrary audio file or a live microphone/audio-device capture); only the derived fingerprint/signature -- not raw audio -- is actually uploaded to Shazam's servers


**Integration Feasibility**

- *Api availability*:

  Free (no API key/paid tier) since it talks directly to Shazam's real consumer-facing endpoint rather than a documented commercial API -- but this also means there is no official rate-limit, SLA, or support channel, and reliability depends entirely on undocumented server behavior Shazam does not commit to preserving for third parties.

- *Chrome extension usability*:

  Not directly reusable inside a Chrome extension as-is: SongRec is a native Rust application (Linux-first, with Windows via MSYS2 and unofficial macOS support, plus a Flatpak build) with a CLI/GUI, not a browser-embeddable JS/WASM library. To use its approach in a Chrome extension, a developer would need to port/reimplement the fingerprint-generation and signing logic in JS/WASM (as sibling reverse-engineered projects like shazamio/ShazamIO in Python and Numenorean/ShazamAPI demonstrate is possible in other languages) and likely proxy the actual Shazam endpoint call through a backend, since calling Shazam's undocumented endpoint directly from a distributed browser extension is fragile and ToS-risky.

- *Audio access requirement*:

  Requires raw audio input (file or microphone/device capture); in a hypothetical browser port this would mean tab-audio capture similar to other fingerprinting approaches, with the same DRM/age-restricted-content limitations as any other raw-audio-dependent method.

- *Client vs server*:

  The project's own privacy claim is that 'SongRec collects no data and contacts no other servers than Shazam's,' and only the derived fingerprint (not raw audio) is uploaded to Shazam -- but this still means fingerprint data (effectively a proxy for the audio/video being played) leaves the user's machine to Shazam's servers, an undocumented third party whose data-handling terms for this unofficial traffic pattern are unclear.

- *Breakage risk*:

  High and demonstrated in practice: a real GitHub issue (marin-m/SongRec #222) reports persistent 'Shazam servers are unreachable' errors that escalated from occasional (~1 in 15-20 attempts) to consistent failures over a ~2-3 week period in 2026, while the official Shazam mobile app kept working normally -- strongly suggesting Shazam can and does change/restrict its undocumented endpoint behavior in ways that break unofficial clients, with no official support channel or SLA to rely on. An active community exists (2,000+ stars, ongoing issues/commits) that has historically patched around such breaks, but there is no guarantee of continued responsiveness.


**Latency**

- *Realtime capability*:

  When the endpoint is reachable, matching is fast (consumer-Shazam-like, typically a few seconds) since server-side fingerprint matching is the same infrastructure real Shazam uses -- but realtime_capability is undermined by the endpoint's demonstrated unreliability (see breakage_risk), which can turn 'fast' into 'completely unavailable' without warning.


**Output**

- *Karaoke specific outputs*:

  No BPM, musical key, vocal/instrumental activity, or word-level lyric timing is provided; SongRec is purely a track-identification tool (plus a novelty 'audio lure' generation feature to spoof Shazam), not a karaoke-timing tool.


**Licensing & Legal**

- *Tos restrictions*:

  SongRec talks to Shazam's real, undocumented consumer endpoint without authorization from Shazam/Apple, which -- while the project frames itself as 'interoperability' tooling and states 'software patents may apply in certain countries outside the European Union, especially the United States' -- is a textbook ToS-risk scenario: consumer Shazam's terms are written for the official app/SDK, not for arbitrary third-party clients hitting the same backend, and Apple's ShazamKit developer terms separately prohibit using recognition data to build/improve a competing recognition service, a spirit that unofficial full-protocol clients like SongRec arguably sit in tension with. The project itself is GPL v3 licensed (open-source code), which governs the *code's* reuse but does not grant any rights over Shazam's backend/data.

- *Risk tolerance note*:

  This is the canonical example the field description calls out: official policy (Shazam/Apple has never published or sanctioned this endpoint for third-party use) directly conflicts with a widely-deployed unofficial practice (SongRec has 2,000+ GitHub stars, packages in Linux distro repos like FreshPorts, and multiple derivative libraries in Python/other languages) -- similar in kind to ytInitialData scraping or ytmusicapi, but arguably higher-risk since it involves impersonating undocumented traffic to a service (Shazam) now owned by a large, litigation-capable company (Apple), not just scraping public webpage data.


**Pipeline Role**

- *Cascade position*:

  Would only make sense as a last-resort fallback (expensive in engineering/legal-risk terms, not monetary terms) given its demonstrated unreliability and ToS exposure -- inappropriate as a primary gate or gate/enrichment step for a shipped, Web-Store-distributed product.

- *Failure mode*:

  When the endpoint is reachable, it fails relatively silently (Shazam's real matching returns no-match rather than a hallucinated guess, since it's genuine fingerprint database matching); but when the endpoint itself becomes unreachable/blocked (as documented in issue #222), the failure mode shifts to a total, unexplained outage of the feature with no vendor support to escalate to -- a worse operational failure mode than a paid API's documented rate-limit/error responses.

- *Cost model at scale*:

  Nominally free (no per-request fee, since it's hitting Shazam's own consumer backend rather than a billed API), but this is also exactly what creates risk: Shazam has no commercial relationship or rate-limit contract with SongRec-style clients, so heavy at-scale use by a shipped Chrome extension could be far more likely to trigger IP-based blocking or targeted countermeasures than a properly licensed, paid API would be.


**Uncertain fields** (excluded above, listed for reference)

- minimum_clip_length
- classification_or_hitrate
- pitch_speed_cover_robustness
- catalog_language_bias
- evaluation_dataset
- confidence_calibration
- bundle_weight_cold_start
- identification_fields
- isrc_availability
- geo_region_availability

---

### SoundHound Houndify

**Basic Info**

- *Name*: SoundHound Houndify
- *Type*:

  Commercial audio fingerprinting/identification API, bundled within a broader conversational voice-AI (NLU/ASR) platform

- *Maintainer*: SoundHound AI, Inc. (public company, NASDAQ: SOUN)

**Technical Approach**

- *Method*:

  Proprietary audio fingerprinting matched server-side against SoundHound's music database; exposed as a 'domain' within the larger Houndify voice-AI query platform (also does speech recognition/NLU for non-music queries)

- *Required input*: Raw audio clip (PCM stream) sent from client SDK to Houndify cloud servers

**Accuracy & Reliability**

- *Evaluation dataset*: Not published — proprietary/private evaluation, no academic or vendor-neutral benchmark disclosed

**Integration Feasibility**

- *Api availability*:

  Keyed (Client ID + Client Key required after registration at houndify.com); free tier historically around 1,000 API calls/month, then usage-based pay-as-you-go pricing, with custom enterprise contracts for higher volume; the music-recognition capability specifically is described as 'available for license on request' separate from the base conversational API, implying an additional commercial agreement

- *Chrome extension usability*:

  Requires HMAC-signed requests using a secret Client Key; SoundHound's own guidance recommends a server sit between the app and Houndify's servers so the secret key is never distributed client-side — meaning a backend proxy is required and the key cannot be safely embedded directly in a Chrome extension's client-side code

- *Audio access requirement*:

  Requires raw captured audio (microphone or tab-audio capture); microphone access requires an explicit user gesture and browser permission grant

- *Client vs server*:

  Audio (or audio-derived query data) leaves the user's machine and is sent to SoundHound's cloud for recognition; this is a third-party data flow requiring Chrome Web Store privacy disclosure; no offline capability

- *Bundle weight cold start*:

  Lightweight official SDKs (JS/Python/Go/Android/iOS client libraries); network round-trip to cloud dominates latency rather than local bundle size; marketing claims sub-second response after audio capture


**Latency**

- *Realtime capability*:

  Yes — sub-second recognition latency claimed once audio is captured and transmitted, suitable for near-real-time use if network conditions are good


**Licensing & Legal**

- *Tos restrictions*:

  Standard commercial developer ToS applies to the base Houndify platform; the music-recognition domain is licensed separately/on-request, implying additional contractual restrictions (likely limiting reselling of recognition results and possibly imposing region restrictions per underlying label agreements), though exact terms are not public

- *Risk tolerance note*:

  Not applicable — this is an official, contractually-licensed commercial API rather than a scraped/unofficial surface, so there is no official-vs-community-practice conflict to navigate


**Pipeline Role**

- *Cascade position*:

  Fallback/enrichment tier — the per-query cost, mandatory backend proxy for key security, and separate licensing negotiation for music recognition make it a poor fit as a cheap always-on gate; better suited as a paid fallback used sparingly after free/self-hosted methods miss

- *Failure mode*:

  Fails silently with a no-match/empty result when the track is unrecognized, consistent with standard commercial fingerprinting API behavior

- *Cost model at scale*:

  Usage-based pricing beyond a small free tier (~1,000 calls/month reported); at realistic per-session repeated-use load for a karaoke extension, costs could scale quickly and unpredictably since no public flat-rate/self-serve plan is documented for the music-recognition domain specifically


**Uncertain fields** (excluded above, listed for reference)

- minimum_clip_length
- classification_or_hitrate
- pitch_speed_cover_robustness
- catalog_language_bias
- confidence_calibration
- breakage_risk
- identification_fields
- isrc_availability
- karaoke_specific_outputs
- geo_region_availability

---

## Audio/ML classification

### CLAP (LAION clap-htsat-*)

**Basic Info**

- *Name*: CLAP (LAION clap-htsat-*)
- *Type*: Classifier — zero-shot audio-text embedding/classification model, no fixed taxonomy required
- *Maintainer*:

  LAION-AI (open-source community); HTSAT audio encoder architecture; browser-ready ONNX conversion maintained by Xenova/Hugging Face (Xenova/clap-htsat-unfused) for use with Transformers.js


**Technical Approach**

- *Method*:

  Embedding-based / zero-shot classification — contrastive language-audio pretraining with a dual encoder (HTSAT audio encoder + text encoder) that scores cosine similarity between an audio embedding and arbitrary text-label embeddings (e.g. 'this is music' vs. 'this is speech'), so labels are defined at query time rather than fixed at training time

- *Required input*: Raw audio waveform (48kHz mono Float32Array) plus a set of candidate text labels/prompts

**Accuracy & Reliability**

- *Classification or hitrate*:

  Strong zero-shot results: 82.6% (original LAION CLAP) up to 89.1% (improved LAION CLAP) accuracy on ESC-50; 100% accuracy on GTZAN Music-vs-Speech classification, exceeding supervised baselines; 73% accuracy on UrbanSound8K

- *Evaluation dataset*:

  ESC-50, GTZAN Music-Speech, UrbanSound8K, and FSD50K per the original CLAP paper and follow-up zero-shot audio classification literature; not evaluated on MUSAN or MagnaTagATune in the core benchmarks found


**Integration Feasibility**

- *Api availability*:

  Free, open-source (Apache 2.0 per the Hugging Face model card), keyless — runs locally via Transformers.js using the Xenova/clap-htsat-unfused ONNX build; no rate limits since no remote API call is needed at inference time

- *Chrome extension usability*:

  Runs client-side via Transformers.js + onnxruntime-web (WASM/WebGPU); subject to the same MV3 constraints as other WASM runtimes ('wasm-unsafe-eval' CSP, and the WASM engine itself must be bundled in-package rather than CDN-loaded per Chrome Web Store policy — this exact rejection was reported for a transformers.js-based extension, GitHub issue #839). The large model weight files would typically be fetched/cached from Hugging Face's CDN as data rather than executed as code, which is a materially lower policy risk than the WASM runtime itself

- *Audio access requirement*:

  Requires raw audio at 48kHz mono; same tabCapture user-gesture/tab-mute/DRM-breakage caveats as the other raw-audio methods evaluated

- *Client vs server*:

  Can run fully client-side/offline after the first model download — no audio or video ID needs to leave the user's machine; combined with its flexible zero-shot labeling, this gives the strongest privacy-plus-flexibility combination of the options evaluated

- *Bundle weight cold start*:

  The heaviest model in this evaluation. Audio-only encoder: audio_model.onnx ~118MB (fp16 ~60MB, int8-quantized ~34MB). Full combined audio+text model: model.onnx ~619MB unquantized (fp16 ~312MB, int8-quantized ~161MB). Even the smallest practical build (quantized, audio-only) is tens of MB — materially heavier than YAMNet or Essentia.js

- *Breakage risk*:

  LAION-AI/CLAP is a community open-source research project, not a vendor product, with a recorded accuracy-drop issue when converting checkpoints across formats (GitHub issue #126, 'Acc drop after converting HTSAT-base type to huggingface model'). The browser-ready ONNX build additionally depends on the separately-maintained Xenova/Transformers.js conversion pipeline, adding a second maintenance dependency beyond the original LAION repo


**Output**

- *Identification fields*:

  None — CLAP produces similarity scores against arbitrary text prompts (e.g. classifying music vs. non-music, or even genre-level prompts), not song title, artist, album, or ISRC; it cannot identify a specific song, only classify/describe audio against text concepts

- *Isrc availability*: No
- *Karaoke specific outputs*:

  None directly, but its zero-shot flexibility means a developer could probe for proxy signals via custom text prompts (e.g. 'a cappella vocals' vs. 'instrumental') without retraining; still no native BPM, key, or word-level timing output


**Licensing & Legal**

- *Tos restrictions*:

  Apache 2.0 licensed (per the Hugging Face model card), so no YouTube-scraping ToS exposure since it only classifies already-captured audio locally; no restriction on reselling zero-shot classification output was found

- *Risk tolerance note*:

  The main risk is technical/maintenance (cross-format conversion accuracy drops, dependence on a second unofficial conversion pipeline for the browser build) rather than legal ToS — comparable in spirit to relying on other community-patched unofficial tooling


**Pipeline Role**

- *Cascade position*:

  Best suited as an enrichment or flexible fallback classifier (e.g. genre/mood tagging via custom prompts, or a secondary opinion when the primary gate is low-confidence) rather than the primary always-on gate, given its much larger bundle size/cold start compared with YAMNet or Essentia.js

- *Failure mode*:

  Fails silently with low/ambiguous similarity scores across candidate labels rather than a confidently wrong song identity — the same safe 'no answer' failure profile as the other classifiers evaluated, though poorly chosen prompt/candidate-label design could produce a misleadingly confident wrong label

- *Cost model at scale*:

  Effectively $0 marginal cost per query (client-side, no API fees), but the large one-time model download (tens to hundreds of MB depending on quantization) is a real bandwidth/storage cost at install/update time across a user base, unlike the lighter options evaluated here


**Uncertain fields** (excluded above, listed for reference)

- minimum_clip_length
- pitch_speed_cover_robustness
- catalog_language_bias
- confidence_calibration
- realtime_capability
- geo_region_availability

---

### Essentia.js

**Basic Info**

- *Name*: Essentia.js
- *Type*:

  Classifier + infrastructure — browser MIR toolkit combining rule-based DSP (BPM, key) with optional ML classifiers (genre/mood/instrumentation); the only item in this set with native karaoke-relevant DSP outputs

- *Maintainer*:

  Music Technology Group (MTG), Universitat Pompeu Fabra, Barcelona — the same team behind the underlying C++ Essentia library


**Technical Approach**

- *Method*:

  Hybrid — classic MIR/DSP algorithms (RhythmExtractor2013 for BPM, KeyExtractor for musical key) compiled to WebAssembly via Emscripten, plus optional TensorFlow.js deep classifiers (genre via Discogs-400+ and MTG-Jamendo-87 taxonomies, mood, instrument, voice/instrumental) layered on top of the same WASM feature front-end

- *Required input*: Raw audio waveform (Web Audio API AudioBuffer / Float32Array)
- *Minimum clip length*:

  ML classifiers operate on ~1s analysis frames (similar order to YAMNet/PANNs); reliable BPM/key estimation typically needs several seconds to tens of seconds of continuous audio for a stable estimate


**Accuracy & Reliability**

- *Confidence calibration*:

  Yes on both halves of the library — the TF.js classifiers output per-tag/class probabilities/activations, and the DSP algorithms report their own numeric confidence (e.g. key-detection confidence, rhythm-extractor confidence), giving genuinely tunable thresholds


**Integration Feasibility**

- *Api availability*:

  Free, no API keys, fully local — distributed as the essentia.js npm package; no rate limits since nothing calls a remote service at inference time

- *Chrome extension usability*:

  Runs entirely client-side via WASM plus optional TF.js backends; subject to the same MV3 constraints as other WASM tools — requires 'wasm-unsafe-eval' in the CSP, and the WASM binaries/TF.js model files must be bundled inside the extension package rather than fetched from a CDN at runtime, to satisfy Chrome Web Store's remote-code policy. Documented to integrate with the Web Audio API / AudioWorklet for real-time analysis

- *Audio access requirement*:

  Requires raw audio; same tabCapture user-gesture/tab-mute/DRM-breakage caveats as the other raw-audio methods in this evaluation

- *Client vs server*:

  Fully on-device and offline-capable after first load — no audio or video ID needs to leave the user's machine, giving a strong privacy posture

- *Breakage risk*:

  Actively maintained by an academic research group (MTG/UPF) with regular releases and a published ISMIR/TISMIR architecture paper; smaller community and team size than Google/Meta-backed tools means potentially slower fixes, but the core WASM library has remained stable across multiple years of releases


**Latency**

- *Realtime capability*:

  Yes — explicitly designed for real-time use in the browser via the Web Audio API/AudioWorklet, including a documented real-time music auto-tagging (50-tag) and mood-classification demo running live in-browser


**Output**

- *Identification fields*:

  None — Essentia.js classifies genre/mood/instrumentation and extracts BPM/key, but does not output song title, artist, album, or ISRC; it is not an identification system

- *Isrc availability*: No
- *Karaoke specific outputs*:

  Yes, uniquely among the items evaluated — direct BPM (RhythmExtractor2013) and musical key (KeyExtractor) output, plus voice/instrumental classification as a proxy for vocal activity; still no word-level lyric timing


**Licensing & Legal**

- *Tos restrictions*:

  Essentia.js's core is dual-licensed AGPLv3 / commercial. AGPLv3 requires that any product using the library (including as a network service) make its complete corresponding source available — a significant constraint for a closed-source Chrome extension. MTG offers a paid commercial license as the alternative. No YouTube-scraping ToS exposure, since it only processes locally captured audio

- *Risk tolerance note*:

  This is the one item in this evaluation with a real licensing conflict: AGPLv3 could force either open-sourcing the entire extension or purchasing a commercial license from MTG before shipping a closed-source product on the Chrome Web Store. This is a distinct copyleft software-license risk, separate from the YouTube-scraping ToS risk category


**Pipeline Role**

- *Cascade position*:

  Enrichment — best run after a music/non-music gate to extract karaoke-specific features (BPM, key) and optionally refine genre/mood; its own classification could also serve as a gate, but its larger scope of work fits an enrichment role better

- *Failure mode*:

  BPM/key extraction can fail silently with a plausible-but-wrong numeric answer (e.g. half/double-tempo error, relative major/minor key confusion) — a visible product defect for a karaoke overlay (wrong tempo/key shown to the user), a distinct and higher-stakes risk profile than the pure classifiers in this evaluation

- *Geo region availability*:

  No region gating — fully client-side; the WASM/model assets can be self-hosted entirely within the extension bundle with no runtime external dependency


**Uncertain fields** (excluded above, listed for reference)

- classification_or_hitrate
- pitch_speed_cover_robustness
- catalog_language_bias
- evaluation_dataset
- bundle_weight_cold_start
- cost_model_at_scale

---

### MERT (MERT-v1-95M/330M)

**Basic Info**

- *Name*: MERT (MERT-v1-95M/330M)
- *Type*:

  Feature extractor / self-supervised audio embedding model used as a backbone encoder for downstream music-domain classifiers -- not a standalone music/non-music classifier or an identifier on its own

- *Maintainer*:

  m-a-p (Multimodal Art Projection) open research community; weights hosted under the m-a-p organization on Hugging Face, code at github.com/yizhilll/MERT; academic project, no corporate vendor


**Technical Approach**

- *Method*:

  Embedding-based, self-supervised pretraining: masked language modeling (MLM) over discretized audio tokens, using an RVQ-VAE/EnCodec-derived acoustic teacher plus a CQT-based musical (pitch) teacher, with in-batch noise mixup augmentation. Produces 12/24-layer x 768/1024-dim hidden states per audio frame; a task-specific head (linear probe or fine-tuned classifier) must be trained on top for music-vs-non-music classification.

- *Required input*: Raw audio waveform, resampled to 24 kHz mono (model strictly expects this sample rate)
- *Minimum clip length*:

  Pretrained with a 5-second context window; feature rate is 75 Hz (~13 ms/frame) so very short frames are technically producible, but usable classification signal in practice needs a multi-second clip rather than a single frame


**Accuracy & Reliability**

- *Evaluation dataset*:

  MARBLE benchmark suite (GTZAN genre, MTG-Jamendo tagging, GiantSteps key, MagnaTagATune, and other MIR probing tasks) -- not AudioSet or GTZAN's music-speech binary-discrimination subset, and not MUSAN or a vendor private set

- *Confidence calibration*:

  Raw model output is a set of layer-wise embeddings, not a probability -- there is no built-in calibrated score. Any usable threshold for a music/non-music decision only exists after a downstream classifier head is trained and separately calibrated.


**Integration Feasibility**

- *Api availability*:

  Free, self-hosted only -- weights downloadable from Hugging Face (m-a-p org) or via the GitHub repo's checkpoint links, no API keys or rate limits since there is no hosted inference API; the model weights themselves are licensed CC-BY-NC-4.0 (non-commercial use only), while the GitHub repository's own code is Apache-2.0/MIT.

- *Audio access requirement*:

  Requires raw audio bytes. In a Chrome extension this means chrome.tabCapture + an offscreen document (needs a user gesture and mutes the tab unless reconnected to audioContext.destination), and it will fail on DRM-protected or otherwise uncapturable age-restricted content.

- *Client vs server*:

  Because no confirmed browser runtime exists, the practical architecture ships a captured audio clip from the user's machine to a backend server that runs PyTorch/transformers for inference -- raw audio leaves the client.

- *Bundle weight cold start*:

  MERT-v1-95M (~95M params, roughly a few hundred MB in fp32) or MERT-v1-330M (~330M params, over 1 GB) -- far too large to ship inside an extension bundle; would live server-side, with cold start dominated by one-time model load and then per-request GPU/CPU inference latency.

- *Breakage risk*:

  Academic project maintained by the m-a-p community (v1 released March 2023); relies on a pinned older `transformers` version and custom remote code, which is a documented compatibility break point (Hugging Face discussion #4 notes MERT-v1-95M is not compatible with transformers >= 4.44.0) -- moderate risk of breakage as the upstream `transformers` library evolves.


**Output**

- *Identification fields*:

  None -- MERT produces only embeddings/tag probabilities (e.g., genre, mood, key, instrument if a head is fine-tuned for those); it does not output title, artist, album, ISRC, or any track-identification field.

- *Isrc availability*: No -- MERT is not an identification system and has no path to an ISRC.
- *Karaoke specific outputs*:

  Can be fine-tuned/probed for MIR tasks such as key estimation (GiantSteps, via MARBLE) or genre/instrument tagging, but ships with no native BPM, musical key, vocal/instrumental activity, or word-level timing output out of the box -- all would require additional fine-tuning and separate heads.


**Licensing & Legal**

- *Tos restrictions*:

  The CC-BY-NC-4.0 license on the model weights explicitly prohibits commercial use, which is a material legal blocker for a published Chrome extension; the GitHub repository code itself carries a separate permissive (Apache-2.0/MIT-style) license that does not override the weights' NC restriction.

- *Risk tolerance note*:

  Unlike ToS-gray-area scraping approaches (ytInitialData, SongRec), MERT's restriction is an explicit, unambiguous legal license term (NC), not a widely-tolerated unofficial practice -- shipping it inside a distributed extension would likely need direct legal clearance or a commercial license request to the m-a-p team.


**Pipeline Role**

- *Cascade position*:

  Enrichment/backbone role, not a cheap always-on gate -- would sit inside a self-hosted classifier pipeline, ideally invoked only after a cheaper early-stage signal (e.g. title heuristics or a lightweight classifier) has already narrowed the decision, given its compute cost and server dependency.

- *Failure mode*:

  As a pure embedding backbone it does not itself 'answer' music-vs-non-music -- failure surfaces inside whatever downstream head is trained on top of it; that head's own calibration determines whether failures are silent (low-confidence) or confidently wrong, which is outside MERT's own control.

- *Cost model at scale*:

  No vendor per-query fee -- cost is entirely self-hosted GPU/CPU server compute, amortized across all extension users rather than billed per request like a commercial API; scales with concurrent inference load, not with a metered pricing tier.

- *Geo region availability*:

  No geo-gating -- weights are downloadable globally from Hugging Face and GitHub (subject only to those platforms' own regional availability, which is not music-specific).


**Uncertain fields** (excluded above, listed for reference)

- classification_or_hitrate
- pitch_speed_cover_robustness
- catalog_language_bias
- chrome_extension_usability
- realtime_capability

---

### MuQ / MuQ-MuLan

**Basic Info**

- *Name*: MuQ / MuQ-MuLan
- *Type*:

  Feature extractor (MuQ) plus a zero-shot music-text joint embedding classifier (MuQ-MuLan, CLAP-style contrastive dual encoder) -- usable for zero-shot music/tag classification via audio-text cosine similarity, not a fingerprint identifier

- *Maintainer*:

  Tencent AI Lab (github.com/tencent-ailab/MuQ), weights published under the community 'OpenMuQ' organization on Hugging Face; paper released January 2025


**Technical Approach**

- *Method*:

  Embedding-based. MuQ: self-supervised pretraining using Mel-RVQ (Mel-domain Residual Vector Quantization) tokenization with iterative masked-prediction training (scaled from 0.9K to 160K hours of open data). MuQ-MuLan: a CLIP/CLAP-style contrastive dual encoder pairing the MuQ audio tower with a bilingual (English/Chinese) text tower, trained on music-text pairs, enabling zero-shot classification by computing cosine similarity between an audio embedding and candidate text-prompt embeddings (e.g. a 'music' vs 'speech' prompt pair).

- *Required input*:

  Raw audio waveform at 24 kHz (librosa `sr=24000` in official usage examples); MuQ-MuLan additionally takes free-text prompts (English or Chinese) for the text tower


**Accuracy & Reliability**

- *Evaluation dataset*:

  MagnaTagATune (zero-shot tagging headline result) plus the MARBLE benchmark suite (GTZAN, GiantSteps, MTG-Jamendo, etc.) for the underlying MuQ encoder


**Integration Feasibility**

- *Api availability*:

  Free, self-hosted only -- weights downloadable via Hugging Face (OpenMuQ org) and GitHub (tencent-ailab/MuQ), no API keys or hosted inference service; code is MIT-licensed, but model weights are separately licensed CC-BY-NC-4.0 (non-commercial use only, per the repo's LICENSE_weights file).

- *Audio access requirement*:

  Requires raw audio bytes at 24 kHz. Same chrome.tabCapture/offscreen-document, user-gesture, tab-mute, and DRM/age-restriction constraints as any other audio-based method in this comparison set.

- *Client vs server*:

  Given no browser runtime, audio must be sent from the user's machine to a backend server running PyTorch for inference -- not client-only.

- *Bundle weight cold start*:

  MuQ (~300M params) plus MuQ-MuLan's added text/audio contrastive towers (~700M params combined) -- a multi-hundred-MB to multi-GB checkpoint, far too large for an extension bundle; would be server-hosted, with cold start from one-time model load plus per-request inference latency.


**Output**

- *Identification fields*:

  None directly -- zero-shot classification via MuQ-MuLan yields a similarity/tag score against arbitrary text prompts (e.g. genre, mood, or a 'music' vs 'speech' prompt), not title, artist, album, or ISRC; it is not a catalog-backed identification system.

- *Isrc availability*: No

**Licensing & Legal**

- *Tos restrictions*:

  CC-BY-NC-4.0 on the model weights explicitly prohibits commercial use, identical in effect to MERT's licensing constraint -- a material blocker for a publicly distributed Chrome extension without a separate commercial license from Tencent AI Lab.

- *Risk tolerance note*:

  Same category as MERT: an explicit, unambiguous legal license restriction (non-commercial), not a widely-tolerated unofficial-surface gray area like ytInitialData scraping or SongRec -- deployment in a shipped product would need direct legal clearance.


**Pipeline Role**

- *Cascade position*:

  Enrichment/fallback role -- zero-shot text-prompted classification (e.g. against 'music' vs 'speech'/'noise' prompts) could serve as a secondary check when cheaper heuristics are inconclusive, but its compute cost and server dependency make it unsuitable as the primary always-on gate.

- *Failure mode*:

  Zero-shot similarity scoring against arbitrary text prompts is a known CLAP-family weak point -- it can produce a confidently high similarity score for out-of-distribution or ambiguous audio, risking a visible, confidently-wrong music/non-music classification if not backed by a carefully tuned threshold or secondary check.

- *Cost model at scale*:

  No vendor per-query fee (self-hosted); compute cost scales with the larger combined model size (~1B params) relative to MERT, so per-inference server cost is proportionally higher at equivalent usage volume.

- *Geo region availability*:

  No geo-gating -- globally downloadable from Hugging Face/GitHub; the bilingual English/Chinese design makes it specifically attractive for C-pop-heavy catalogs relative to English-only alternatives like CLAP.


**Uncertain fields** (excluded above, listed for reference)

- minimum_clip_length
- classification_or_hitrate
- pitch_speed_cover_robustness
- catalog_language_bias
- confidence_calibration
- chrome_extension_usability
- breakage_risk
- realtime_capability
- karaoke_specific_outputs

---

### PANNs (Pretrained Audio Neural Networks)

**Basic Info**

- *Name*: PANNs (Pretrained Audio Neural Networks)
- *Type*: Classifier — multi-label audio tagging / sound event classification model family
- *Maintainer*:

  Qiuqiang Kong et al. (original research, ByteDance/University of Surrey); community-maintained open-source repos (qiuqiangkong/audioset_tagging_cnn, qiuqiangkong/panns_inference)


**Technical Approach**

- *Method*:

  ML classification — a family of CNNs (CNN14, Wavegram-Logmel-CNN, ResNet38, and MobileNetV1/V2 variants) trained on log-mel spectrograms for multi-label AudioSet tagging

- *Required input*: Raw audio waveform (commonly 32kHz mono for the CNN14 family)
- *Minimum clip length*:

  ~1-2s minimum for a stable tag distribution (similar order to YAMNet's frame-based approach); the reference PyTorch implementation is typically run over full clips (e.g. 10s) rather than a true streaming API


**Accuracy & Reliability**

- *Classification or hitrate*:

  Best PANNs system (Wavegram-Logmel-CNN) achieves a state-of-the-art mAP of 0.439 on AudioSet (527 classes), vs. the CNN14 baseline's mAP of 0.431 — both notably higher than YAMNet's mAP of 0.306 on the same task family; a fine-tuned CNN14 also reaches 91.5% accuracy on GTZAN genre classification

- *Evaluation dataset*:

  AudioSet (primary training/eval set); the original paper also transfers PANNs to GTZAN (genre classification) and five other audio pattern recognition tasks; not evaluated on MUSAN or MagnaTagATune in the core paper


**Integration Feasibility**

- *Api availability*:

  Free, open-source (MIT license for panns_inference), no hosted API — distributed as a pip-installable Python package only; there is no official npm/JS package

- *Chrome extension usability*:

  No official browser (WASM/TF.js/ONNX.js) build exists; using it in a Chrome extension would require manually exporting a PyTorch checkpoint (e.g. the 327MB Cnn14_mAP=0.431.pth) to ONNX and running it via onnxruntime-web — a nontrivial, unsupported conversion path — plus the same MV3 remote-code/WASM-bundling constraints that apply to other in-browser ML runtimes

- *Audio access requirement*:

  Would require raw audio via tabCapture (same caveats: user gesture, tab-mute risk, DRM/age-restriction breakage) if ported to the browser; as officially distributed it is a server-side/Python-only tool, so realistically audio would need to leave the client for a backend service unless a team does the ONNX conversion themselves

- *Client vs server*:

  As officially distributed, server-side/Python-only; client-side use requires nontrivial unofficial conversion work, meaning in practice audio or video data would otherwise need to leave the user's device to reach a backend inference service

- *Bundle weight cold start*:

  CNN14 checkpoint (mAP=0.431 variant) is 327MB. Smaller MobileNetV1/V2 PANNs variants cut parameters/multiply-adds to roughly 5-9% of CNN14's, at the cost of an mAP of 0.383-0.389 (an ~9-11% relative mAP drop) — still likely tens of MB and unofficial to deploy in-browser, far too heavy for a lean extension bundle without aggressive pruning/quantization

- *Breakage risk*:

  The core repo (qiuqiangkong/audioset_tagging_cnn) has many long-standing open GitHub issues with limited maintainer responsiveness; it is an academic-project-turned-community-tool rather than a vendor-backed product, so there is no guaranteed patch cadence or LTS support, and no browser ecosystem exists to absorb breakage the way MediaPipe's does


**Latency**

- *Realtime capability*:

  Not practical in-browser without custom conversion work; as a native PyTorch model it runs fast on a GPU/CPU server, but it is not currently a realtime in-browser option out of the box


**Output**

- *Identification fields*: None — outputs AudioSet class tags/scores only, not song title, artist, album, or ISRC
- *Isrc availability*: No
- *Karaoke specific outputs*:

  None directly — like YAMNet, it has Singing/Music/Speech-adjacent tags that could weakly proxy vocal presence, but there is no BPM, key, or word-level timing output


**Licensing & Legal**

- *Tos restrictions*:

  MIT/open license, no direct YouTube ToS exposure since it only classifies already-captured audio; no restriction found on reselling classification output

- *Risk tolerance note*:

  The biggest practical risk is reliance on an unofficial, academic-maintained project with no vendor SLA — a similar risk profile to relying on community tools like SongRec, but here for classification rather than identification


**Pipeline Role**

- *Cascade position*:

  Would only make sense as a higher-accuracy fallback/enrichment stage run server-side (given size and lack of browser support), not as a lightweight always-on client-side gate

- *Failure mode*:

  Fails silently with an ambiguous/low tag distribution rather than a confidently wrong song identity — the same safe-failure profile as YAMNet, since it is also a multi-label tagger rather than an identifier

- *Cost model at scale*:

  No vendor licensing fees since it is fully open-source; if self-hosted server-side, cost is entirely the developer's own compute (GPU/CPU inference time per request), which could be nontrivial at scale given a 327MB model per hosted instance

- *Geo region availability*:

  No region gating; open weights are downloadable from GitHub/Zenodo/Hugging Face globally, though a self-hosted backend's region is entirely the developer's own choice and cost


**Uncertain fields** (excluded above, listed for reference)

- pitch_speed_cover_robustness
- catalog_language_bias
- confidence_calibration

---

### Singing Voice Detection (SVD)

**Basic Info**

- *Name*: Singing Voice Detection (SVD)
- *Type*:

  Classifier -- frame/segment-level binary task (singing voice present vs. absent) distinct from music/non-music classification; a research task/category with multiple competing model families rather than one single named tool or vendor

- *Maintainer*:

  Academic research community; no single corporate maintainer. Notable open reference implementations include kyungyunlee/ismir2018-revisiting-svd (CNN/LSTM/random-forest baselines reproducing prior work) and research lineages from Schluter & Grill (2015, CNN), Lehner et al., and Doras & Peeters (CRNN-based approaches)


**Technical Approach**

- *Method*:

  ML classification -- typically a CNN, CRNN, or GRU-RNN operating on mel-spectrogram or CQT frames, trained to output a frame-level singing-voice probability, followed by thresholding and median/smoothing filtering. A complementary and increasingly common approach separates the vocal stem first (via Demucs/Spleeter) and applies a simpler energy/activity detector to the isolated stem rather than an end-to-end classifier on the mixed signal.

- *Required input*:

  Raw audio of the mixed track, or -- for the separation-assisted approach -- the isolated vocal stem produced by a source-separation model; internally converted to mel-spectrogram/CQT feature frames


**Accuracy & Reliability**

- *Classification or hitrate*:

  SOTA CRNN-style models report roughly 92% accuracy / 0.93 F1 on the Jamendo dataset and roughly 97% accuracy / 0.96 F1 on the RWC Popular Music dataset; earlier GRU-RNN work reports F1 in the 87-89% range. Numbers vary substantially by dataset, model family, and evaluation conditions (clean vs. stress-tested).

- *Evaluation dataset*:

  Jamendo Corpus (93 copyright-free songs with singing annotations), RWC Popular Music Database; supplementary corpora MedleyDB, iKala, MIR-1K, and the combined ALL-Pub-SVD-In-One dataset -- not AudioSet, GTZAN music-speech, MUSAN, or MagnaTagATune


**Integration Feasibility**

- *Chrome extension usability*:

  No browser-ready (ONNX/Transformers.js/WASM) SVD implementation was found -- all reference implementations are Python/TensorFlow or PyTorch research code requiring local or server-side execution, not directly embeddable in a Chrome extension.

- *Audio access requirement*:

  Requires raw audio, ideally an isolated vocal stem (per the source-separation-improves-SVD research direction) for best accuracy; same chrome.tabCapture/offscreen-document, user-gesture, tab-mute, and DRM/age-restricted-content constraints as other audio-based methods in this comparison set.

- *Client vs server*:

  With no browser-ready implementation available, practical deployment sends the audio (or its separated vocal stem) from the user's machine to a backend server for inference.

- *Breakage risk*:

  Fragmented ecosystem of individual academic repositories with most public activity concentrated around 2018-2022 rather than a single actively maintained project -- risk here is better described as staleness/lack of production hardening than active breakage, since there is no ongoing upstream dependency to break; no single canonical maintained library was found as of research date.


**Output**

- *Identification fields*:

  None -- SVD outputs only a time-aligned singing-voice-presence signal (per-frame boolean or probability), not title, artist, album, or ISRC.

- *Isrc availability*: No
- *Karaoke specific outputs*:

  This task IS the karaoke-relevant output itself: a time-aligned vocal-activity/singing-presence signal used to decide when to show or highlight lyrics. It does not itself provide BPM, musical key, or word-level timing -- those require separate MIR analysis or Whisper-based ASR alignment.


**Licensing & Legal**

- *Risk tolerance note*:

  Unlike MERT/MuQ's explicit non-commercial license restriction, SVD reference repositories often simply lack any stated license at all -- this is ambiguous rather than explicitly prohibited legal risk, and using such code in a distributed extension would require directly contacting each repository's author for clarification before shipping.


**Pipeline Role**

- *Cascade position*:

  Enrichment step that runs after a video has already been classified as music (and ideally after source separation has produced a clean vocal stem) -- narrowly scoped to deciding lyric-highlight timing rather than serving as the music/non-music gate itself.

- *Failure mode*:

  Fails toward an incorrect lyric-highlight timing (a visible product defect: highlighting the wrong line or missing the vocal entry point) rather than a total silent failure, since the underlying model always emits a per-frame probability that downstream code must threshold and smooth.

- *Cost model at scale*:

  No vendor pricing since this is self-hosted research code; cost is entirely compute time (CPU/GPU inference) borne by whoever operates the backend, scaling with the number of concurrent users and song-minutes processed rather than a per-request vendor fee.

- *Geo region availability*:

  No geo-gating -- purely a locally-run or self-hosted model with no external service dependency once trained/deployed.


**Uncertain fields** (excluded above, listed for reference)

- minimum_clip_length
- pitch_speed_cover_robustness
- catalog_language_bias
- confidence_calibration
- api_availability
- bundle_weight_cold_start
- realtime_capability
- tos_restrictions

---

### Demucs / Spleeter (source separation)

**Basic Info**

- *Name*: Demucs / Spleeter (source separation)
- *Type*:

  Infrastructure/architecture component -- audio source-separation models producing isolated vocal/instrumental stems that feed into SVD and Whisper lyric transcription and supply the karaoke backing track; neither tool is itself a classifier or identifier

- *Maintainer*:

  Demucs: Meta AI (formerly Facebook AI Research), github.com/facebookresearch/demucs, MIT license. Spleeter: Deezer Research, github.com/deezer/spleeter, MIT license


**Technical Approach**

- *Method*:

  Deep-learning source separation. Demucs v4 ('htdemucs', Hybrid Transformer Demucs) uses a hybrid spectrogram+waveform U-Net whose innermost layers are replaced by a cross-domain Transformer encoder with self-attention within each domain and cross-attention across domains. Spleeter uses a simpler U-Net (TensorFlow) trained separately per stem-count configuration (2/4/5-stems).

- *Required input*:

  Raw audio waveform (full track or clip); Demucs processes full-band audio, while Spleeter's original released models operate up to 11 kHz bandwidth (16 kHz variants were also released)

- *Minimum clip length*:

  No strict minimum for either tool -- both process arbitrary-length clips via sliding/chunked windows; short clips of a few seconds work, though separation quality (particularly bass/low-frequency content) generally improves with more surrounding context. Neither model is a low-latency streaming/frame-level architecture; both operate on batched, non-causal windows.


**Accuracy & Reliability**

- *Evaluation dataset*:

  MUSDB18 / MUSDB18-HQ -- the standard professional multi-track stem dataset and SDR benchmark used by both tools' published results

- *Confidence calibration*:

  Not applicable in the classification sense -- neither tool outputs a probability or confidence score; the output is the separated audio signal itself (a continuous waveform per stem), not a discrete decision.


**Integration Feasibility**

- *Audio access requirement*:

  Requires raw audio bytes for the full or partial track; same chrome.tabCapture/offscreen-document, user-gesture, tab-mute, and DRM/age-restricted-content constraints as other audio-based methods in this comparison set.

- *Client vs server*:

  With the unofficial ONNX/WebGPU browser ports, Demucs separation can in principle run fully client-side, so audio never leaves the device; the official PyTorch (Demucs) and TensorFlow (Spleeter) releases require server-side or local desktop execution, meaning audio must be sent to a backend in that configuration.

- *Bundle weight cold start*:

  Demucs htdemucs model is roughly 80-160 MB depending on variant (4-stem hybrid transformer); Spleeter models are smaller (2stems roughly tens of MB, larger for 5stems) -- either is a substantial download for a browser extension bundle. Cold start is dominated by model download plus framework initialization (ONNX Runtime Web or TensorFlow.js) on first use.


**Latency**

- *Realtime capability*:

  GPU inference for Demucs runs well below real-time factor (e.g., roughly 24 seconds to separate a 4-minute song on an RTX 3090, about 0.1x real-time factor; TensorRT-optimized variants around 5 seconds); CPU-only inference is roughly 1x real-time or slower (comparable to or longer than song length). Spleeter is markedly faster (up to ~100x real-time on GPU, commonly cited as a '50x speed advantage' over Demucs) at the cost of separation quality. Neither tool is designed for streaming/frame-by-frame real-time processing -- both operate on batched clips.


**Output**

- *Identification fields*:

  None -- source separation produces audio stems (vocal/drums/bass/other), not title, artist, album, or ISRC metadata.

- *Isrc availability*: No
- *Karaoke specific outputs*:

  Primary karaoke-relevant output is the instrumental/backing-track stem (full mix minus vocals) plus the isolated vocal stem, which directly supplies the karaoke backing track and improves downstream SVD accuracy and Whisper lyric-transcription quality by removing instrumental interference. Neither tool natively outputs BPM, musical key, or word-level timing.


**Licensing & Legal**

- *Tos restrictions*:

  Both tools are MIT-licensed with no usage restrictions on the code itself; the material legal consideration instead comes from applying separation to copyrighted YouTube audio to produce a derivative 'backing track' for playback/redistribution, which is a copyright question independent of either tool's own license.

- *Risk tolerance note*:

  MIT licensing removes the tool-level legal risk present in MERT/MuQ (no non-commercial restriction on the software); the remaining risk is entirely about the legality of processing and using copyrighted source audio to produce karaoke backing tracks -- a product-level policy question rather than a tooling-license one.


**Pipeline Role**

- *Cascade position*:

  Enrichment step that runs after a video has already been classified as music (and ideally after preliminary title/artist resolution), since separation is comparatively expensive; its outputs feed both the SVD stage and the lyric-transcription stage, plus the karaoke backing-track output directly.

- *Failure mode*:

  Fails by degrading audio quality (artifacts, bleed-through between stems, muffled or thin separation) rather than by producing a wrong classification -- a visible but non-catastrophic product defect (a lower-quality backing track or noisier input to ASR) rather than a confidently wrong title/artist answer.

- *Cost model at scale*:

  No vendor per-query fee since both are self-hosted; cost is compute time (GPU strongly preferred for practical latency) scaling with the number of songs processed per session -- meaningfully more compute-intensive than the purely metadata-based methods in this comparison set, representing a real infrastructure cost at scale if run server-side.

- *Geo region availability*: No geo-gating -- both are fully self-hosted, downloadable, and runnable anywhere.

**Uncertain fields** (excluded above, listed for reference)

- classification_or_hitrate
- pitch_speed_cover_robustness
- catalog_language_bias
- api_availability
- chrome_extension_usability
- breakage_risk

---

### VGGish

**Basic Info**

- *Name*: VGGish
- *Type*:

  Embedding extractor typically paired with a downstream classifier (not a ready-made music/non-music classifier by itself)

- *Maintainer*:

  Google (Sound Understanding team, Google Research); released via tensorflow/models (research/audioset/vggish)


**Technical Approach**

- *Method*:

  Embedding-based — VGG-style 2D CNN over a 96x64 log-mel spectrogram window, producing a 128-dim embedding per ~1s of audio; a music/speech/other decision requires training a separate classifier head on top, since VGGish itself does not output class probabilities

- *Required input*: Raw audio waveform, resampled to 16kHz mono
- *Minimum clip length*: ~1s per embedding frame (960ms log-mel window analyzed per ~1s of audio)

**Accuracy & Reliability**

- *Evaluation dataset*:

  AudioSet (original VGGish baseline paper); commonly reused as a general-purpose feature extractor evaluated indirectly via downstream tasks (e.g. Frechet Audio Distance, various MIR transfer-learning benchmarks) rather than being evaluated directly on GTZAN, MUSAN, or MagnaTagATune

- *Confidence calibration*:

  No built-in calibrated score — VGGish alone outputs raw embeddings, not probabilities. Any usable threshold depends entirely on a classifier a developer trains on top of the embeddings, so out-of-the-box there is nothing to calibrate


**Integration Feasibility**

- *Api availability*:

  Free, open-source (Apache 2.0), no API keys — runs as a local TensorFlow model; Google does not offer a hosted VGGish inference API

- *Chrome extension usability*:

  No official browser/TF.js/WASM port exists from Google; the canonical implementation depends on TF-Slim (deprecated). Community re-implementations exist (e.g. Keras/PyTorch ports such as torchvggish) but nothing officially supported for in-browser JS — using it would require self-converting to TF.js/ONNX (plus the same MV3 wasm-bundling constraints as other WASM runtimes) or running a backend proxy

- *Audio access requirement*:

  Would require raw audio if run client-side, with the same tabCapture caveats (user gesture, tab-mute risk, DRM/age-restriction breakage) as other methods here; more realistically, given the lack of a browser port, audio would need to be sent to a backend server for inference, raising extra privacy/ToS considerations about streaming captured YouTube audio off-device

- *Client vs server*:

  Not practical for pure client-side use without custom conversion work; realistically deployed as server-side inference today, meaning audio (or extracted features) would leave the user's machine unless a team invests in building and maintaining a browser port

- *Bundle weight cold start*:

  Original VGGish checkpoint is roughly 291MB (unquantized, full precision) — far too large for a Chrome extension bundle or reasonable cold start without conversion/quantization; Google has not published an official lightweight or quantized variant

- *Breakage risk*:

  tensorflow/models research/audioset/vggish sits in the 'research' (community-supported, not officially maintained) section of the TF models repo and depends on deprecated tf.slim; high risk of bit-rot, and there is no active JS ecosystem port to lean on — any browser adoption path is a from-scratch, unsupported engineering effort


**Output**

- *Identification fields*:

  None — VGGish produces embeddings only, not song title, artist, album, or ISRC; a complete downstream identification system would need to be built on top

- *Isrc availability*: No
- *Karaoke specific outputs*:

  None — no BPM, musical key, vocal/instrumental activity, or word-level timing output; these would require additional models trained on top of the embeddings


**Licensing & Legal**

- *Tos restrictions*:

  Apache 2.0 licensed code/model, so no direct YouTube ToS exposure by itself (it doesn't touch YouTube's APIs); if audio is instead sent to a remote server for inference, that introduces its own separate data-handling/ToS surface

- *Risk tolerance note*:

  The main practical risk is not legal ToS but engineering: because there is no official browser support, any 'unofficial' JS/WASM port a team builds is entirely unvetted and self-supported, unlike more actively community-patched surfaces such as ytmusicapi or SongRec


**Pipeline Role**

- *Cascade position*:

  Poor fit as a lightweight always-on client-side gate given the lack of browser support and the large checkpoint; more realistically usable as a fallback/enrichment embedding source within a server-side pipeline rather than client-side

- *Failure mode*:

  As a bare embedding model it has no native 'answer' to be wrong about — failure mode depends entirely on whatever classifier is built on top; if misused directly as a classifier, it would fail silently with no meaningful native music/non-music output

- *Cost model at scale*:

  If self-hosted for server-side inference, cost scales with server compute time (GPU/CPU) per request; there is no Google-imposed usage fee since it is open-source, but also no free managed API, so all infrastructure cost sits with the developer

- *Geo region availability*:

  No region gating — open-source weights are downloadable from GitHub globally; the only geo consideration would be the region of a self-hosted inference server, which is entirely the developer's own choice


**Uncertain fields** (excluded above, listed for reference)

- classification_or_hitrate
- pitch_speed_cover_robustness
- catalog_language_bias
- realtime_capability

---

### YAMNet via MediaPipe Audio Classifier (@mediapipe/tasks-audio)

**Basic Info**

- *Name*: YAMNet via MediaPipe Audio Classifier (@mediapipe/tasks-audio)
- *Type*:

  Classifier — on-device audio event/scene classification (music vs. non-music is one of 521 AudioSet-derived labels)

- *Maintainer*:

  Google (MediaPipe / Google AI Edge team); underlying YAMNet model from Google Research's Sound Understanding team


**Technical Approach**

- *Method*:

  ML classification — MobileNet_v1 depthwise-separable-convolution CNN over log-mel spectrogram frames, packaged as a TFLite model and exposed through MediaPipe's Task API (WASM runtime)

- *Required input*:

  Raw audio waveform, resampled to 16kHz mono (e.g. captured via Web Audio API / chrome.tabCapture MediaStream, or an ArrayBuffer)

- *Minimum clip length*:

  0.975s per inference frame (15,600 samples @ 16kHz); MediaPipe streams overlapping frames continuously, so a usable label distribution emerges within roughly 1-2s


**Accuracy & Reliability**

- *Evaluation dataset*:

  AudioSet (weakly-labeled, YouTube-derived) balanced/eval segments; not officially evaluated on GTZAN, MUSAN, or MagnaTagATune

- *Confidence calibration*:

  Yes — per-class sigmoid probabilities (multi-label, not softmax) with a configurable scoreThreshold, giving a tunable precision/recall trade-off; however multiple GitHub issues (#5781, #5786) report scoreThreshold behaving inconsistently in the streaming audio mode


**Integration Feasibility**

- *Api availability*:

  Free, keyless, no rate limits — fully on-device inference via the @mediapipe/tasks-audio npm package, with model weights fetched once from Google Cloud Storage (storage.googleapis.com/mediapipe-models) or TF Hub

- *Chrome extension usability*:

  Runs entirely client-side (WASM + TFLite), so no CORS issue for inference itself, but requires 'wasm-unsafe-eval' in the MV3 CSP script-src, and the default FilesetResolver pattern loads the WASM binary from a CDN at runtime — this must instead be bundled inside the extension package to avoid a Chrome Web Store 'remote code' rejection (this exact failure mode has been reported for the sibling library transformers.js, issue #839); the .tflite model weight file itself is data rather than executable code, so runtime fetch/caching of it carries lower policy risk

- *Audio access requirement*:

  Requires raw audio samples; in a Chrome extension this means chrome.tabCapture (needs a user gesture and the tabCapture permission) or capturing a media element directly — tabCapture can mute the tab's normal output unless the captured stream is explicitly re-routed to the speakers, and it does not work on DRM-protected or many age-restricted embeds

- *Client vs server*:

  Fully on-device — no audio or video ID needs to leave the user's machine (model weights are fetched from Google's CDN once, not user data); good privacy posture and offline-capable after first load

- *Breakage risk*:

  MediaPipe Tasks is an actively maintained Google product, but multiple recent GitHub issues (#5781, #5786, reported Dec 2024) describe scoreThreshold/streaming-mode classification bugs specific to Audio Classifier, and a prior tasks-audio/tasks-vision compatibility issue (#4737) shows the API surface has shifted across releases — version pinning is advisable


**Latency**

- *Realtime capability*:

  Yes — designed for streaming/real-time use via the AUDIO_STREAM running mode; sub-second per-frame inference makes it suitable for near-instant in-browser classification


**Output**

- *Identification fields*:

  None — outputs class labels and scores only (e.g. 'Music', 'Speech', 'Singing'); it does not identify song title, artist, album, or ISRC

- *Isrc availability*: No — not an identification system, so no ISRC or catalog metadata is produced
- *Karaoke specific outputs*:

  None directly — some AudioSet classes (Singing, A capella, Music, Speech) can act as a weak proxy for vocal/instrumental activity, but there is no BPM, musical key, or word-level timing output


**Licensing & Legal**

- *Tos restrictions*:

  No YouTube-scraping ToS exposure, since this method only classifies audio the extension has already legitimately captured from the tab; Apache 2.0-licensed model/runtime, with no restriction on reselling classification output itself

- *Risk tolerance note*:

  The primary legal/policy risk is not YouTube ToS but the Chrome Web Store's MV3 remote-code policy (see chrome_extension_usability) — this is a documented, previously-enforced policy affecting WASM-based ML libraries like this one, not a merely theoretical concern


**Pipeline Role**

- *Cascade position*:

  Gate — cheap, on-device, always-run first stage to decide music vs. non-music before invoking an expensive song-ID/fallback service

- *Failure mode*:

  Fails silently with a low-confidence/ambiguous label (e.g. mixed Music+Speech scores) rather than a confidently wrong song identity — a safe failure mode for a gate stage; a false positive (classifying non-music as music) just triggers an unnecessary downstream ID call rather than a wrong on-screen credit

- *Cost model at scale*:

  Effectively $0 marginal cost per query — inference runs on the user's own device; the only cost is one-time model download bandwidth (roughly 15-20MB, cached after first load), with no per-call fees or usage ceiling

- *Geo region availability*:

  No region gating — fully client-side; the only external dependency is reachability of Google's CDN (storage.googleapis.com) for the initial model/wasm download, which is globally available outside markets where Google services are blocked


**Uncertain fields** (excluded above, listed for reference)

- classification_or_hitrate
- pitch_speed_cover_robustness
- catalog_language_bias
- bundle_weight_cold_start

---

## Metadata resolution & lyrics

### BetterLyrics cf-api

**Basic Info**

- *Name*: BetterLyrics cf-api
- *Type*: Metadata resolver / lyrics aggregation backend (proxy API)
- *Maintainer*:

  better-lyrics GitHub organization (open-source community project); companion backend to the Better Lyrics browser extension


**Technical Approach**

- *Method*:

  Metadata parsing + API aggregation: takes a YouTube video ID, calls the YouTube Data API v3 to extract title/artist/duration from video metadata, then queries Musixmatch (word-by-word/synced lyrics via an unofficial, reverse-engineered 'usertoken' web-client flow) and LRCLIB (synced/plain lyrics) as parallel/fallback sources, and returns a merged JSON payload with multiple lyric variants

- *Required input*:

  YouTube video ID (required); optional manual artist/song/album/duration query parameters to override or refine metadata inference

- *Minimum clip length*:

  0s - no audio analysis is performed; resolution is purely from video metadata/title text via a single HTTP call, so a result is available as soon as the video ID is known


**Accuracy & Reliability**

- *Pitch speed cover robustness*:

  None inherent - this is a text/metadata lookup, not audio fingerprinting, so it has no built-in tolerance for pitch-shifted, sped-up/nightcore, slowed/reverb, or cover-version reuploads. It only succeeds when the YouTube title/description metadata literally names the correct official artist/title; fan edits, cover-channel uploads, and 'sped up' remix titles will typically fail or mismatch.

- *Evaluation dataset*:

  None published - no formal accuracy benchmark or evaluation dataset exists for this project; it has not been tested against AudioSet, GTZAN, MUSAN, or similar corpora since it does no audio analysis.

- *Confidence calibration*:

  No calibrated, user-facing confidence score is returned. Missing lyrics simply come back as null fields, and the API includes an internal 'debugInfo' object (lyric matching variance/mean) used for its own internal heuristics, but this is not exposed as a public, tunable threshold.


**Integration Feasibility**

- *Api availability*:

  Free and open-source; self-hostable on Cloudflare Workers (Workers free tier is generous). The public instance used by the Better Lyrics extension is gated by a Cloudflare Turnstile bot-check plus a JWT exchange rather than a simple API key, and no published rate limits or pricing exist for that hosted instance. Self-hosting requires a Google API key (YouTube Data API v3, which itself carries a free daily quota) plus Turnstile and JWT secrets.

- *Chrome extension usability*:

  Directly callable from a Chrome extension once its domain is declared in host_permissions - it is a standard JSON REST API over HTTPS with CORS handled by the Cloudflare Worker. However, it requires first completing a Turnstile challenge flow to obtain a JWT bearer token before the /lyrics endpoint can be called, which is a heavier integration step than a plain keyed fetch and effectively behaves as its own anti-abuse gateway.

- *Audio access requirement*:

  None - operates purely on the YouTube video ID and optional text metadata; no raw audio capture, no user gesture, and no interaction with DRM-protected content is required.

- *Client vs server*:

  The YouTube video ID (and any optional title/artist text) leaves the user's machine and is sent to the better-lyrics Cloudflare Worker, and transitively to the YouTube Data API, Musixmatch, and LRCLIB. Using the publicly hosted instance means trusting a third-party, community-run backend with viewing-adjacent data unless the project is self-hosted instead.

- *Bundle weight cold start*:

  Zero client bundle weight since this is a remote HTTP call, not a bundled model or library. Cold start is dominated by network round-trip plus the one-time Turnstile/JWT exchange; steady-state calls benefit from server-side caching (3-day cache for lyric hits, 10-minute cache for misses), making repeat lookups fast.

- *Breakage risk*:

  Moderate-to-high at the data-source level: it depends on an unofficial, reverse-engineered Musixmatch 'usertoken' flow (a dedicated Musixmatch.ts module manages token acquisition/refresh) that can break whenever Musixmatch changes its undocumented internal API. The parent better-lyrics/better-lyrics repo is actively maintained (858 GitHub stars, 79 forks as of 2026-09-11), so fixes do land, but the cf-api companion repo itself is small and low-traffic (9 stars, 4 forks), meaning a break there has a small blast radius limited mostly to this backend's own adopters.


**Latency**

- *Realtime capability*:

  Yes for the lookup itself - a single HTTP round trip, typically sub-second once the JWT has been obtained, since this is a text/metadata API rather than audio processing and carries no per-frame or per-second processing bottleneck.


**Output**

- *Identification fields*:

  Song title, artist, album, duration, YouTube videoId, video description, plus multiple lyric variants in the response: Musixmatch word-by-word synced lyrics, Musixmatch line-synced lyrics, LRCLIB synced lyrics, and LRCLIB plain lyrics. No explicit numeric confidence score field is included in the documented response schema.

- *Isrc availability*:

  No - the documented response schema does not include an ISRC field; matching is performed via title/artist/album/duration text rather than an ISRC join key.

- *Karaoke specific outputs*:

  Word-by-word (syllable-adjacent) timing is available via Musixmatch's richsync format when that source has data; otherwise line-level LRC timing from LRCLIB or Musixmatch's standard synced lyrics. No BPM, musical key, or vocal/instrumental activity detection is provided - output is limited to lyric text plus timestamps.


**Licensing & Legal**

- *Tos restrictions*:

  Built on the YouTube Data API v3 (subject to Google API ToS on quota usage and permitted data use), Musixmatch's platform (whose official terms restrict scraping and reselling of lyric content; this project instead reverse-engineers an internal web-client usertoken flow rather than using Musixmatch's official partner API), and LRCLIB (explicitly free, open, and MIT-licensed, designed for exactly this kind of integration). Building a commercial product directly on the unofficial Musixmatch access path carries real ToS exposure.

- *Risk tolerance note*:

  This project is a concrete real-world instance of the 'official policy vs. widely-deployed unofficial practice' gap referenced across this research: its Musixmatch.ts module exists specifically to obtain and refresh an internal usertoken the same way Musixmatch's own web player does, rather than going through a sanctioned developer API key - directly analogous in spirit to ytmusicapi/SongRec-style reverse engineering, and something a downstream integrator should treat as fragile and legally gray if used for a commercial product.


**Pipeline Role**

- *Cascade position*:

  Enrichment (and effectively a fallback) - it assumes a YouTube video ID is already known and that the video has already been gated/classified as music elsewhere in the pipeline; it is not a music/non-music classifier itself, only the lyrics-and-metadata enrichment step that runs after classification.

- *Failure mode*:

  Fails silently/gracefully - returns null lyric fields (or a 400 error with 'A Song wasn't provided and couldn't be inferred' when metadata inference fails outright) rather than fabricating lyrics, so it does not by itself risk a confidently-wrong karaoke overlay. However, an incorrect YouTube-metadata-derived artist/title could still propagate a plausible-but-wrong lyric match downstream.


**Uncertain fields** (excluded above, listed for reference)

- classification_or_hitrate
- catalog_language_bias
- cost_model_at_scale
- geo_region_availability

---

### Deezer public API

**Basic Info**

- *Name*: Deezer public API
- *Type*: Metadata-resolver (keyless public catalog search/lookup API, not audio fingerprinting)
- *Maintainer*: Deezer S.A. (French music streaming company) - 'Deezer for Developers' platform.

**Technical Approach**

- *Method*:

  Text-based metadata search (GET /search?q=...) and ID-based lookup (GET /track/{id}, /album/{id}, /artist/{id}) against Deezer's music catalog, returning structured JSON that directly includes ISRC. An additional undocumented/unofficial endpoint pattern (/track/isrc:<ISRC>) allows a direct ISRC-to-track lookup per community reports. Purely metadata/catalog matching - no audio analysis.

- *Required input*:

  A title/artist search text string, a Deezer numeric track/album/artist ID for lookup, or (via the undocumented shortcut) an ISRC string.

- *Minimum clip length*: 0s - text/ID-based query only.

**Accuracy & Reliability**

- *Pitch speed cover robustness*:

  Not applicable in the audio-fingerprinting sense (text/ID-based only, no audio analysis). Like the other metadata resolvers, robustness to nightcore/sped-up/pitch-shifted YouTube reuploads depends entirely on upstream title-cleaning before querying, since Deezer's public API has no audio-fingerprint matching capability.

- *Evaluation dataset*:

  None - commercial catalog product, not benchmarked against AudioSet, GTZAN, MUSAN, MagnaTagATune, or MAEB.

- *Confidence calibration*:

  No explicit numeric match-confidence score is returned on search results. Deezer does return a 'rank' integer field per track (observed as 810329 for a well-known track in this session's live test), which appears to be a popularity/relevance-style signal, but it is not documented as a calibrated identification-confidence score, so no formal threshold-tuning guidance exists.


**Integration Feasibility**

- *Api availability*:

  Fully keyless for read-only catalog search/lookup (no OAuth needed for /search, /track, /album, /artist); OAuth 2.0 is only required for user-scoped write/library actions, which this project would not need. Rate limit is commonly cited at roughly 50 requests per 5 seconds per IP. Entirely free for this level of usage with no disclosed metered paid tier for basic catalog reads.

- *Chrome extension usability*:

  Directly tested in this session via live curl: api.deezer.com returns CORS preflight-related headers (access-control-allow-methods, access-control-allow-headers, access-control-allow-credentials: true) but did NOT return an access-control-allow-origin header on a direct GET request with an Origin header set. This means the browser will block reading the cross-origin response by default in a Chrome extension content/page context, confirming third-party reports that Deezer's API is not reliably browser-CORS-enabled for arbitrary origins; a backend proxy (or Deezer's own JSONP output=jsonp fallback) is effectively required for direct client-side use.

- *Audio access requirement*: None - pure text/ID-based metadata lookup; no raw audio access is needed.
- *Client vs server*:

  Because CORS is not fully open (confirmed above), this project would in practice need to route the search text or ISRC through its own first-party backend proxy rather than calling Deezer directly from the extension's client-side code - no raw audio is involved in either case, but the query would pass through an intermediary server rather than going client-to-Deezer directly.

- *Bundle weight cold start*:

  No model or library needs to be bundled; a single lightweight JSON HTTP request per lookup. Cold-start is normal network latency only - live requests in this session returned promptly.

- *Breakage risk*:

  Low-to-moderate. Deezer has run this public API for well over a decade with a stable, documented core surface (search/track/album/artist). However, the convenient /track/isrc:<ISRC> direct-lookup shortcut is explicitly noted by the community as undocumented/unofficial (per a Deezer Community forum thread titled 'API search for all tracks by ISRC' requesting this be made official), so it could change or be removed without notice - though the fully documented /search endpoint was directly confirmed in this session to reliably surface an 'isrc' field in its normal results, reducing reliance on the undocumented shortcut.


**Latency**

- *Realtime capability*:

  Yes - JSON responses observed in this session were fast, well within budget for near-instant in-browser lookups; the ~50 req/5-sec rate limit is generous enough for typical single-video-lookup usage patterns.


**Output**

- *Identification fields*:

  Directly confirmed via live API calls in this session: /search and /track/{id} responses include title, title_short, isrc, duration (seconds), artist.name, album.title, release_date, bpm (present as a field but observed returning 0/unpopulated for at least one mainstream track tested), gain (loudness in dB), rank (a relevance/popularity integer), and preview (a 30-second MP3 preview URL). No standalone match-confidence score field exists.

- *Isrc availability*:

  Yes - directly confirmed in this session that ISRC is returned as a top-level 'isrc' field on both the /search results and the /track/{id} lookup response (example observed: "isrc":"GBDUW0000059" for Daft Punk - Harder, Better, Faster, Stronger), making Deezer one of the most immediately useful ISRC join-key sources among the items researched, obtainable in the same call as the initial search.

- *Karaoke specific outputs*:

  Partial - the track object includes a documented bpm field and a gain (loudness) field, but bpm was observed returning 0 (unpopulated) for at least one well-known track directly tested in this session, suggesting inconsistent population rather than a universally reliable BPM source. No musical key, vocal/instrumental activity split, or word-level lyric timing is provided.


**Licensing & Legal**

- *Tos restrictions*:

  Directly located and reviewed in this session (Deezer's 'Terms of use of Deezer for Developers'): non-commercial use of the Services is the default permitted scope; using the API/SDKs for commercial purposes requires submitting a request and obtaining Deezer's prior approval, granted at Deezer's sole discretion, and Deezer explicitly does not certify/guarantee approval for either commercial or non-commercial use. This is a meaningful constraint if this karaoke extension intends to monetize.

- *Risk tolerance note*:

  Official first-party API with an explicit, located developer ToS - legal risk is generally low for non-commercial, attribution-appropriate use, but the commercial-use approval requirement is a real, discretionary gate that should be planned for early if the extension intends to monetize, rather than treated as an informal/unofficial-scraping-style risk.


**Pipeline Role**

- *Cascade position*:

  Strong candidate as a primary enrichment/ISRC-join step directly following a title-derived search, since ISRC is confirmed available in the same call as the search itself - more immediately capable in a single call than iTunes (no ISRC) and simpler to integrate than Spotify (no OAuth required for reads), though the confirmed CORS gap pushes it toward a server-side enrichment step rather than a pure direct-from-client call.

- *Failure mode*:

  Fails relatively safely - a non-matching search returns an empty data array (consistent with behavior observed in this session) rather than a confidently wrong answer. Because search is fuzzy text-based rather than strictly ID-based, an imprecise query could still rank a wrong cover/remix/karaoke-instrumental track first, a residual risk for karaoke accuracy.


**Uncertain fields** (excluded above, listed for reference)

- classification_or_hitrate
- catalog_language_bias
- cost_model_at_scale
- geo_region_availability

---

### Discogs API

**Basic Info**

- *Name*: Discogs API
- *Type*:

  Metadata-resolver -- REST API over Discogs' community-curated discography/marketplace database; not an audio identifier, fingerprinter, or classifier

- *Maintainer*:

  Discogs (Zink Media, Inc.); crowdsourced/community-curated content with a small core engineering team, public developer docs at discogs.com/developers


**Technical Approach**

- *Method*:

  Metadata parsing/search -- REST/JSON API (api.discogs.com) exposing /database/search (fielded text search on title, artist, label, catalog number, barcode, format, genre, style, year, country, credit) plus /releases/{id}, /masters/{id}, /artists/{id}, /labels/{id} detail lookups against ~19M+ user-submitted release listings; no fingerprinting or ML classification involved

- *Required input*:

  Title/artist text, or catalog number/barcode/label text, as query parameters -- no audio required at any point

- *Minimum clip length*: 0 seconds -- pure text/metadata lookup, no audio needed at all

**Accuracy & Reliability**

- *Pitch speed cover robustness*:

  N/A in the audio sense (text-based, not audio matching); Discogs' data model does distinguish a 'Master Release' from individual pressings/reissues/remixes/versions, which helps disambiguate official version variants -- but it has no mechanism to recognize an unofficial fan-made nightcore/sped-up/pitch-shifted reupload, since those are not catalogued releases at all

- *Evaluation dataset*:

  No formal MIR benchmark; only self-reported catalog size from community-submitted monthly XML/JSON data dumps (data.discogs.com), not accuracy testing against a standard dataset such as AudioSet, GTZAN, MUSAN, or MagnaTagATune

- *Confidence calibration*:

  /database/search returns a ranked list of candidate releases/masters with no explicit numeric relevance or confidence-score field; the caller must implement its own text-match scoring to accept/reject candidates, the same limitation this project already handles for LRCLIB


**Integration Feasibility**

- *Api availability*:

  Free -- keyed via Consumer Key/Secret ('Discogs Auth', higher rate) or a Personal Access Token for read-only public-data access, or OAuth 1.0a for acting on a user's own account; unauthenticated requests are limited to 25/min and authenticated requests to 60/min, tracked as a moving average over a 60-second window and throttled by source IP; a unique User-Agent header is mandatorily required on every request; no paid tier exists for the core database API

- *Chrome extension usability*:

  Directly usable from a Chrome extension, including from content-script context and not just a background service worker -- a direct live request to api.discogs.com/database/search returned `access-control-allow-origin: *` in its response headers (verified 2026-09-10), so no backend proxy is required purely for CORS purposes; however the Consumer Key/Secret or Personal Access Token would be exposed in shipped extension code unless routed through a lightweight token-issuing backend to prevent quota abuse

- *Audio access requirement*:

  None -- pure text/metadata API; no audio capture is needed at all, so it works even for DRM-protected or age-restricted videos as long as page title/artist text is available

- *Client vs server*:

  Fully client-side capable given the open CORS policy -- only the derived search-query text (title/artist) needs to leave the user's machine; no audio or persistent video-ID-linked data is required, though the embedded API key/token is exposed client-side, creating a quota-abuse risk unless mitigated

- *Bundle weight cold start*:

  Zero bundle weight -- plain HTTP/JSON fetch, no model or library to ship; response in direct testing (2026-09-10) was fast (well under a second including full pagination/link headers), though Discogs publishes no formal latency SLA

- *Breakage risk*:

  Long-running (operating since 2000), well-documented, commercial-grade platform with a large third-party ecosystem (official/community client libraries in Python, Ruby, PHP, JS, Rust, R, plus MCP server wrappers); rate-limit and auth mechanics have been stable for years per community forum threads, so breakage risk from the API itself is low -- residual risk centers on crowdsourced data quality/completeness (e.g. missing/inconsistent ISRC data) rather than API availability


**Latency**

- *Realtime capability*:

  Sub-second to low-second typical response times for search/lookup calls based on direct 2026-09-10 testing; no published hard SLA, but well within budget for in-browser, near-instant use as a text-driven enrichment step


**Output**

- *Identification fields*:

  Search results include title, artist(s), label, catalog number, format, genre/style tags, year, country, community have/want counts, and a resource_url for full release detail; full release records can include free-text notes/tracklists where a contributor manually transcribed an ISRC, but there is no dedicated, reliably-populated, structured/searchable ISRC field, and no confidence/match score is returned by the API itself

- *Karaoke specific outputs*:

  None -- no BPM, musical key, vocal/instrumental activity detection, or lyric timing of any kind; Discogs is a discography/marketplace database only, not a lyrics or audio-analysis service


**Licensing & Legal**

- *Risk tolerance note*:

  Discogs is an official, publicly documented, ToS-governed API (not a reverse-engineered surface), so it carries materially lower legal risk than scraping-based approaches like ytInitialData or SongRec; the main practical caution is the 'no reselling access/content' clause, which should inform how derived metadata is cached/exposed downstream in a commercial extension


**Pipeline Role**

- *Cascade position*:

  Best suited as an enrichment/fallback step for niche, electronic, DJ, remix, or physical-release-only content once a candidate title/artist string exists (e.g. from title-normalizer output) -- not a primary gate, since it offers no audio-based classification or fingerprinting capability at all

- *Failure mode*:

  Fails silently with an empty results array for unmatched queries rather than confidently hallucinating a wrong release, since it is a real crowdsourced database rather than a generative system; a loosely-matched or wrong-version candidate (e.g. wrong remix/pressing of a correct song) could still be accepted by weak downstream match-scoring

- *Cost model at scale*:

  Free at any request volume, bounded only by the fixed per-IP rate limit (60 req/min authenticated) -- no monetary cost, but a popular shared extension with many concurrent users routed through a single infrastructure IP/token could bump against that per-key/per-IP ceiling under heavy simultaneous load


**Uncertain fields** (excluded above, listed for reference)

- classification_or_hitrate
- catalog_language_bias
- isrc_availability
- tos_restrictions
- geo_region_availability

---

### iTunes/Apple Search API

**Basic Info**

- *Name*: iTunes/Apple Search API
- *Type*: Metadata-resolver (free public catalog search/lookup API, not audio fingerprinting)
- *Maintainer*:

  Apple Inc. - the free, legacy 'iTunes Search API' / iTunes Store search service, distinct from the separate paid Apple Music API (MusicKit).


**Technical Approach**

- *Method*:

  Text-based metadata search (GET /search?term=...) and ID-based lookup (GET /lookup?id=...) against Apple's iTunes Store/Apple Music catalog, returning structured JSON of matching store entries (songs, albums, artists, etc.). Purely metadata text-matching/parsing - no audio analysis of any kind.

- *Required input*:

  A title/artist search text string, or an Apple-specific identifier (iTunes track/collection/artist ID, or in some cases UPC/AMG ID) for lookup; no audio or video file is needed.

- *Minimum clip length*: 0s - text/metadata query only.

**Accuracy & Reliability**

- *Pitch speed cover robustness*:

  Not applicable in the audio sense (text search only, no audio fingerprinting). A raw, messy YouTube title (e.g., 'Song Name (Nightcore Version) [1 Hour Loop]') would likely return zero or incorrect matches unless cleaned by upstream title-normalization logic first; robustness is entirely a function of the caller's query-construction, not the API itself.

- *Evaluation dataset*:

  None - no formal accuracy benchmark exists; it is a commercial store-search product, not evaluated against AudioSet, GTZAN, MUSAN, MagnaTagATune, or MAEB.

- *Confidence calibration*:

  No calibrated confidence score is returned - results are a ranked list of catalog matches for the query term with no numeric relevance score exposed to the caller, so callers must implement their own fuzzy string-similarity threshold on the returned trackName/artistName fields.


**Integration Feasibility**

- *Api availability*:

  Fully keyless - no signup, API key, or authentication of any kind is required. Rate limit is informally documented/observed at roughly 20 calls per minute per IP; Apple's own wording describes this as 'approximately' and 'subject to change,' i.e. not a contractual SLA, and developer forum reports describe occasional unexplained 403 errors under load. Entirely free with no paid tier for the public Search/Lookup API.

- *Chrome extension usability*:

  Directly verified in this session via live curl requests: both the /search and /lookup endpoints return 'access-control-allow-origin: *' in their response headers, confirming the API is directly fetchable client-side from a Chrome extension with no backend proxy required. This contradicts some third-party blog claims of no CORS support, which likely describe a different/older Apple endpoint (e.g., the RSS feed service) rather than this Search/Lookup API.

- *Audio access requirement*: None - pure text search/lookup; no raw audio access is needed at any point.
- *Client vs server*:

  Only the search query text (derived from the YouTube video's title/channel metadata, not raw audio) leaves the client toward Apple's servers - no audio data ever needs to leave the user's machine, though the query text itself does reveal what content the user is viewing to Apple's servers.

- *Bundle weight cold start*:

  No library or model needs to be bundled; a single lightweight JSON GET request per lookup. Cold-start is just normal network latency with no local model download involved.

- *Breakage risk*:

  Historically very stable - this API has operated in largely the same form since the mid-2000s iTunes Store era with no announced deprecation found. The absence of an ISRC field appears to be a longstanding, permanent limitation (see isrc_availability) rather than a recent regression. Main operational risk is the informally-enforced, non-contractual rate limit and occasional undocumented 403 responses reported by developers.


**Latency**

- *Realtime capability*:

  Yes - responses are typically fast (well under a second in normal conditions), suitable for near-instant in-browser lookups once a clean search term is available; the informal ~20 req/min cap is the main constraint on burst/high-frequency usage rather than per-call latency.


**Output**

- *Identification fields*:

  Returns trackName, artistName, collectionName (album), releaseDate, primaryGenreName, trackViewUrl, artworkUrl (multiple sizes), previewUrl (30-second audio preview), trackId, collectionId, and similar iTunes Store metadata fields. No confidence/relevance score field, and confirmed no ISRC field (see isrc_availability).

- *Isrc availability*:

  No - confirmed via an Apple Developer Forums discussion thread ('Is it possible to use ISRC codes with the iTunes Lookup API?') that the free iTunes Search/Lookup API does not expose an ISRC field, despite a passing 2014 WWDC mention; this is a real functional gap versus Deezer/Spotify/MusicBrainz for ISRC-based cross-source joining, and means this API cannot itself serve as an ISRC join key source.

- *Karaoke specific outputs*:

  None - no BPM, musical key, vocal/instrumental activity split, or word-level lyric timing. The API does provide a 30-second previewUrl audio clip, which could theoretically feed into a separate audio-analysis tool, but is not itself a karaoke-specific output.


**Licensing & Legal**

- *Risk tolerance note*:

  This is an official, Apple-sanctioned public API with clear (if informally enforced) usage terms - low legal/ToS risk compared to scraping-based approaches. The main practical risk is the non-contractual nature of the rate-limit numbers (no SLA), so production use should gracefully handle intermittent 403 responses rather than assume a guaranteed quota.


**Pipeline Role**

- *Cascade position*:

  Well suited as a cheap, fast enrichment/verification step after an initial title-derived candidate guess (e.g., to confirm/normalize artist and title spelling and fetch artwork/preview), not as the primary identification source or as an ISRC-based join-key provider given the confirmed lack of ISRC data.

- *Failure mode*:

  Fails relatively safely - a non-matching query returns resultCount: 0 with an empty results array rather than a confidently wrong answer. However, because matching is fuzzy free-text search rather than ID-based, an imprecise query can occasionally rank a same-titled cover, karaoke-instrumental, or remix track above the intended original, which is a real residual risk for a karaoke overlay.

- *Cost model at scale*:

  Free with no published pricing tier at all - effectively $0 marginal cost at any realistic per-session query volume for this project. The best cost profile among the items researched in this batch, constrained only by the informal ~20 req/min per-IP throttle, which can be mitigated with client-side pacing or a shared cache.


**Uncertain fields** (excluded above, listed for reference)

- classification_or_hitrate
- catalog_language_bias
- tos_restrictions
- geo_region_availability

---

### LRCLIB (lrclib.net)

**Basic Info**

- *Name*: LRCLIB (lrclib.net)
- *Type*:

  Metadata-resolver -- a free, community-run lyrics database and search API; also usable as a title/artist search+match backend (current implementation in this project)

- *Maintainer*:

  tranxuanthang (independent open-source developer) and a volunteer community; server source at github.com/tranxuanthang/lrclib (Rust/Axum + SQLite3), no corporate backing


**Technical Approach**

- *Method*:

  Metadata parsing/search -- a REST API over a community-contributed lyrics database. `/api/search?q=` performs free-text search matched against track/artist/album name and duration; `/api/get` performs a structured exact lookup by track/artist/album/duration. This project's own client (src/lrclib/client.ts) calls `/api/search`, and src/core/search-query.ts builds the query string with Latin/Thai/CJK-script-aware extraction logic to compensate for LRCLIB's search not tokenizing non-Latin scripts well.

- *Required input*:

  Title text (track name), optionally artist name, album name, and duration as query parameters -- no audio required at any point

- *Minimum clip length*: 0 seconds -- pure text/metadata lookup, no audio needed at all

**Accuracy & Reliability**

- *Pitch speed cover robustness*:

  Not applicable in the audio-fingerprinting sense -- LRCLIB matches on title/artist text only, so it is inherently unaffected by nightcore, pitch-shifting, speed changes, or cover/live audio differences. However, video titles containing edit-descriptor noise (e.g. '(Nightcore)', '(Sped Up)') can pollute the search query text itself, which this project's title-normalizer/search-query logic must strip before querying.

- *Evaluation dataset*:

  No formal benchmark dataset -- evidence is empirical/anecdotal, drawn from this project's own production query-tuning test cases (documented directly in search-query.ts) rather than a standard MIR dataset such as AudioSet, GTZAN, MUSAN, or MagnaTagATune

- *Confidence calibration*:

  The search endpoint returns a list of candidate records with no relevance or confidence score supplied by LRCLIB itself -- the calling application must implement its own match-scoring (this project uses a separate match-scorer module referenced from search-query.ts) to rank and accept/reject candidates.


**Integration Feasibility**

- *Api availability*:

  Completely free and keyless (no registration or API key required); the project documents 'generous' informal rate limiting rather than a hard published quota. Clients must self-identify via a custom `Lrclib-Client` request header (since browsers forbid setting `User-Agent` from fetch) rather than an API key. A GitHub issue opened January 2026 reports response times degrading to 8-10 seconds under increased traffic, with community discussion of informal client-side throttling (e.g. 30-60 requests/minute, 200-500ms delay between requests) rather than an enforced quota; the server does return HTTP 429 with a Retry-After header when it does throttle, which this project's client.ts already handles via a dedicated LrclibRateLimitError.

- *Chrome extension usability*:

  Directly callable from a Chrome extension -- LRCLIB's API supports CORS (Access-Control-Allow-Origin), confirmed both by community documentation and by this project's own client.ts calling it directly via `fetch()` with no backend proxy required.

- *Audio access requirement*:

  None -- a pure text/metadata API. No audio capture is needed at all, so it works even for DRM-protected or age-restricted videos where only the page's title/artist text (not the audio stream) is required.

- *Client vs server*:

  Fully client-side capable -- the extension calls lrclib.net directly from the user's browser. Only the derived search-query text (song title/artist extracted from the YouTube page) leaves the machine; no audio and no video ID-linked media data is transmitted.

- *Bundle weight cold start*:

  Zero bundle weight -- no model or library to ship, just a plain HTTP fetch call. Latency is pure network round-trip time; the project has itself observed multi-second response times during periods of high server load per the GitHub issue discussed above.

- *Breakage risk*:

  Single volunteer-maintained server with no published SLA or uptime guarantee. A 2026 community-reported performance-degradation issue and an unresolved rate-limiting discussion indicate real risk of slowdowns, or of the free service eventually changing its terms; mitigating factors are that the project is presently active, has an engaged surrounding ecosystem (the LRCGET desktop client, multiple third-party language wrapper libraries), and the server itself is open-source and self-hostable as a fallback.


**Output**

- *Identification fields*:

  Returns trackName, artistName, albumName, duration, an `instrumental` boolean flag, plainLyrics, and syncedLyrics (LRC-format time-tagged lyrics). Does not return ISRC and does not return a numeric match-confidence score.

- *Isrc availability*:

  No -- LRCLIB's schema has no ISRC field; matching is by track/artist/album/duration text rather than an industry identifier, so it cannot serve as an ISRC join key for downstream lookups.

- *Karaoke specific outputs*:

  syncedLyrics provides line-level (not word-level) LRC-format timing, directly usable for karaoke lyric display and scrolling. No BPM, musical key, or vocal/instrumental activity data is provided; the `instrumental` boolean flag only distinguishes instrumental-only tracks from vocal ones.


**Licensing & Legal**

- *Risk tolerance note*:

  This is the closest thing to an 'openly offered but legally informal' surface in the comparison set -- the API is intentionally and publicly offered for third-party use (unlike scraped ytInitialData or SongRec's reverse-engineered Shazam protocol), but the underlying lyrics content's own copyright/licensing chain is not publicly documented, so the residual risk sits at the content layer rather than the API-access layer.


**Pipeline Role**

- *Cascade position*:

  Primary metadata-resolution/search backend already in production use (current implementation) -- functions as a low-cost, always-callable enrichment/lookup step once a candidate title/artist string is available (e.g. from title-normalizer or music-attribution extraction), rather than acting as an initial gate or an expensive last-resort fallback.

- *Failure mode*:

  Fails silently -- an empty search-results array or a handled 429 rate-limit response (explicit LrclibRateLimitError in this project's client.ts) rather than a confidently wrong lyrics match; a poorly-formed query (e.g. unhandled foreign-script text) could still return an unrelated candidate that downstream match-scoring is responsible for filtering out.

- *Cost model at scale*:

  Completely free with no published pricing tier or hard cap. The only 'cost' risk is the shared community server's own capacity, which has shown load-related slowdowns -- at scale (many extension users querying the same free volunteer-run server) this project's traffic itself indirectly contributes to the kind of degradation described in the GitHub performance issue, rather than incurring a monetary API cost.


**Uncertain fields** (excluded above, listed for reference)

- classification_or_hitrate
- catalog_language_bias
- realtime_capability
- tos_restrictions
- geo_region_availability

---

### MusicBrainz + ListenBrainz

**Basic Info**

- *Name*: MusicBrainz + ListenBrainz
- *Type*:

  Metadata-resolver / identifier - free, open, community-maintained relational catalog and URL-relationship graph (MusicBrainz), plus a listen-history/recommendation and MBID-mapping layer (ListenBrainz). Not audio fingerprinting itself.

- *Maintainer*: MetaBrainz Foundation (non-profit organization that operates both MusicBrainz and ListenBrainz).

**Technical Approach**

- *Method*:

  Structured relational database lookup/search. MusicBrainz stores 'recording' entities with explicit, human-curated relationships to external 'url' entities - directly confirmed in this session that literal YouTube video URLs are tagged with a 'free streaming' relationship type pointing to specific recording MBIDs - plus direct ISRC-to-recording mappings. ListenBrainz layers a metadata-lookup endpoint that resolves free-text artist/recording/release name strings to MusicBrainz IDs (MBIDs), plus a 'MessyBrainz' raw-string-to-MBID mapping service. This is not audio fingerprinting itself, but is the canonical database that the separate AcoustID (Chromaprint-based) fingerprinting service links its acoustic fingerprints back to.

- *Required input*:

  A YouTube URL (for the reverse url-relationship lookup, directly verified working in this session), an ISRC, a MusicBrainz Recording ID (MBID), or free-text artist/title strings (for search or ListenBrainz's lookup endpoint). No audio is required for the MusicBrainz/ListenBrainz lookups themselves.

- *Minimum clip length*:

  0s - metadata-only; no audio needed for these lookups (only the separate AcoustID/Chromaprint fingerprinting pipeline that populates matches into this database would need actual audio, and that is a distinct tool outside this item's scope).


**Accuracy & Reliability**

- *Pitch speed cover robustness*:

  Not applicable in the audio sense directly (URL/ID/text relationship matching, not fingerprinting). Notably, because the underlying edit data is curated per distinct video, MusicBrainz can in principle precisely distinguish official vs. alternate uploads/versions - directly observed in this session where two different YouTube video IDs for the same recording each had their own separate 'free streaming' relationship entries, with one explicitly flagged via a 'video' attribute as the official music video. However, this precision only exists where an editor has actually done the linking work; unlinked nightcore/sped-up/live reuploads will simply return no relationship at all rather than a wrong match.

- *Evaluation dataset*:

  None - not a benchmarked classifier; MusicBrainz/ListenBrainz are community-maintained relational metadata databases, not evaluated against AudioSet, GTZAN, MUSAN, MagnaTagATune, or MAEB.

- *Confidence calibration*:

  No dedicated numeric identification-confidence field. MusicBrainz's text search does return a 0-100 'score' field per result (directly confirmed in this session's ISRC search response, which returned "score":100 for an exact ISRC match), representing search relevance rather than a calibrated match-confidence probability. The URL-relationship reverse lookup (YouTube URL to recording) is effectively binary - either a curated relationship exists or it does not, with no partial-confidence gradation.


**Integration Feasibility**

- *Api availability*:

  Fully free and keyless for read-only lookups on both MusicBrainz and ListenBrainz. MusicBrainz's rate limit is strictly enforced at 1 request per second per client (a descriptive User-Agent header is required, and violators risk IP blocking) - directly confirmed via official documentation. ListenBrainz's newer /1/metadata/lookup/ and /1/metadata/recording/ endpoints now require an authorization token specifically 'because of possible abuse by AI scrapers' - directly confirmed via official ListenBrainz documentation in this session - a recent tightening versus what was previously a more open surface.

- *Audio access requirement*:

  None for the MusicBrainz/ListenBrainz metadata-lookup path used for identification - pure URL/ID/text-based queries. Audio would only be needed if this project separately integrated the AcoustID/Chromaprint fingerprinting layer (a distinct item/tool) to generate the acoustic fingerprint that maps into this database.

- *Bundle weight cold start*:

  No model or library bundle is needed; lightweight JSON REST calls only. Cold start is standard network latency - live test requests in this session (search and relationship-lookup calls) returned promptly with no observed unusual delay.

- *Breakage risk*:

  Low for the core MusicBrainz open-data API and its CC0-licensed core dataset (long-running, non-profit-backed, over two decades of stable operation). ListenBrainz's newly-added auth-token requirement on metadata-lookup endpoints (confirmed this session, attributed explicitly to AI-scraper abuse) signals an active tightening trend worth monitoring going forward. Separately, MusicBrainz's digest-authentication method is marked deprecated for removal by August 2027, but this is irrelevant to the read-only, unauthenticated lookups this project would primarily use.


**Latency**

- *Realtime capability*:

  Individual calls are fast (low-latency JSON responses directly observed in this session for both search and relationship-lookup endpoints), but the strict, confirmed 1 request/second global-per-client rate limit is a meaningful constraint for any bursty or high-frequency in-browser usage pattern - workable for a single gated/cached per-video lookup, not for rapid successive queries.


**Output**

- *Identification fields*:

  Directly confirmed via live API responses in this session: recording lookups return title, artist-credit (name, MBID, aliases/sort-name, disambiguation), length (duration in ms), first-release-date, ISRC (via the dedicated /ws/2/isrc/<isrc> endpoint or an isrcs include parameter), and a url-rels relationship list containing per-platform links (directly observed: Spotify, Apple Music, Deezer, Tidal, YouTube, and YouTube Music) plus a 0-100 relevance score on search results. No single dedicated 'confidence' field distinct from the search-relevance score exists.

- *Isrc availability*:

  Yes - directly confirmed in this session: GET /ws/2/recording/?query=isrc:<ISRC> correctly resolved a known ISRC to the matching MusicBrainz recording with a perfect relevance score (100), and conversely a recording lookup with inc=isrcs can retrieve associated ISRC(s) for a given recording. This makes MusicBrainz a solid, directly-verified bidirectional ISRC join point alongside Deezer.

- *Karaoke specific outputs*:

  None natively present in MusicBrainz/ListenBrainz core data - no BPM, musical key, vocal/instrumental activity split, or word-level lyric timing fields were observed in this session's live responses. MusicBrainz is fundamentally a metadata/relationship graph, not an audio-analysis service; such data would need to come from a separate tool elsewhere in the pipeline.


**Licensing & Legal**

- *Tos restrictions*:

  Directly confirmed via official MusicBrainz documentation in this session: the core MusicBrainz database is CC0 (effectively public domain - no attribution or commercial-use restriction), the most permissive licensing among all items researched in this batch. The docs also state 'non-commercial use of this web service is free,' and that MusicBrainz users grant the MetaBrainz Foundation the right to license the data commercially, implying heavy/commercial-scale use of the live web service (as distinct from the downloadable CC0 database dump) may warrant a separate commercial arrangement with MetaBrainz. Some supplementary content (the live data feed, documentation) is licensed CC-BY-NC-SA 3.0 (non-commercial only, attribution required), which is narrower than the CC0 core data.

- *Risk tolerance note*:

  Among the lowest-risk items researched in this batch from a licensing standpoint, given CC0 core data and an official, sanctioned public API. The main practical friction is process/rate-limit discipline (1 req/sec, required User-Agent header) rather than legal risk. ListenBrainz's new auth-token requirement on metadata endpoints is a minor added integration step but still an official, sanctioned path rather than a ToS gray area.


**Pipeline Role**

- *Cascade position*:

  Strong candidate as a free, high-precision enrichment/cross-reference step - particularly valuable via the directly-demonstrated reverse YouTube-URL-to-canonical-recording lookup, which can run in parallel with, or as a cross-check/fallback to, Odesli, since both resolve YouTube URLs to canonical metadata via different (both ultimately crowdsourced/curated) mechanisms. Best combined with another source (e.g., Deezer or iTunes text search) for videos that lack a community-curated relationship.

- *Failure mode*:

  Fails silently/gracefully - an unmatched YouTube URL simply returns an empty relations array (the expected behavior for uncurated content) rather than a confidently wrong answer, since matching is against explicit, human-curated relationship edges rather than probabilistic/generative matching.

- *Cost model at scale*:

  Free at any realistic scale for read-only lookups - no metered pricing exists; the only real constraint is the strict, confirmed 1 request/second rate limit, which is a throughput ceiling rather than a monetary cost. MetaBrainz solicits voluntary donations/sponsorship to fund the non-profit's operations, but this is not a required cost for API access.


**Uncertain fields** (excluded above, listed for reference)

- classification_or_hitrate
- catalog_language_bias
- chrome_extension_usability
- client_vs_server
- geo_region_availability

---

### Musicfetch

**Basic Info**

- *Name*: Musicfetch
- *Type*:

  Metadata-resolver -- commercial aggregation API unifying music links/metadata across 40+ streaming and content services in a single call; not an audio identifier/fingerprinter (input is a source URL, ISRC, UPC, or text query, not raw audio) and not a classifier

- *Maintainer*:

  Musicfetch (commercial SaaS vendor, musicfetch.io); paid subscription product aimed at developers, labels, and artists


**Technical Approach**

- *Method*:

  Metadata aggregation/search across partner services -- four documented endpoints: text search (title/artist/album), URL lookup (resolve one platform's track/album URL to matches on other platforms), ISRC lookup, and UPC lookup; internally Musicfetch queries and normalizes data from 40+ integrated services (Spotify, Apple Music, YouTube Music, Deezer, Amazon Music, Tidal, SoundCloud, NetEase, QQ Music, JioSaavn, Genius, Discogs, MusicBrainz, Shazam, and others) and returns a unified response, rather than performing its own audio fingerprinting or ML classification

- *Required input*:

  A source platform URL, an ISRC code, a UPC code, or a free-text title/artist/album query -- no raw audio required

- *Minimum clip length*: 0 seconds -- pure metadata lookup, no audio needed

**Accuracy & Reliability**

- *Evaluation dataset*:

  No public benchmark dataset; coverage claims are self-reported vendor marketing copy rather than measured against AudioSet/GTZAN/MUSAN/MagnaTagATune/MAEB-style evaluation


**Integration Feasibility**

- *Api availability*:

  Paid-only, keyed via an `x-token` header issued from the account dashboard (up to 5 tokens per account); no perpetual free production tier -- only a 7-day free trial capped at 5,000 requests that requires payment card details upfront and auto-bills after the trial. Paid plans confirmed live on musicfetch.io (2026-09-10): Starter $50/month for 50,000 requests, 6 req/min, $10 per additional 10k; Business $100/month for 150,000 requests, 20 req/min, $20 per additional 25k; Enterprise $200/month for 500,000 requests, 40 req/min, $50 per additional 100k plus TikTok links and priority engineering support

- *Chrome extension usability*:

  CORS is dynamically permissive -- a direct live request to api.musicfetch.io with an Origin header reflected back `access-control-allow-origin: <that origin>` in testing (2026-09-10), meaning it is technically callable straight from a content-script/page context without an extension host_permissions workaround; however doing so client-side would ship the paid, metered `x-token` credential inside the extension bundle, a serious quota-theft/billing-abuse risk given the $50-200+/month metered plans, so a backend proxy holding the token server-side is strongly advisable despite CORS technically allowing direct calls

- *Audio access requirement*:

  None -- pure metadata/text API; works without any audio capture, including on DRM-protected or age-restricted video pages, as long as a title/artist string, or a resolvable source URL/ISRC/UPC, is available

- *Client vs server*:

  Technically callable client-side given the open CORS policy, but the exposed metered `x-token` (billed per request, no generous free ceiling) makes a server-side proxy the practically necessary architecture to avoid an attacker draining a paid quota; only the derived title/artist text or platform URL would need to leave the user's machine if proxied


**Licensing & Legal**

- *Risk tolerance note*:

  As an official, paid, ToS-governed commercial aggregator (not a reverse-engineered scraping surface), Musicfetch carries low direct legal risk to the integrating developer; the practical risk is entirely commercial/financial (client-exposed token abuse against a metered paid plan) rather than legal/ToS exposure


**Pipeline Role**

- *Cascade position*:

  Best suited as a consolidated enrichment/fallback layer once a candidate title/artist (or a resolvable platform URL/ISRC) is already available -- valuable specifically for reducing integration surface area (one paid API instead of 40 separate unofficial scrapers), but its per-request cost and low rate limits on entry-tier plans argue against using it as an always-on first gate for every video played

- *Cost model at scale*:

  Metered and relatively expensive at consumer-extension scale: the cheapest plan is $50/month for 50,000 requests (roughly $0.001/request within-plan, $10/10k overage) with only 6 requests/minute -- a free browser extension issuing one lookup per user session would burn through 50,000 requests quickly at any meaningful user base and requires committing to a recurring paid subscription from day one, since there is no perpetual free tier, only a time/request-capped trial


**Uncertain fields** (excluded above, listed for reference)

- classification_or_hitrate
- pitch_speed_cover_robustness
- catalog_language_bias
- confidence_calibration
- bundle_weight_cold_start
- breakage_risk
- realtime_capability
- identification_fields
- isrc_availability
- karaoke_specific_outputs
- tos_restrictions
- failure_mode
- geo_region_availability

---

### Musixmatch richsync (word-level sync)

**Basic Info**

- *Name*: Musixmatch richsync (word-level sync)
- *Type*:

  Metadata-resolver -- word-level ('richsync') synchronized lyrics data returned by Musixmatch's lyrics API, available both via an official licensed developer endpoint and a widely-used unofficial reverse-engineered desktop-app endpoint; not an audio identifier/classifier itself, though Musixmatch also separately offers audio-fingerprint-based track recognition elsewhere in its product line

- *Maintainer*:

  Musixmatch S.r.l. (commercial vendor, official developer platform at developer.musixmatch.com); the unofficial richsync access path is maintained by independent open-source developers (e.g. moehmeni/syncedlyrics, ThetaDev/musixmatch-inofficial) reverse-engineering the Musixmatch desktop/mobile app's private API


**Technical Approach**

- *Method*:

  Metadata parsing via a documented richsync data model -- the official API method namespace includes `track.richsync.get`, returning a `richsync_body` of per-word timestamp objects (word text plus start/end offsets), a materially finer grain than the line-level-only `subtitle_body` LRC format returned by `track.subtitle.get`; the widely-used unofficial route accesses the same underlying capability via Musixmatch's desktop-app-internal host (apic-desktop.musixmatch.com), obtaining a `usertoken` through `token.get` rather than a registered developer API key, then calling `track.search`/`track.richsync.get` directly

- *Required input*:

  Title/artist text (or a Musixmatch internal track/commontrack ID from a prior search) -- no audio required

- *Minimum clip length*: 0 seconds -- pure text/metadata lookup

**Accuracy & Reliability**

- *Pitch speed cover robustness*:

  Not applicable in the audio sense, since matching is by title/artist text, not audio; richsync data is tied to a specific official studio recording/version, so it would not correctly apply to a live version, cover, or tempo-altered edit even if the underlying words match -- word timing would drift or be wrong against any audio that isn't the exact reference recording

- *Evaluation dataset*:

  No public benchmark; catalog and feature-coverage claims are vendor marketing statements, not measured against a standard MIR dataset such as AudioSet, GTZAN, MUSAN, or MagnaTagATune

- *Confidence calibration*:

  Richsync responses are deterministic catalog lookups (present or absent for a given matched track), not probabilistic matches, so there is no tunable confidence score in the classifier sense; the practical 'confidence' question is binary availability (whether a given track has richsync data at all) rather than a graded score


**Integration Feasibility**

- *Chrome extension usability*:

  The unofficial apic-desktop.musixmatch.com endpoint was directly verified (2026-09-10) to return `access-control-allow-origin: *`, meaning it is technically callable straight from browser JS including content-script context with no backend proxy required purely for CORS purposes; the official licensed developer.musixmatch.com API would instead require a backend to protect commercial API credentials and enforce paid-license terms rather than exposing them client-side in a shipped extension

- *Audio access requirement*:

  None -- pure text/metadata lookup via either the official or unofficial endpoint; no audio capture needed at all

- *Client vs server*:

  Via the unofficial endpoint, technically fully client-side capable given the open CORS policy (only the title/artist query text would leave the user's machine); via the official licensed API, a backend intermediary is the practically and contractually correct architecture to keep commercial API credentials server-side

- *Bundle weight cold start*:

  Zero bundle weight either way -- plain HTTP/JSON fetch, no model or library to ship; the unofficial path requires an extra round-trip to fetch/cache a `usertoken` via `token.get` before the richsync call itself, adding one additional network hop versus a directly-keyed official API call

- *Breakage risk*:

  High for the unofficial path -- by definition a reverse-engineered private endpoint of Musixmatch's own desktop app, with no SLA and explicit community acknowledgment (per ThetaDev/musixmatch-inofficial and related projects) that this bypasses Musixmatch's API auth/ToS; historical reports across related unofficial Musixmatch client libraries include intermittent 403 errors on richsync calls specifically. The official licensed path is far more stable (commercial SLA) but requires signing/maintaining a paid licensing agreement, itself a business/contractual dependency rather than a technical one


**Latency**

- *Realtime capability*:

  Simple keyed/token HTTP lookup, well within a real-time in-browser budget once a track match is established (comparable latency profile to a single LRCLIB or Discogs call); the unofficial path's extra token-fetch hop adds modest overhead but is still sub-second-scale in typical usage


**Output**

- *Identification fields*:

  richsync_body returns per-line objects each containing a word-level timing array (word text plus millisecond start/end offsets within the line); does not include album or ISRC in the richsync response itself, since those would come from an accompanying track-metadata lookup (e.g. `track.search` / `matcher.track.get`) in the same API family -- no numeric match-confidence score, since it is a deterministic catalog lookup rather than a probabilistic identification

- *Karaoke specific outputs*:

  This is precisely the differentiator this item is scoped around -- genuine word-level ('richsync') timing suitable for karaoke-style progressive word highlighting, a materially finer grain than LRCLIB's line-level-only LRC output; no BPM, musical key, or vocal/instrumental-activity data is part of this endpoint


**Licensing & Legal**

- *Tos restrictions*:

  Two very different postures depending on access path: the official developer.musixmatch.com API is governed by Musixmatch's commercial developer terms, which require a paid commercial license for full lyric text, commercial use, and (per this item's own framing) very likely for richsync access specifically; the unofficial apic-desktop.musixmatch.com path is explicitly documented by the reverse-engineering community itself as bypassing that authentication/ToS, which is precisely the 'licensing is the blocker' framing given for this item

- *Risk tolerance note*:

  This is the canonical example the field definition is pointing at -- official Musixmatch policy (paid commercial license required for full/synced lyrics at scale) directly conflicts with a widely-deployed unofficial practice (community libraries like syncedlyrics and musixmatch-inofficial calling the free, keyless, CORS-open apic-desktop endpoint at no cost); teams must explicitly choose between paying for a compliant commercial license or accepting the same category of ToS/legal risk as ytInitialData scraping or SongRec


**Pipeline Role**

- *Cascade position*:

  Positioned as a premium enrichment step specifically for karaoke-grade word-level timing, layered on top of (not replacing) a cheaper line-level source like LRCLIB -- only worth invoking once a track is already confidently identified, given both the licensing cost of the official path and the fragility of the unofficial path

- *Failure mode*:

  Fails silently with no richsync data returned (falling back to line-level or no sync) when a track lacks word-level production or the lookup misses, rather than fabricating word timings; the unofficial path's failure mode additionally includes outright request failures (403s, token expiry) that must be handled as a hard miss rather than surfaced as a wrong-but-confident karaoke overlay

- *Cost model at scale*:

  Official path: gated behind a negotiated commercial licensing agreement (pricing not publicly listed, quote-based, layered on top of the already-limited free developer tier of roughly 2,000 calls/day at ~30% lyric coverage) -- likely the most expensive/least accessible option among the items compared in this research set for a bootstrapped extension. Unofficial path: free and unmetered in practice, but with no cost predictability guarantee, since Musixmatch could rate-limit, block by IP/User-Agent, or change the token scheme at any time with zero notice, which would eliminate this capability entirely for all users simultaneously (single point of failure)


**Uncertain fields** (excluded above, listed for reference)

- classification_or_hitrate
- catalog_language_bias
- api_availability
- isrc_availability
- geo_region_availability

---

### NetEase Cloud Music & QQ Music lyrics APIs

**Basic Info**

- *Name*: NetEase Cloud Music & QQ Music lyrics APIs
- *Type*:

  Metadata-resolver -- unofficial/reverse-engineered lyrics and track-search APIs of two major Chinese streaming platforms (NetEase Cloud Music / 网易云音乐 and Tencent QQ Music / QQ音乐); neither offers a public official third-party developer program for this data, so all third-party access is via community reverse-engineering of each app's internal web/mobile API

- *Maintainer*:

  NetEase Cloud Music (NetEase, Inc.) and QQ Music (Tencent Music Entertainment) operate the underlying services and internal endpoints; third-party access is maintained entirely by independent open-source communities -- e.g. the now-archived Binaryify/NeteaseCloudMusicApi and its many active forks/derivatives in Node.js/TypeScript/C#/Rust/Go for NetEase, and jsososo/QQMusicApi, Rain120/qq-music-api, UtoYuri/QQMusicApi for QQ Music -- with no official corporate maintainer for third-party API access on either service


**Technical Approach**

- *Method*:

  Metadata parsing/scraping against each platform's internal, not publicly documented, web API -- NetEase: `music.163.com/api/search/pc` for track search and `music.163.com/api/song/lyric` for lyrics (a further signed/encrypted 'eapi' surface also exists and is what most community wrapper projects reverse-engineer for richer functionality such as streaming URLs); QQ Music: endpoints such as `c.y.qq.com/soso/fcgi-bin/client_search_cp` and the newer consolidated `u.y.qq.com/cgi-bin/musicu.fcg` gateway, both returning lyric payloads that are typically base64-encoded (and in some response variants further encrypted/obfuscated) rather than sent as plain text

- *Required input*:

  Title/artist text search query, or a platform-internal track/song ID from a prior search -- no audio required

- *Minimum clip length*: 0 seconds -- pure text/metadata lookup

**Accuracy & Reliability**

- *Pitch speed cover robustness*:

  Not applicable in the audio sense, since matching is by title/artist text, not audio fingerprinting; as with any text-search-based lookup, edit-descriptor noise in a source video title (e.g. nightcore/sped-up tags) would need to be stripped before querying, the same limitation as LRCLIB/Discogs

- *Catalog language bias*:

  This is precisely where these two services outperform Western-centric sources -- NetEase and QQ Music are the two dominant streaming platforms within mainland China and hold direct licensing relationships covering the large majority of C-pop, Mandopop/Cantopop, mainland/Taiwan/Hong Kong artists, and China-market anime/game tie-in and VTuber-adjacent music that is comparatively thin or entirely absent on Musixmatch, Genius, and LRCLIB (all Western-community-driven and Latin-script-search-biased, per this project's own documented LRCLIB Thai/CJK-tokenization workaround); conversely, both are correspondingly weaker for Western mainstream pop/rock catalogs versus Spotify/Apple-Music-linked sources

- *Evaluation dataset*:

  No formal MIR benchmark; evidence for catalog strength is inferred from each platform's market position (user base, licensing deals) and from the widespread community practice of adding NetEase (and less commonly QQ Music) as a supplementary provider specifically to plug Chinese-catalog gaps in Western-centric lyrics tools (e.g. syncedlyrics including NetEase, and open community feature requests such as Spotube issue #1491 asking to add QQ Music/NetEase as lyric sources), rather than a structured dataset

- *Confidence calibration*:

  Neither platform's search endpoint returns an explicit numeric match-confidence/relevance score to the caller -- results are a ranked list of candidate tracks that the calling application must itself score/disambiguate by title/artist text similarity, the same limitation as LRCLIB and Discogs


**Integration Feasibility**

- *Api availability*:

  Both are free and keyless for the specific legacy endpoints used by community tooling (no registration, no API key), but neither is an officially sanctioned third-party developer program. NetEase's legacy `/api/search/pc` and `/api/song/lyric` require no authentication token beyond ambient session cookies -- a live 2026-09-10 test returned a normal 200 OK with a freshly-issued NMTID cookie and no login required. QQ Music's endpoints generally expect a `Referer: https://y.qq.com/`-style header and, for many other (non-search) endpoints, a signed/session-cookie flow. Neither platform publishes a rate limit, and both are liable to silent breakage since they are internal-only surfaces not intended for third-party use

- *Chrome extension usability*:

  Neither endpoint returns CORS headers -- live 2026-09-10 tests of `music.163.com/api/search/pc` and the QQ Music `c.y.qq.com`/`u.y.qq.com` endpoints showed no `access-control-allow-origin` header in the response, so a content-script-context fetch would be blocked by the browser. Calling these from a Chrome extension therefore requires making the request from the extension's background service worker with the target hosts declared in `host_permissions` (the standard MV3 workaround for CORS-less third-party APIs), not a page-context fetch

- *Audio access requirement*: None -- pure text/metadata lookup for both platforms; no audio capture required
- *Client vs server*:

  Callable from the extension's own background service worker without a first-party backend proxy (via the host_permissions workaround above), so only the derived title/artist query text needs to leave the user's machine -- sent directly to NetEase's/Tencent's own servers rather than to a first-party intermediary, which has its own privacy-disclosure implications (Web Store listings should disclose that user-derived search text is sent to third-party Chinese platform servers)

- *Bundle weight cold start*:

  Zero bundle weight -- plain HTTP/JSON fetch, no model or library to ship; NetEase's legacy endpoint responded in well under a second in direct testing, and QQ Music's u.y.qq.com gateway was similarly fast, though neither offers a published SLA and both are known within the community to occasionally require cookie/session bootstrapping that adds a small extra round-trip on first use

- *Breakage risk*:

  High and well-documented -- the most prominent community reverse-engineering project for NetEase (Binaryify/NeteaseCloudMusicApi) was archived by its owner in April 2024 and is now read-only, though numerous actively-maintained forks/derivatives (Node.js/TS variants updated as recently as August 2026, a Go implementation, a C# port) have continued the effort. QQ Music equivalents (jsososo/QQMusicApi, Rain120/qq-music-api) show similarly fragmented but ongoing community maintenance. Net effect: no single authoritative, guaranteed-stable implementation exists for either platform -- breakage is common and recovery depends entirely on which fork/community effort remains active at any given time, a materially higher risk profile than an official commercial API like Discogs or AudD


**Latency**

- *Realtime capability*:

  Simple unauthenticated/lightly-authenticated HTTP lookups with fast observed response times (sub-second in direct 2026-09-10 testing for both platforms' search endpoints) make this technically fast enough for in-browser real-time use, latency-wise; the practical constraint on real-time reliability is the undocumented/unstable nature of the endpoints themselves rather than raw speed


**Output**

- *Identification fields*:

  NetEase search returns track ID, title, artist(s), album, and duration; its lyric endpoint returns an `lrc` field containing LRC-format line-level synced lyrics text (and, for some tracks, a separately available translated-lyrics field). QQ Music search/lyric endpoints similarly return title, artist(s), album, song ID (songmid), and a lyric payload -- but that payload is typically base64-encoded, and in some response variants further encrypted, and must be decoded/decrypted client-side before use. Neither platform's public-facing search/lyric response includes ISRC or a numeric match-confidence score

- *Isrc availability*:

  No -- neither platform's community-documented search/lyric endpoints expose ISRC as a returned field; matching and retrieval are keyed by each platform's own internal numeric track/song ID rather than an industry-standard identifier


**Licensing & Legal**

- *Risk tolerance note*:

  Squarely in the category the field definition names directly -- these are unofficial, reverse-engineered internal-API scraping patterns closely analogous to ytInitialData scraping or SongRec's reverse-engineered Shazam protocol, widely used by the open-source community (dozens of active forks/wrapper libraries in multiple languages) despite carrying no formal license or sanctioned-use status from NetEase or Tencent; the practical community norm treats this as acceptable personal/hobbyist-tooling risk, but it is a meaningfully different risk posture than Discogs' openly-documented, ToS-governed API


**Pipeline Role**

- *Cascade position*:

  Best positioned as a language/region-targeted fallback or enrichment step -- specifically valuable when Western-centric sources (LRCLIB, Musixmatch, Genius) miss on C-pop/Mandopop/Cantopop or China-market anime/VTuber-adjacent content, rather than as a default first-gate for all traffic, both because of its higher breakage risk and because it offers no advantage for Western-catalog content

- *Failure mode*:

  Fails silently with an empty results array or a decode/decrypt failure on the lyric payload when a track isn't found or the endpoint's internal format has changed, rather than fabricating a confident-but-wrong answer -- the more concerning practical failure mode is a silent full breakage of the underlying unofficial endpoint (e.g. following the kind of archival/discontinuation seen with the primary NeteaseCloudMusicApi project), which requires active monitoring/fallback-provider logic rather than per-query error handling alone

- *Cost model at scale*:

  Free with no published pricing or metering for the raw platform endpoints themselves, since this is unofficial access to internal application infrastructure rather than a metered commercial product -- the real 'cost' at scale is operational/engineering: maintaining a working integration against undocumented endpoints that can change or be blocked without notice, plus the risk that heavy third-party traffic volume could itself accelerate the platform tightening access (rate-limiting/blocking by IP or user-agent pattern) for all users of that access path


**Uncertain fields** (excluded above, listed for reference)

- classification_or_hitrate
- karaoke_specific_outputs
- tos_restrictions
- geo_region_availability

---

### Odesli / Songlink API

**Basic Info**

- *Name*: Odesli / Songlink API
- *Type*: Metadata-resolver / cross-platform link-resolution identifier (not audio fingerprinting)

**Technical Approach**

- *Method*:

  Given a URL from one streaming/media platform (or a {platform,type,id} triple such as an ISRC), Odesli looks up the matching entity across ~15+ other platforms (Spotify, Apple Music, YouTube, YouTube Music, Deezer, Tidal, Amazon Music, SoundCloud, Pandora, Google Play, Napster, Bandcamp, Audius, Audiomack) via its own internal catalog-matching database and returns the equivalent links/IDs on each. It is pure metadata/ID cross-referencing, not audio analysis.

- *Required input*:

  A URL (e.g., a youtube.com/watch?v= link) OR a platform+type+id triple (e.g., platform=isrc,type=song,id=<ISRC>); no audio or video file is required.

- *Minimum clip length*: 0s - no audio needed at all; resolution is triggered purely by URL/ID/text input.

**Accuracy & Reliability**

- *Pitch speed cover robustness*:

  Not applicable in the audio-fingerprinting sense (no audio analysis). Robustness depends entirely on whether the specific YouTube video is the official/rights-holder-linked upload already present in Odesli's catalog; sped-up/nightcore/pitch-shifted fan reuploads or live-version videos not independently catalogued on other platforms will simply fail to resolve a match rather than being misidentified.

- *Evaluation dataset*:

  None published. This is a production consumer link-resolution product, not benchmarked against AudioSet, GTZAN, MUSAN, MagnaTagATune, or MAEB - it does not use audio-classification techniques at all.

- *Confidence calibration*:

  No numeric confidence score is returned. Effectively binary per platform: either the platform's entry appears in entitiesByUniqueId/linksByPlatform (match found) or it is absent (no match). No tunable threshold exists because there is no continuous score to threshold.


**Integration Feasibility**

- *Audio access requirement*:

  None - no audio access is needed at all; only the YouTube URL or video ID string is required as input.

- *Client vs server*:

  Only the YouTube video URL/ID leaves the client toward Odesli's servers - no raw audio or user audio stream is involved either way. This is a comparatively strong privacy posture versus audio-fingerprinting approaches, though the fact of which video the user is viewing is still disclosed to a third-party server.


**Latency**

- *Realtime capability*:

  Individual lookups are architecturally lightweight (a single metadata GET), likely fast enough for near-instant in-browser use, but the unauthenticated 10 requests/minute cap makes it unsuitable for high-frequency or bursty in-browser usage across many users without a shared cache or a pooling backend proxy.


**Output**

- *Karaoke specific outputs*:

  None - no BPM, musical key, vocal/instrumental activity, or word-level lyric timing; the service only resolves title/artist/cross-platform links.


**Licensing & Legal**

- *Risk tolerance note*:

  This is an official first-party API (not a scraping or reverse-engineered surface), so there is comparatively little ToS gray area, but it is functionally being wound down as a self-serve product for new users. The practical risk to manage is business continuity/availability (it may become unavailable or heavily throttled) rather than legal risk - a fallback path (e.g., directly querying iTunes/Deezer/MusicBrainz instead of relying solely on Odesli) is advisable.


**Pipeline Role**

- *Cascade position*:

  Best used as an enrichment/cross-referencing step after a video is already suspected to be music (e.g., following a cheap title-heuristic or classifier gate) - it cannot itself act as the music/non-music gate since it takes no raw audio and is not a classifier. When it does return a match, it is a low-cost, high-precision way to obtain canonical title/artist plus equivalent links on other platforms for further enrichment.

- *Failure mode*:

  Fails silently/gracefully - an unmatched URL returns an empty or partial linksByPlatform/entitiesByUniqueId rather than a confidently wrong answer, since it performs real cross-platform ID/link matching rather than generative guessing.


**Uncertain fields** (excluded above, listed for reference)

- maintainer
- classification_or_hitrate
- catalog_language_bias
- api_availability
- chrome_extension_usability
- bundle_weight_cold_start
- breakage_risk
- identification_fields
- isrc_availability
- tos_restrictions
- cost_model_at_scale
- geo_region_availability

---

### Spotify Web API (search + ISRC lookup)

**Basic Info**

- *Name*: Spotify Web API (search + ISRC lookup)
- *Type*:

  Metadata-resolver / identifier (OAuth-gated catalog search and track lookup, not audio fingerprinting)

- *Maintainer*: Spotify AB.

**Technical Approach**

- *Method*:

  Text-based catalog search (GET /v1/search with field filters including isrc:, track:, artist:, album:, year:, upc:, genre:) and direct track lookup by Spotify ID, returning structured track objects that include external_ids.isrc. Not audio fingerprinting - the audio-derived endpoints (Audio Features, Audio Analysis) that previously exposed tempo/key/loudness data have been removed for new API integrations as of November 27, 2024.

- *Required input*:

  An OAuth 2.0 access token (Client Credentials flow suffices for app-only/no-user-context search - no end-user login needed for catalog search) plus a text query string or an isrc: field-filtered query.

- *Minimum clip length*: 0s - text/ISRC-based query only, no audio involved.

**Accuracy & Reliability**

- *Pitch speed cover robustness*:

  Not applicable in the audio sense (text/ISRC search only, no fingerprinting). As with the other metadata resolvers, match quality depends on upstream title-cleaning before querying; Spotify's internal search-relevance ranking (not a documented fuzzy-match algorithm) determines whether a messy YouTube-derived query still surfaces the correct canonical track.

- *Evaluation dataset*:

  None - commercial catalog product, not benchmarked against AudioSet, GTZAN, MUSAN, MagnaTagATune, or MAEB.

- *Confidence calibration*:

  No explicit numeric match-confidence score exists in search results. Spotify exposes a 'popularity' integer (0-100) per track, which is a popularity/relevance signal rather than a search-match-confidence score, so callers must apply their own text-similarity threshold on the returned name/artist fields to judge match quality.


**Integration Feasibility**

- *Api availability*:

  Directly confirmed via official Spotify for Developers documentation in this session: new apps default to 'Development Mode,' capped at 5 allow-listed users, and (per a February 2026 policy change reported by TechCrunch and corroborated by official docs) the app owner must now hold an active Spotify Premium subscription just to keep the app functioning at all. 'Extended Quota Mode' (required for unlimited users / production use) has, since May 2025, been restricted to applications from legally registered organizations with an active, launched service and 250,000+ monthly active users - individual/indie/hobby developers can no longer qualify for a production-scale quota. There is no per-call monetary price, but access is effectively gated behind organizational/business eligibility rather than payment. Numeric rate-limit values are undisclosed (a rolling 30-second window; exceeding it returns 429 with a Retry-After header).

- *Chrome extension usability*:

  Requires OAuth 2.0. Per Spotify's own developer community guidance found in this session, browser-based token requests are discouraged and server-to-server token exchange is recommended for Client Credentials flow specifically because the flow requires a Client Secret that must not be exposed in client-side code. This means a backend proxy is effectively required to securely hold the secret and mint/refresh access tokens - Spotify cannot be called directly and securely from unauthenticated client-side Chrome extension code alone.

- *Audio access requirement*:

  None for the search/lookup endpoints relevant to identification - pure text/ISRC-based catalog query. (The now-removed-for-new-apps Audio Features/Audio Analysis endpoints previously derived data from Spotify's own server-side audio, never from user-supplied audio, so this was never a raw-audio-access dependency for this project either way.)

- *Client vs server*:

  Because Client Credentials requires a Client Secret that must never be exposed client-side, the search query (derived from the YouTube video's title, not raw audio) would need to pass through a first-party backend that holds the secret and proxies the call to Spotify - there is no direct, secure client-to-Spotify path from a pure browser extension without a backend component.

- *Bundle weight cold start*:

  No model or library bundle is needed; standard REST calls. Cold-start latency is dominated by the OAuth token-acquisition step (the Client Credentials token is cacheable/reusable for its lifetime, typically on the order of ~1 hour, per standard OAuth client-credentials behavior) rather than by per-search latency itself.

- *Breakage risk*:

  High and actively worsening - directly confirmed via official Spotify documentation and press coverage found in this session: November 2024 removed Audio Features, Audio Analysis, Recommendations, Related Artists, 30-second previews, Featured Playlists, and Category Playlists for new API use cases; May 2025 restricted Extended Quota Mode to registered organizations with 250k+ monthly active users; February-March 2026 further reduced Development Mode to 5 users, added a Premium-subscription requirement for the app owner, cut search result limits from a maximum of 50 down to 10 per page, and removed additional endpoint families (album releases, artist top tracks, bulk metadata requests, user profile data). Developer community sentiment on the Spotify Community forum is explicitly negative, describing the changes as favoring only large companies. This is the second most actively-deteriorating item researched in this batch, after Odesli.


**Latency**

- *Realtime capability*:

  Yes at the individual-call level (Spotify Web API search responses are typically fast, sub-second to low-hundreds-of-ms based on general API characteristics), but the Development Mode 5-user cap makes the API effectively unusable for any real multi-user Chrome extension audience unless the project separately qualifies for Extended Quota Mode, which - per the confirmed May 2025 policy - now requires 250k+ MAU as an organization.


**Output**

- *Identification fields*:

  Directly confirmed via official documentation: track objects include name, artists[].name, album (name, images, release_date), duration_ms, explicit, external_ids (isrc, ean, upc), popularity (0-100), id/uri/href, and a market-availability array (available_markets); the search endpoint's q parameter explicitly supports field filters including isrc:, track:, artist:, album:, year:, upc:, genre:.

- *Isrc availability*:

  Yes - directly confirmed via official docs that external_ids.isrc is a standard field on Spotify track objects, and the search endpoint explicitly supports an isrc: field filter for direct ISRC-to-track lookup, making Spotify one of the most complete metadata sources among the items researched, when access is actually obtainable.

- *Karaoke specific outputs*:

  None directly usable post-November-2024. Audio Features (danceability, energy, tempo-as-BPM, musical key, mode/major-minor) and Audio Analysis (bar/beat/section/segment-level timing) endpoints, which previously could have supplied BPM and musical-key data for a karaoke pipeline, are explicitly confirmed no longer accessible to new API integrations as of the November 27, 2024 changes. No vocal/instrumental separation or word-level lyric timing was ever offered by this API.


**Licensing & Legal**

- *Tos restrictions*:

  Spotify's Developer Policy and Terms of Service restrict data use (e.g., limits on bulk caching/redistribution of catalog metadata beyond permitted display use, and restrictions on long-term storage of certain data types); Extended Quota Mode now contractually requires organizational registration and a formal compliance review by Spotify (up to a stated six-week approval process). The November 2024 endpoint removals were explicitly attributed by Spotify and press coverage to concerns about exposing users' listening-pattern data via Recommendations/Related Artists, indicating a generally more restrictive ToS trajectory.

- *Risk tolerance note*:

  This is an official, heavily-governed first-party API with minimal 'unofficial workaround' culture to fall back on if formally denied Extended Quota access (unlike, e.g., ytInitialData scraping, which has an active community patching workarounds). The realistic risk for this project is not ToS violation but simple inability to scale past 5 users without qualifying as a registered organization with 250k+ MAU - a bar a new karaoke extension is very unlikely to meet at launch.


**Pipeline Role**

- *Cascade position*:

  Best treated as an optional, best-effort enrichment/cross-check step only for teams that already have or can obtain Extended Quota access, rather than a core dependency - given a small/new project is highly unlikely to clear the confirmed 250k-MAU Extended Quota threshold, Development Mode's 5-user cap makes this effectively non-viable as a production path for this project's general user base today.

- *Failure mode*:

  Fails relatively safely at the data level (a non-matching search returns an empty items array, not a hallucinated result), but the more consequential failure mode for this project is architectural: hitting the confirmed 5-user Development Mode ceiling would cause the feature to silently stop working for the 6th and subsequent users rather than degrading gracefully, unless explicitly designed around (e.g., by not depending on Spotify as a required path).

- *Cost model at scale*:

  No per-call monetary price exists (API calls themselves are free within quota), but the real 'cost' is the organizational-eligibility gate itself - Extended Quota Mode requires 250k+ MAU and formal business registration, a binary pass/fail barrier rather than a scalable metered cost. A project below that threshold has no paid upgrade path at all to remove the confirmed 5-user Development Mode cap, unlike a traditional pay-as-you-grow API.


**Uncertain fields** (excluded above, listed for reference)

- classification_or_hitrate
- catalog_language_bias
- geo_region_availability

---

### syncedlyrics (Python library, reference)

**Basic Info**

- *Name*: syncedlyrics (Python library, reference)
- *Type*:

  Reference blueprint / infrastructure-architecture constraint -- an open-source Python metadata/lyrics-resolver library and CLI that aggregates multiple third-party lyrics sources behind one interface; not itself a hosted API, audio identifier, or classifier

- *Maintainer*:

  Mohammad Momeni (github.com/moehmeni/syncedlyrics), independent open-source developer; MIT license; community-contributed provider modules and fixes


**Technical Approach**

- *Method*:

  Metadata parsing/scraping across multiple providers via a common abstract-provider interface (base.py) -- queries providers in a fixed default priority order (Musixmatch -> Deezer -> LRCLIB -> NetEase -> Megalobiz -> Genius [plain-text only] -> Lyricsify) and returns the first successful LRC-format result found (line-level, or word-level with `enhanced=True`), falling back to plain-text-only lyrics (Genius) if no synced source succeeds; each provider module implements its own HTTP calls against that service's official or unofficial/reverse-engineered internal API -- e.g. Musixmatch via the unofficial apic-desktop.musixmatch.com desktop-app endpoint with a dynamically-fetched `usertoken` obtained via `token.get`, and NetEase via the unauthenticated legacy music.163.com/api/search/pc and /api/song/lyric endpoints with pre-set session cookies

- *Required input*:

  A title/artist text query string, e.g. `syncedlyrics.search("[TRACK] [ARTIST]")` -- no audio required

- *Minimum clip length*: 0 seconds -- pure text/metadata lookup, no audio needed at any provider

**Accuracy & Reliability**

- *Pitch speed cover robustness*:

  Not applicable in the audio-fingerprinting sense, since all providers match on title/artist text; the library itself does no edit-descriptor stripping, so the same '(Nightcore)'/'(Sped Up)'-style title noise that affects direct LRCLIB queries would need to be pre-cleaned by the calling application before querying syncedlyrics, exactly as this project's own title-normalizer already does

- *Evaluation dataset*:

  No formal MIR benchmark; evidence is anecdotal/community-reported (GitHub issues, PyPI download counts), and the maintainers explicitly acknowledge specific broken providers (Deezer 'currently not working anymore', Lyricsify 'broken due to Cloudflare protection') based on ongoing community testing rather than a structured dataset

- *Confidence calibration*:

  No unified confidence/relevance score across providers -- the library returns the first provider's successful hit in fixed priority order rather than a ranked/scored merge across all providers, so there is no tunable match-confidence threshold exposed to the caller


**Integration Feasibility**

- *Api availability*:

  Free and keyless as a Python library itself (`pip install syncedlyrics`, MIT license); however most of its providers hit free-but-unofficial or reverse-engineered upstream endpoints (Musixmatch's desktop-app token flow, NetEase's legacy web API) that carry no formal SLA, no documented rate limit, and are not licensed for third-party use -- practical availability is only as good as each unofficial upstream endpoint remains unblocked

- *Chrome extension usability*:

  Not directly usable as shipped -- this is a server-side/CLI Python library, not a JavaScript/browser-callable API. Using its approach in a Chrome extension would require either reimplementing the same provider logic in JS/TS for in-extension use, or running this Python library behind a first-party backend service the extension calls. Its primary value to this project is as an architectural reference for provider priority-ordering and fallback logic, not as a directly embeddable dependency

- *Audio access requirement*: None -- pure text/metadata across all providers, no audio capture required by the library itself
- *Client vs server*:

  As a Python library it is inherently server-side; if its provider logic were ported to run in an extension's background service worker, the query text (not audio) would be what leaves the user's machine, sent to whichever third-party provider(s) are queried in sequence

- *Bundle weight cold start*:

  As a Python package: minimal footprint, pure-Python with lightweight HTTP dependencies, no ML model; latency is dominated by sequential network round-trips to however many providers must be tried before a hit -- worst case (all failing providers attempted before a final fallback hit) could be materially slower than a single-provider query like a direct LRCLIB call

- *Breakage risk*:

  High per-provider breakage risk is inherent to its design -- the README itself documents Deezer as already non-functional and Lyricsify as Cloudflare-blocked at time of research, illustrating exactly the fragility of chaining multiple unofficial/reverse-engineered endpoints; mitigated by the multi-provider fallback architecture itself (one provider breaking does not fully break the library) and by an actively-maintained open-source community that has historically patched broken providers over time


**Output**

- *Identification fields*:

  Returns trackName/title, artistName, and either plainLyrics or an LRC-format syncedLyrics string; with `enhanced=True`, a word-level richsync-style LRC variant using angle-bracket word timestamps (currently only sourced from Musixmatch's richsync endpoint) -- no album, ISRC, or numeric confidence score is part of the unified output schema

- *Isrc availability*:

  No -- none of the aggregated providers' outputs are normalized to include an ISRC; matching throughout the library is by title/artist text only

- *Karaoke specific outputs*:

  This is its core value proposition: line-level LRC synced lyrics from multiple fallback sources, and -- uniquely among the items compared in this research set -- an `enhanced` (word-level/karaoke-style) mode that parses Musixmatch's richsync response into word-by-word timing, directly usable for karaoke-grade word highlighting when available; no BPM, musical key, or vocal/instrumental-activity detection of any kind


**Licensing & Legal**

- *Tos restrictions*:

  Explicitly and repeatedly against at least one upstream provider's terms of service -- community documentation states plainly that using Musixmatch's desktop-app token endpoint this way 'is against MusixMatch's API TOS because it's bypassing API auth'; NetEase's provider similarly uses an unauthenticated legacy internal web endpoint not intended for third-party programmatic use. The library's own MIT license only covers the Python code itself, not any rights to the lyrics content or upstream services' terms

- *Risk tolerance note*:

  This is squarely the case the field definition calls out by name -- a widely-deployed, actively-used-by-the-community (10k+ weekly downloads) unofficial practice that directly conflicts with at least one upstream vendor's (Musixmatch's) stated API terms, analogous to ytInitialData scraping or SongRec's reverse-engineered Shazam protocol; using its NetEase/Musixmatch provider logic directly (rather than merely as an architectural reference) would carry the same residual ToS-violation exposure as building those integrations from scratch


**Pipeline Role**

- *Cascade position*:

  Best used as an architectural reference/blueprint for the extension's own multi-source lyrics-resolution cascade (its provider-priority ordering directly informs which sources to try first/fallback to) rather than embedded as-is; if its logic is reimplemented for the extension, it would function as an enrichment/fallback layer that runs after a title/artist candidate is already established, trying successively across sources until a synced-lyrics hit is found

- *Failure mode*:

  Fails silently -- returns `None` when no provider yields a match, with no confident-but-wrong fabrication risk since it only ever returns real provider-sourced lyrics text; the closest thing to a 'wrong answer' risk is a provider's own loose text matching returning lyrics for the wrong song version, a limitation inherited from each provider's own search quality rather than something the library adds on top

- *Cost model at scale*:

  Free as a library with no metering, but its two most valuable synced sources (Musixmatch's unofficial endpoint and NetEase's legacy endpoint) are unauthenticated shared community-facing infrastructure not designed for scaled third-party programmatic load -- heavy use at consumer-extension scale risks triggering IP-based throttling/blocking on those upstream endpoints, a functional availability risk rather than a monetary cost


**Uncertain fields** (excluded above, listed for reference)

- classification_or_hitrate
- catalog_language_bias
- realtime_capability
- geo_region_availability

---

### Whisper / whisper-web (Transformers.js)

**Basic Info**

- *Name*: Whisper / whisper-web (Transformers.js)
- *Type*:

  Fallback identifier - in-browser ASR-based lyric transcription (not a music/non-music classifier by itself)

- *Maintainer*:

  Model: OpenAI (Whisper); browser runtime: Hugging Face's Transformers.js (formerly Xenova/transformers.js), with the xenova/whisper-web sample app as the reference in-browser implementation; ONNX model conversions hosted under the Xenova and onnx-community Hugging Face organizations


**Technical Approach**

- *Method*:

  ML transcription: a full encoder-decoder Whisper transformer converted to ONNX and executed client-side via Transformers.js on top of ONNX Runtime Web, using WebGPU acceleration when available and falling back to WASM (SIMD/multi-threaded) otherwise. Used here as a fallback lyric-transcription path, not fingerprinting or metadata parsing.

- *Required input*:

  Raw decoded audio (16kHz mono PCM, obtained from a captured tab-audio stream or an uploaded file) - requires an actual audio buffer, not just a URL or title text

- *Minimum clip length*:

  Whisper internally processes audio in fixed ~30-second windows regardless of true content length; useful transcription in practice needs several seconds of continuous audio at minimum, and full-song lyric transcription means chunking the whole track through repeated 30s windows rather than a fast sub-second per-frame classification.


**Accuracy & Reliability**

- *Classification or hitrate*:

  As a lyric-transcription tool rather than a classifier: published automatic lyrics transcription (ALT) research shows a large accuracy gap between spoken and sung audio - e.g. on the Schubert Winterreise dataset, spoken readings of lyrics had WER around 0.14 while sung versions of the same lyrics had WER around 0.56. Separate hallucination studies found roughly 1% of Whisper transcriptions contained entirely fabricated phrases with no basis in the underlying audio.

- *Evaluation dataset*:

  Academic automatic-lyrics-transcription evaluations commonly use datasets such as the Schubert Winterreise Dataset (classical/lieder with paired spoken and sung recordings), DALI, and Jam-ALT-style separated-vocal sets. Generic audio-classification benchmarks like AudioSet/GTZAN/MagnaTagATune do not apply here since this is a transcription task, not a classification task.

- *Confidence calibration*:

  Whisper emits per-token/per-segment log-probabilities and a 'no_speech_prob' score that can serve as a rough confidence or silence signal, but these are not a single calibrated 'is this transcription correct' score, and are documented as unreliable indicators of hallucination - a low no_speech_prob does not guarantee a correct transcription.


**Integration Feasibility**

- *Api availability*:

  Free and open - Whisper model weights are released under a permissive (MIT) license by OpenAI, and ONNX conversions on Hugging Face are free to download; Transformers.js itself is Apache-2.0 licensed. No API keys, no server calls, and no rate limits apply since inference runs entirely client-side after the initial model download.

- *Chrome extension usability*:

  Fully usable inside a Chrome extension - model files are fetched once from a CDN (Hugging Face Hub or a self-hosted mirror) and cached locally (Cache API/IndexedDB), after which inference runs in a worker or offscreen document with no further network calls or CORS exposure, provided the model-hosting domain is allow-listed in host_permissions/CSP for that one-time download.

- *Audio access requirement*:

  Yes - requires actual decoded audio samples, so it depends entirely on the tabCapture/offscreen-document audio pipeline to obtain that audio in the first place. It has no independent user-gesture requirement of its own beyond whatever the audio-capture step already requires, and it will simply fail or produce meaningless output on DRM-protected or otherwise inaccessible audio, mirroring whatever limitation affects the underlying capture mechanism.

- *Client vs server*:

  Fully client-side/on-device - neither audio nor the video ID needs to leave the user's machine, which is a strong privacy and offline-capability advantage and simplifies Chrome Web Store data-use disclosure, at the cost of consuming the user's local CPU/GPU and bandwidth for the one-time model download.

- *Bundle weight cold start*:

  Roughly 75MB for a quantized whisper-base-class model (encoder ~23MB plus decoder ~50MB in 8-bit quantized ONNX form, matching the item description's '~75MB' figure); whisper-tiny quantized is smaller (roughly 40MB combined), while whisper-small/medium/large scale up to several hundred MB or multiple GB. First-run cold start includes this one-time download plus WASM/WebGPU backend initialization (can take several seconds to tens of seconds depending on connection and device); the model is then cached locally, and steady-state inference latency depends heavily on device compute - real-time-capable on a decent WebGPU-enabled GPU, markedly slower on WASM-only or low-end CPUs.

- *Breakage risk*:

  Low-to-moderate. Transformers.js is an actively maintained, well-resourced Hugging Face project, which lowers long-term abandonment risk relative to unofficial-API-dependent items in this research set. However, the whisper-web demo repo is a reference sample rather than a hardened production library, WebGPU support remains labeled 'experimental' with known issues (e.g. an open GitHub issue on WebGPU encoder fp16 precision problems, and documented behavioral regressions in ASR segment/timestamp output between the v3.8.1 and v4-preview release lines), and Whisper's own documented tendency to enter repeating/looping hallucination states on certain inputs (GitHub issue #881, 'Whisper sometimes goes haywire with endlessly repeating loops') is an intrinsic model-level risk that a library update alone does not fix.


**Latency**

- *Realtime capability*:

  Marginal and hardware-dependent. Hugging Face/Xenova has demonstrated a 'Real-time Whisper WebGPU' proof of concept showing near-real-time streaming transcription is achievable on WebGPU-capable hardware with a small model, but WASM-only fallback (older hardware, browsers without WebGPU) is meaningfully slower than real-time for anything beyond the smallest model sizes - making this best suited as a background/fallback path rather than a guaranteed instant in-line classifier.


**Output**

- *Identification fields*:

  Whisper outputs only a raw text transcript (plus segment- and word-level timestamps when using timestamped model variants) - it does not output song title, artist, album, ISRC, or any structured identification field on its own. Deriving title/artist requires feeding the transcribed lyric text into a separate lyrics-search/matching step (e.g., an LRCLIB full-text search) downstream.

- *Isrc availability*:

  No - Whisper has no concept of a song catalog or ISRC; it performs pure speech-to-text and nothing else.

- *Karaoke specific outputs*:

  Word-level and segment-level timestamps are available via whisper 'timestamped' ONNX variants/word_timestamps options, which is directly useful for karaoke-style text highlighting even without a catalog match. There is no BPM, musical key, or dedicated vocal/instrumental activity detection - the model will attempt to transcribe over instrumental sections too, which is a common source of the hallucinated text noted as a known risk.


**Licensing & Legal**

- *Tos restrictions*:

  Whisper's model weights and Transformers.js are both open-source/permissively licensed (MIT/Apache-2.0 family) with no scraping or reselling restrictions, since no third-party catalog data is involved in the transcription step itself. The only external ToS surface is whatever audio-capture mechanism supplies the audio (the tabCapture/offscreen pipeline), not transcription itself.

- *Risk tolerance note*:

  Not an official-vs-unofficial ToS gray area (no reverse-engineered API is involved); the relevant risk here is product-quality risk rather than legal risk. Because Whisper can confidently hallucinate plausible-sounding but fabricated lyric text on sung/musical audio - especially during instrumental passages - it should not be trusted as an authoritative lyric source without a human-verifiable confidence signal or a downstream catalog cross-check.


**Pipeline Role**

- *Cascade position*:

  Fallback (expensive, runs on miss) - explicitly intended as the last-resort path used only when cheaper title/metadata- or fingerprint-based identification methods fail to produce a match, given its multi-second-to-tens-of-seconds latency and the non-trivial one-time model download cost.

- *Failure mode*:

  Risks a confident-but-wrong answer - this is the key product risk flagged for this component. Whisper can produce fluent, plausible-looking but entirely hallucinated lyric text (especially on sung/musical audio or over instrumental sections) rather than failing silently, which is a visible product defect if surfaced as karaoke lyrics without further validation.

- *Cost model at scale*:

  Zero marginal per-query cost once the model is downloaded - there is no API billing and no server compute involved. The real 'cost' is borne once as bandwidth/storage for the initial model download, and per-use as the end user's local CPU/GPU cycles and battery/thermal load, which scales with usage but never produces a vendor bill.

- *Geo region availability*:

  None - fully client-side inference carries no geographic restriction. The only geo-dependent factor is Hugging Face Hub/CDN download speed for the initial model fetch, which could vary by region but is not blocked anywhere.


**Uncertain fields** (excluded above, listed for reference)

- pitch_speed_cover_robustness
- catalog_language_bias

---

## Extension architecture constraints

### CORS / host_permissions reachability (LRCLIB, iTunes, Deezer, Odesli, Spotify, Musixmatch, ACRCloud)

**Basic Info**

- *Name*: CORS / host_permissions reachability (LRCLIB, iTunes, Deezer, Odesli, Spotify, Musixmatch, ACRCloud)
- *Type*:

  Infrastructure/architecture constraint - a per-API integration-feasibility gate rather than a single tool/service

- *Maintainer*:

  Not a single maintained project - this is a cross-API survey of reachability characteristics across independently-run third-party services (LRCLIB community project; Apple iTunes Search API; Deezer; Odesli/Songlink; Spotify; Musixmatch; ACRCloud), interpreted against Chrome's own Manifest V3 extension permission model


**Technical Approach**

- *Method*:

  Architecture/permissions analysis: Manifest V3 extensions can bypass normal browser same-origin/CORS restrictions for any origin explicitly declared in the manifest's host_permissions, because Chrome grants the background service worker a special fetch() privilege for those origins regardless of whether the target server itself returns Access-Control-Allow-Origin headers. That CORS-bypass privilege does not, however, solve a separate problem: keeping confidential credentials (OAuth client secrets, HMAC signing secrets) out of client-inspectable extension code. APIs that require such secrets still need a developer-controlled backend proxy even though the raw network call itself would technically succeed.

- *Required input*:

  Per API: the target domain(s) must be listed in host_permissions in manifest.json. Keyless APIs (LRCLIB, iTunes Search API, Odesli's free tier) need nothing further; keyed/secret-based APIs (Spotify, Musixmatch, ACRCloud) additionally need a credential whose confidentiality requirements determine whether direct client embedding is safe.

- *Minimum clip length*: Not applicable - this is a network/permissions concern, not an audio-analysis method.

**Accuracy & Reliability**

- *Classification or hitrate*: Not applicable.
- *Pitch speed cover robustness*: Not applicable.
- *Catalog language bias*:

  Not applicable to the reachability question itself, though each backing catalog (LRCLIB community-submitted lyrics, iTunes/Deezer/Spotify commercial metadata, Odesli's cross-platform link graph, Musixmatch's licensed lyrics, ACRCloud's fingerprint database) carries its own independent coverage bias unrelated to CORS/host_permissions reachability.

- *Evaluation dataset*: Not applicable.
- *Confidence calibration*: Not applicable.

**Integration Feasibility**

- *Api availability*:

  Directly verified (2026-09-11) via HTTP header inspection unless noted: LRCLIB - free, keyless, MIT-licensed, its /api/search endpoint returns 'Access-Control-Allow-Origin: *'. iTunes Search API - free, keyless, also returns 'Access-Control-Allow-Origin: *'; informally rate-limited to roughly ~20 requests/minute per IP (undocumented and 'subject to change' per Apple's own forum guidance; can return 403/429). Odesli/Songlink API - free without a key at 10 requests/minute, higher limits available by emailing developers@song.link for a key. Deezer API - free and keyless for public search/metadata endpoints, but its CORS preflight (OPTIONS) response omits an Access-Control-Allow-Origin header entirely, meaning an ordinary webpage fetch() would be blocked by the browser; only the extension's host_permissions CORS-bypass privilege makes it directly callable. Spotify Web API - free tier via Client Credentials flow requires a registered app's client_id plus client_secret, with undocumented/dynamic rate limiting; its token and API endpoints actually do reflect the request's Origin back in Access-Control-Allow-Origin, so CORS itself is not the blocker - shipping the client_secret inside inspectable extension code is. Musixmatch API - requires an apikey; official developer signups/access have historically been restricted or limited, and its endpoints returned no CORS headers on a direct OPTIONS check. ACRCloud Identification API - requires a per-request HMAC-SHA1 signature computed from an access_key/access_secret pair; CORS headers ('Access-Control-Allow-Origin: *') were actually present on a direct check, but the signature-secret requirement, not CORS, is the real blocker for safe client-side use.

- *Chrome extension usability*:

  Splits into two tiers. Directly callable from an MV3 extension by simply adding the domain to host_permissions: LRCLIB, iTunes Search API, Odesli/Songlink, and Deezer - Deezer specifically because host_permissions bypasses its missing CORS headers, not because Deezer itself supports ordinary cross-origin browser calls. Effectively requiring a developer-controlled backend proxy: Spotify (to keep the OAuth client_secret confidential for the Client Credentials app-only flow; note the Authorization-Code-with-PKCE user-auth flow is a partial exception that can run without a secret, but that grants user-scoped access rather than the app-only catalog lookup this project would actually want), Musixmatch (apikey plus historically-restricted developer signup and no CORS support for browser calls), and ACRCloud (the per-request HMAC signature needs the access_secret, which cannot be safely shipped inside an inspectable, unpacked extension bundle).

- *Audio access requirement*:

  Not applicable to the metadata/lyrics APIs (LRCLIB, iTunes, Deezer, Odesli, Spotify, Musixmatch). ACRCloud is the exception, since its Identification API is audio-fingerprint-based and requires an uploaded audio sample or precomputed fingerprint, which itself would need to originate from the tabCapture/offscreen-document audio pipeline.

- *Client vs server*:

  For the directly-callable tier, only the search query (song title/artist text, or a URL for Odesli) leaves the client, going straight to the third-party API with no intermediary. For the proxy-required tier, the client's query must additionally pass through the developer's own backend, adding a second network hop with its own privacy, uptime, and cost implications, plus additional Chrome Web Store data-use disclosure surface.

- *Bundle weight cold start*:

  Not applicable - no local models or libraries are involved; latency here is standard network round-trip time to each vendor's API.

- *Breakage risk*:

  Low for the keyless tier's core contract - LRCLIB is MIT-licensed and open, and the iTunes Search API has been stable for over a decade, though it is undocumented/informal and Apple has quietly tightened rate limits in the past per developer forum reports. Moderate for Deezer, since reachability depends on the extension-CORS-bypass mechanism continuing to work as designed and on Deezer's free-tier terms not changing. The proxy-required tier's breakage risk sits mainly on the developer's own backend uptime rather than the underlying vendor, though Musixmatch's unofficial-access patterns (as documented for BetterLyrics cf-api elsewhere in this research) are inherently more fragile than any of the officially-supported keyless APIs in this group.


**Latency**

- *Realtime capability*:

  Yes for all of them at the network layer - these are standard low-payload JSON REST calls that typically return in well under a second. The proxy tier adds one extra network hop's worth of latency but remains realtime-capable for an interactive UI.


**Licensing & Legal**

- *Risk tolerance note*:

  The clearest official-vs-unofficial tension in this group is Musixmatch: its official developer API has historically had restricted or limited open signups, which is exactly why projects like BetterLyrics cf-api (covered elsewhere in this research) instead reverse-engineer Musixmatch's internal web-client usertoken flow - a widely-deployed but explicitly unofficial practice that this project would inherit if it depends on Musixmatch directly or via that project's backend, rather than on a sanctioned Musixmatch partner agreement.


**Pipeline Role**

- *Cascade position*:

  Not a pipeline stage itself - this is a cross-cutting feasibility gate that determines, for every metadata/identification API considered elsewhere in this research, whether it can sit in the cheap client-side gate/enrichment tier of the pipeline or must instead be pushed behind a backend proxy (adding cost, latency, and an operational dependency) before it can be used at all.

- *Failure mode*:

  Fails silently/explicitly at the network level - a blocked CORS request throws a clear, catchable fetch error, and a missing host_permissions entry is a build-time/review-time problem rather than a runtime surprise. This architecture question does not itself introduce a confidently-wrong-answer risk, though attempting to skip a needed backend proxy for a secret-gated API would surface as a hard failure (401/403) rather than a silently degraded result.


**Uncertain fields** (excluded above, listed for reference)

- identification_fields
- isrc_availability
- karaoke_specific_outputs
- tos_restrictions
- cost_model_at_scale
- geo_region_availability

---

### chrome.tabCapture + offscreen document (MV3 audio architecture)

**Basic Info**

- *Name*: chrome.tabCapture + offscreen document (MV3 audio architecture)
- *Type*:

  Infrastructure/architecture constraint - the mandatory audio-acquisition plumbing required by any audio-based classifier/fingerprinter/transcriber in this project, not itself a classifier or identifier

- *Maintainer*:

  Google Chrome extensions platform team (part of the chrome.* extensions API surface), documented officially at developer.chrome.com


**Technical Approach**

- *Method*:

  Browser-native tab-audio capture: a privileged extension call, chrome.tabCapture.getMediaStreamId, issued from the background service worker in response to a user gesture, returns an opaque, single-use, short-lived stream ID (expires within seconds if unused). That ID is handed to an MV3 'offscreen document' (a hidden DOM-capable page the service worker creates, since service workers themselves cannot access media devices or the DOM), which calls navigator.mediaDevices.getUserMedia() with chromeMediaSource:'tab' constraints to materialize the actual MediaStream for downstream audio processing.

- *Required input*:

  A target tab ID plus an explicit user gesture (e.g., an extension action-button click via chrome.action.onClicked, or a content-script click handler) to authorize the capture call; as of Chrome 116+, a stream ID obtained in the service worker can be consumed in an offscreen document sharing the same security origin/render process.

- *Minimum clip length*:

  0s - this is a continuous streaming capture mechanism, not a per-clip analysis method; it produces a live MediaStream that downstream consumers (a fingerprinter, classifier, or Whisper) then chunk as needed.


**Accuracy & Reliability**

- *Classification or hitrate*:

  Not applicable - this is a plumbing/infrastructure component with no classification or identification output of its own.

- *Pitch speed cover robustness*:

  Not applicable - it captures raw audio faithfully regardless of a song's tempo/pitch/edit status; robustness to nightcore, pitch-shifts, or covers is entirely a property of whatever downstream fingerprinter/classifier consumes the captured stream.

- *Catalog language bias*: Not applicable - no catalog or language dimension exists at the raw audio-capture layer.
- *Evaluation dataset*: Not applicable - no accuracy benchmark exists for a capture API.
- *Confidence calibration*:

  Not applicable - tabCapture either succeeds (returns a usable stream) or fails (throws / sets chrome.runtime.lastError); there is no graded confidence score.


**Integration Feasibility**

- *Api availability*:

  Free, first-party, keyless Chrome extension API with no external service and no billing. Requires declaring the 'tabCapture' and 'offscreen' permissions in the extension manifest. No formal rate limit exists beyond the hard constraint that the API can only be invoked in direct response to a user gesture, and that returned stream IDs expire within seconds if unused.

- *Chrome extension usability*:

  MV3-native and directly usable with the correct manifest permissions ('tabCapture', 'offscreen'). As of Chrome 116+, a stream ID obtained in the background service worker can be handed off to and consumed inside an offscreen document - previously this cross-context handoff was awkward or impossible - and this handoff pattern is now the officially documented, recommended approach (see Google's own chrome-extensions-samples/functional-samples/sample.tabcapture-recorder reference implementation). This is not a CORS/host_permissions question at all; it is a distinct, privileged extension-capability permission separate from network host permissions.

- *Client vs server*:

  Entirely client-side/local - the captured audio stream never leaves the browser at this layer. It only becomes a privacy-relevant client-vs-server question once a downstream component (e.g., a server-side fingerprinting call) subsequently sends that captured audio off-device.

- *Bundle weight cold start*:

  Negligible - it is a built-in browser API, not a downloaded library or model. Cold start is just the offscreen document's creation time (near-instant, a lightweight hidden HTML page) plus the getUserMedia negotiation, typically well under a second.

- *Breakage risk*:

  Low for the core API contract, since it is an official, actively maintained Google Chrome extensions platform API with stable documentation. However, MV3's overall service-worker lifecycle (workers being suspended/killed and needing to be re-woken) has historically been a source of subtle bugs for extensions built on this pattern, and the specific 'service worker obtains stream ID, offscreen document consumes it' handoff is relatively new (introduced Chrome 116, 2023), so older tutorial/StackOverflow content describing pre-116 workarounds is now outdated. Google maintains an official reference sample kept roughly in sync with platform changes, which mitigates long-term breakage risk.


**Latency**

- *Realtime capability*:

  Yes - it delivers a live, continuous MediaStream suitable for real-time downstream processing (Web Audio API analysis, streaming ASR, fingerprint windowing) with no inherent batching delay introduced by the capture layer itself.


**Output**

- *Identification fields*: Not applicable - produces raw audio only, with no identification metadata whatsoever.
- *Isrc availability*: Not applicable.
- *Karaoke specific outputs*:

  Not applicable directly, but it is the prerequisite: raw audio access via this pipeline is what would make any client-side BPM/key/vocal-activity detection possible at all, if such analysis were added downstream.


**Licensing & Legal**

- *Tos restrictions*:

  Governed by the Chrome Web Store Developer Program Policies rather than any third-party ToS: extensions using the tabCapture permission must have a clear, user-facing purpose for that permission and must not capture audio/video without adequate user awareness/disclosure - undisclosed or deceptive audio capture is a documented policy violation and a common cause of Web Store rejection or removal. Capturing DRM-protected streams is blocked at the platform/EME level rather than by Chrome Web Store policy per se.

- *Risk tolerance note*:

  No official-vs-unofficial gray area applies here - unlike items elsewhere in this research set, this is Google's own documented, sanctioned MV3 pattern. The main practical risk is developer-experience risk (correctly sequencing the service-worker/offscreen-document/user-gesture flow, and correctly reconnecting captured audio to avoid silently muting the user's tab), not a legal or ToS risk.


**Pipeline Role**

- *Cascade position*:

  Not a pipeline stage in the classification/identification sense - it is the foundational audio-acquisition dependency that gates every audio-based approach (any fingerprinter, ML classifier, or Whisper fallback) in the whole pipeline; nothing audio-based can run until this step succeeds.

- *Failure mode*:

  Fails silently/explicitly rather than confidently-wrong - if the user gesture is missing, permissions aren't granted, or the tab can't be captured (e.g., chrome:// pages, some DRM content), the API throws or sets chrome.runtime.lastError rather than returning corrupted or fabricated audio. The most common real-world 'failure' users would notice is the source tab going silent because a developer forgot to reconnect the stream to audioContext.destination.

- *Cost model at scale*:

  Free - no per-call cost and no vendor billing. The only 'cost' is local CPU/battery overhead from running an always-present offscreen document and audio pipeline while capture is active.

- *Geo region availability*: None - purely a client-side browser API with no geographic restriction of any kind.

**Uncertain fields** (excluded above, listed for reference)

- audio_access_requirement

---

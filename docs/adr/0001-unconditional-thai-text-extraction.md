---
status: accepted
---

# Extract a Reading's Thai text into the LRCLIB query unconditionally, accepting a known zero-result failure mode

`buildSearchQuery` used to only pull a field's Thai text into the query when that field was >50% Thai by codepoint count (`isPredominantlyThai`). A short/moderate Thai title next to a longer English parenthetical — a remaster/version/cover tag, or a "From ..." source-work attribution — fell under that threshold, silently dropping the only actually-identifying text. Confirmed on three real videos this session (`ลม (Remaster)`, `อยากหยุดเวลา (Cover Version)`, `ใจความสำคัญ (From "...")`): each went from a query that returned LRCLIB's 20-result cap full of unrelated tracks, to a query that found the exact record.

Made Thai extraction unconditional per field instead. This has a confirmed regression: when a field carries **both** a Thai transliteration of a name and that name's own Latin spelling (artist *or* track — verified this isn't artist-specific), including both in the query can return **zero** LRCLIB results, even though either form alone works. Isolated precisely on `ไม่รัก...ไม่ต้อง - นิว จิ๋ว (NEW&JIEW)`: `q=...นิว จิ๋ว` (Thai only) → 4 results; `q=...NEW JIEW` (Latin only) → 2 results; `q=...นิว NEW` (both forms of the same name together) → 0 results. No cheap heuristic found to distinguish this from the three confirmed-good cases above — both patterns mix Thai and Latin content in one field; the real difference is semantic (unrelated edit-tag vs. transliteration pair), not structural.

Shipped anyway: net effect on the one playlist tested was +3 fixed / -1 regressed. The regression's failure mode — a silent miss — was judged safer than the old code's, which this same investigation showed can *confidently serve the wrong song* (e.g. matching `Nice 2 Meet U / Jon Connor`, an unrelated Western rapper, off a shared name fragment).

## Considered Options

- **Ship as-is** (chosen) — net positive on tested evidence; accepts the known failure mode.
- **Find a narrower heuristic** — rejected: the distinguishing signal between "safe to combine" and "unsafe to combine" is semantic (is the Latin text a translation of the Thai, or unrelated content?), not something a structural/regex rule can reliably detect.
- **Revert to the >50%-Thai gate** — rejected: gives up all three confirmed real fixes to avoid one confirmed regression.

## Consequences

- `buildSearchQuery`'s documented "ordering-independent" invariant (swapping which string is passed as artist vs. track always produces the same query) no longer strictly holds once both fields can independently contribute Thai text. Left as a soft, non-binding property rather than fixed structurally: verified this session that LRCLIB's own search results are word-order-insensitive, so the invariant's *purpose* (both readings search equally well) still holds even though the literal query string can differ.
- **Revisit if**: this failure mode shows up in an actual user-facing not-found report. It was found via one synthetic 210-video sample, not live usage data — real-world frequency is still unknown.

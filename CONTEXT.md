# Karaoke Extension — Search Algorithm

The pipeline that turns a raw YouTube video title into lyrics: guessing the artist/track from the title, querying LRCLIB for candidate records, and scoring those candidates to pick (or reject) a match. Spans `src/core/title-normalizer.ts`, `src/core/search-query.ts`, and `src/core/match-scorer.ts`.

## Language

**Reading**:
An `{artist, track}` guess derived from one YouTube title.
_Avoid_: Guess, candidate parse, orientation

**Candidate**:
One lyrics record LRCLIB returned for a query, before scoring.
_Avoid_: Result, record (ambiguous with the raw `LrclibRecord` type)

**Accepted candidate**:
A candidate that cleared `pickBestScored`'s score and similarity gates.
_Avoid_: Match, correct match, found (all imply verified correctness this concept doesn't have)

## Relationships

- One YouTube title produces one or two **Readings** (via `normalizeTitleCandidates`) — a primary reading and a swapped one, since Thai titles often run `Song - Artist`, reversed from the Western `Artist - Song` convention `normalizeTitle` assumes by default
- A **Reading**'s query returns zero or more **Candidates**
- A **Candidate** that clears every gate becomes an **Accepted candidate** — this is a claim the candidate passed the algorithm's filters, not a claim it is the correct song; the pipeline has no ground truth to check against at runtime

## Example dialogue

> **Dev:** "The not-found audit says this video is 'found' now — are we done?"
> **Domain expert:** "It has an **Accepted candidate**, not a verified-correct one. We found a case this session where an **Accepted candidate** was a completely different song by a different artist that just shared a name fragment — the query cleared every gate and was still wrong. 'Found' only ever means an **Accepted candidate** exists."
> **Dev:** "So how do I know if the **Reading** itself is right, before it even reaches LRCLIB?"
> **Domain expert:** "You don't, fully — that's why a title produces two **Readings**, not one. `normalizeTitle` guesses `Artist - Track` order by default, but many Thai titles are really `Track - Artist`. We send one query (from the primary **Reading**) but score its **Candidates** against both, so a backwards primary guess can still be rescued by the swapped one during scoring."

## Flagged ambiguities

- "match"/"found" were used throughout this session's debugging to mean "an accepted candidate exists" — but accepting a candidate is not the same as it being the *correct* song. Confirmed during this session: the query `Nice Meet U` accepted `Nice 2 Meet U / Jon Connor` (an unrelated Western rapper) at score 0.625 — a real video's lyrics request would have silently served the wrong song. Resolved: use **Accepted candidate** for "cleared the gates"; there is no term yet for "verified correct" because the pipeline has no way to verify it at runtime.

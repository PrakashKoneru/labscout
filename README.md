# Labscout

**PitchBook for students.** Describe your investment thesis in plain English; get a ranked list of current Columbia, NYU, Cornell and Cornell Tech students already publishing on it — each with a 3-line "why this student" brief and source links.

Live: https://labscout-nyc.vercel.app

Built at **Deal Flow — NYC's first VC hackathon** (Betaworks, October 24, 2026), Track 1: Sourcing.

## How it works

- **Thesis → keywords:** Claude (via Nicrron) turns the plain-English thesis into search keywords.
- **Search:** OpenAlex works search, filtered to Columbia / NYU / Cornell / Cornell Tech, publication years 2024–26.
- **Enrich:** per-author aggregation of matching papers + OpenAlex author stats + ORCID education check (an education entry with no end date = current student).
- **Rank & brief:** deterministic score, then a 3-line brief per student with links to every source paper.

## Data sources

- [OpenAlex](https://api.openalex.org) — works and author metadata
- [ORCID public API](https://pub.orcid.org) — education / enrollment status
- [Nicrron](https://api.nicrron.ai) — Claude access for keyword extraction and briefs
- 23 founder-signal sources (GitHub, arXiv, Semantic Scholar, NSF, NIH, Hugging Face, PyPI/npm, Zenodo, Crossref, ORCID, Europe PMC, CORDIS, Wikidata, dissertation repositories, NY corporations, SEC Form D, USAspending, ClinicalTrials.gov, Y Combinator, Bluesky, Hacker News, …) — see [docs/SOURCES.md](docs/SOURCES.md)

## Run locally

1. Create `.env.local` with `NICRRON_API_KEY` and `OPENALEX_MAILTO`.
2. `node scripts/dev.ts` → http://localhost:3000
3. Tests: `node --test tests/`

Offline demo of the UI: open `/index.html?mock=1` (uses a built-in sample response, no API calls).

## Stack

Zero dependencies. Node 26 native TypeScript. Vercel serverless function (`api/search.ts`) + static `public/`.

## Team 9 — Labscout

- Jak Akdemir — Protocogni Labs
- Yi Liu — Columbia Business School
- Mirah Xu — GreenerIntelligence

All code written on build day, October 24, 2026.

# Labscout — Product

**One line:** PitchBook for students. A VC types a thesis; Labscout returns the NYC students already publishing on it, ranked, with a 3-line "why meet them" brief and evidence links.

**Users:** associates and partners at pre-seed / seed funds; venture scouts. Today: hackathon judges (VCs) watching a live demo on a projector.

**Jobs:**
1. Turn a thesis into a ranked shortlist of students in under 20 s.
2. Trust each rank: every claim links to its source (paper, ORCID, GitHub, NSF, news).
3. Forward a brief to a partner as-is.

**Surfaces (3 tabs):**
- **Scout** (`/`): chat. Thesis in → ranked student cards as the reply. Follow-ups refine ("only Columbia", "current students only", "top 3", "with GitHub", "more like #2").
- **Sponsors** (`/sponsors`): live proof that NicrronNinoo, PRISM, akta.pro and Roundtable each run on every search.
- **Architecture** (`/docs`): how it works, data sources by founder-signal stage, REST + MCP endpoints, run locally.

**Voice:** short, concrete, no hype. Sentences under 15 words. Numbers over adjectives.

**Constraints:** zero npm dependencies, no build step, static HTML + vanilla JS, self-hosted fonts (venue Wi-Fi is unreliable), works offline via `/?mock=1`.

**Data truths:** Columbia, NYU, Cornell, Cornell Tech; papers 2024–26; sources OpenAlex, ORCID, GitHub, arXiv, Semantic Scholar, NSF (live), PatentsView + SBIR.gov (built, upstream down), akta.pro news. No LinkedIn, no Google Scholar scraping.

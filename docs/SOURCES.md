# Founder-signal sources

Catalog of every data source named in the team's "Early Founder Signals" framework, mapped to Labscout's
six stages: **1** research quality · **2** builder signal · **3** commercial pull · **4** spinout intent (strongest) ·
**5** early traction · **6** track record.

Status: **live** = implemented and verified against the real API without a key · **needs key** = implemented, enabled only
when the env var is set · **blocked** = implemented, but the upstream API is currently down · **roadmap** = not implemented ·
**excluded** = we will not use it.

Source modules live in `lib/sources/*.ts` (contract: `lib/sources/types.ts`). Every `enrich()` uses a ≤12 s
`AbortSignal.timeout`, never throws, and returns `[]` on any failure (incl. HTTP 429). A source's total weight is capped at 15.
Disambiguation (`lib/sources/match.ts`): a record counts only if the **name matches** (exact normalized, or same first+last
with middle names omitted; bare initials rejected) **and** there is institution evidence (Columbia / NYU / New York University /
Cornell / Cornell Tech / Weill Cornell) **or** a shared paper (title or DOI) with the candidate's OpenAlex works.

## Stage 1 — Research quality / velocity

| Source | Signal | Stage | Status | Endpoint | Notes |
|---|---|---|---|---|---|
| OpenAlex | works, citations, authorship position, recent-works count | 1 | live | `https://api.openalex.org/works`, `/authors` | Core search pipeline (`lib/search.ts`). |
| ORCID | education / current-student status | 1 | live | `https://pub.orcid.org/v3.0/<orcid>/educations` | Core pipeline. |
| arXiv (`arxiv.ts`) | `preprint` (+2 each, max 3) for on-topic preprints in last 12 mo; `velocity` (+3) if ≥3 | 1 | live (verified HTTP 200) | `http://export.arxiv.org/api/query?search_query=au:"First Last"&sortBy=submittedDate&sortOrder=descending&max_results=10` | Atom XML parsed with regexes. Requires name in author list + title/abstract overlap with c.works or thesis keywords. 1 request/candidate; arXiv asks for ≤1 req/3 s, not enforceable across parallel candidates. Count saturates at 10. |
| Semantic Scholar (`semanticscholar.ts`) | `citation_velocity`: citations to papers from the last 2 years, + h-index; weight `min(8, round(log2(1+N)))` | 1 | live (verified HTTP 200, no key) | `https://api.semanticscholar.org/graph/v1/author/search?query=<name>&fields=name,affiliations,paperCount,citationCount,hIndex,url,papers.title,papers.year,papers.citationCount,papers.externalIds&limit=5` | Optional `S2_API_KEY` (header `x-api-key`) — unauthenticated shares a global rate-limit pool; 429 → `[]`. S2 `affiliations` is usually empty, so matching mostly relies on shared DOI/title. Key: https://www.semanticscholar.org/product/api#api-key-form |
| NSF GRFP fellowship | credential (planned +3) | 1 | not detectable | NSF Awards API | GRFP awards are made to the institution with the campus coordinator as PI; fellows are not named in the Awards API. Would need the GRFP awardee list (https://www.research.gov/grfp/AwardeeList.do) — roadmap. |
| Google Scholar | citations / h-index | 1 | excluded (roadmap only via licensed proxy) | — | ToS forbids scraping; no official API. S2 + OpenAlex cover the same signal. |
| Conference sites (accepted papers, orals, awards) | top-venue acceptances, best-paper awards | 1 | roadmap | e.g. OpenReview API `https://api2.openreview.net/notes` | OpenReview has a public API for ICLR/NeurIPS; CVF/ACL have static lists. |
| Paper abstracts → LLM "applied focus" classification | applied vs. theoretical orientation | 1→3 | roadmap | OpenAlex `abstract_inverted_index` + LLM | Cheap: abstracts already fetched by OpenAlex. |

## Stage 2 — Builder signal

| Source | Signal | Stage | Status | Endpoint | Notes |
|---|---|---|---|---|---|
| GitHub (`github.ts`) | repos, stars, forks, outside adoption | 2 | live (owned by another agent) | `https://api.github.com` | Optional `GITHUB_TOKEN` for rate limits. |
| GitHub releases | shipping cadence (tagged releases, downloads) | 2 | roadmap | `https://api.github.com/repos/<o>/<r>/releases` | Extends github.ts; velocity of releases > total stars. |
| Hugging Face | models/datasets/spaces, downloads, likes | 2 | roadmap | `https://huggingface.co/api/models?author=<user>` (also `/api/datasets`, `/api/spaces`) | Public, no key. Needs HF-username discovery (GitHub profile / paper links). |
| Papers with Code | code linked to papers | 2 | roadmap | (was `https://paperswithcode.com/api/v1/`) | PwC was folded into Hugging Face "Papers" in 2025; use HF papers API instead. |

## Stage 3 — Commercial pull

| Source | Signal | Stage | Status | Endpoint | Notes |
|---|---|---|---|---|---|
| Paper acknowledgments / corporate co-authors | industry funding, company co-authors | 3 | roadmap | OpenAlex `authorships.institutions.type=company` | Cheap proxy already in the OpenAlex payload; acknowledgments text needs full-text. |
| Google Patents / Lens.org | patent citations of their papers, industry patents | 3/4 | roadmap | Lens: `https://api.lens.org/patent/search` (key) | Google Patents has no official API. Lens requires a free scholarly/patent token. |
| SAM.gov | federal contracts / registrations of a new entity | 3/5 | roadmap | `https://api.sam.gov/entity-information/v3/entities` (key) | Free key at api.data.gov. |
| Standards bodies (IETF, W3C, IEEE, 3GPP) | participation in standards drafts | 3 | roadmap | e.g. IETF Datatracker `https://datatracker.ietf.org/api/v1/` | Niche; relevant to infra/networking theses. |
| Conference agendas / YouTube talks / blogs | industry-facing talks, invited demos | 3 | roadmap | YouTube Data API (key) | |

## Stage 4 — Spinout intent (strongest)

| Source | Signal | Stage | Status | Endpoint | Notes |
|---|---|---|---|---|---|
| NSF Awards API (`nsf.ts`) | `sbir_award` (+10) NSF SBIR/STTR; `icorps` (+8) I-Corps team; `grant` (+3, max 2, stage 6) PI/co-PI awards at their institution | 4, 6 | live (verified HTTP 200, no key) | `https://api.nsf.gov/services/v1/awards.json?pdPIName=<First Last>&printFields=…&rpp=25` and `?coPDPI=<First Last>` | Real fields: `id, title, awardeeName, piFirstName, piLastName, pdPIName, coPDPI ["Name email"], startDate MM/DD/YYYY, fundsObligatedAmt, fundProgramName` ("SBIR Phase I", "I-Corps", …). `printFields` is not honored (full records returned). I-Corps entrepreneurial leads are often students but are typically not listed as PI. Evidence: `https://www.nsf.gov/awardsearch/showAward?AWD_ID=<id>`. |
| SBIR.gov (`sbir.ts`) | `sbir_award` (+10): firm, agency, phase, year, amount | 4 | blocked (HTTP 403 `{"message":"Forbidden"}`; SBIR.gov: "APIs are currently undergoing maintenance") | `https://api.www.sbir.gov/public/api/awards?keyword=<thesis keywords>&rows=100` | No person search (params: firm, agency, year, keyword, rows, start); matches `pi_name`. Enabled only with `SBIR_API_ENABLED=1`. Fallback: bulk CSV `https://data.www.sbir.gov/awarddatapublic/award_data.csv` (290 MB; contains PI names) — could be pre-indexed. NSF SBIRs are already covered by nsf.ts. |
| USPTO PatentsView (`patentsview.ts`) | `patent` (+4) university-assigned; `ip_movement` (+8) assigned to a company or the inventor | 4 | needs key + blocked (`search.patentsview.org` is NXDOMAIN since the 2026-03-20 move to the USPTO Open Data Portal; no relaunch date) | `https://search.patentsview.org/api/v1/patent/?q={"_and":[{"inventors.inventor_name_first":…},{"inventors.inventor_name_last":…}]}&f=[…]` header `X-Api-Key` | Enabled only with `PATENTSVIEW_API_KEY`; `PATENTSVIEW_API_URL` overrides the base URL. Old PatentsView keys will not work on ODP; ODP key: https://data.uspto.gov/apis/getting-started. Disambiguation: assignee is our institution or inventor is NY-based. Evidence: `https://patents.google.com/patent/US<id>`. |
| ARPA-E | ARPA-E awards / fellows | 4 | roadmap | no public API (project list on arpa-e.energy.gov) | |
| Cross-source entity matching / team formation | same 2–3 names co-appearing across papers, repos, awards, filings | 4 | roadmap | built on top of all sources | Strong co-founder signal; reuse `match.ts`. |
| Lab pages | "spun out", "on leave to found" | 4 | roadmap | scrape faculty/lab sites | Fragile; low coverage. |
| State business registries (NY DOS, Delaware) | new entity with candidate as officer/organizer | 4 | roadmap | NY Open Data (data.ny.gov, Socrata) active-corporations dataset — not yet verified | Delaware has no free officer search. |
| SEC EDGAR Form D | priced/exempt raise by a new company | 4/5 | roadmap | `https://efts.sec.gov/LATEST/search-index?q=<name>&forms=D` | Free; Form D lists related persons (executives/directors) — named in the hackathon brief. |
| LinkedIn | title changes ("Founder", "Stealth") | 4 | excluded | — | ToS forbids scraping; no partner API. |

## Stage 5 — Early traction

| Source | Signal | Stage | Status | Endpoint | Notes |
|---|---|---|---|---|---|
| News / press (akta.pro) | press mentions of the person / thesis market | 5 | live (via akta.pro integration) | akta.pro API | Key in server env; see `lib/` akta integration. |
| Job boards | startup hiring under their name | 5 | roadmap | akta.pro job-posts API is the likely path | |
| Crunchbase | funding rounds, founders | 5/6 | roadmap (licensed) | `https://api.crunchbase.com/api/v4/` | Paid license required. |
| FDA / FCC filings | 510(k), device authorizations, FCC IDs | 5 | roadmap | openFDA `https://api.fda.gov/device/510k.json`; FCC ID search | Relevant to hardware/medtech theses. |

## Stage 6 — Track record

| Source | Signal | Stage | Status | Endpoint | Notes |
|---|---|---|---|---|---|
| NSF Awards API (`nsf.ts`) | repeat PI/co-PI grants | 6 | live | see stage 4 | +3 each, max 2. |
| NIH RePORTER | NIH grants as PI (incl. F31/F30 student fellowships, SBIR via NIH) | 6 (1 for F-fellowships, 4 for SBIR) | roadmap (verified free, HTTP 200, no key) | `POST https://api.reporter.nih.gov/v2/projects/search` body `{"criteria":{"pi_names":[{"any_name":"<name>"}]}}` | Good next module: F31 fellowships name students directly, unlike NSF GRFP. |
| DOE awards | DOE grants / SBIR | 6 | roadmap | DOE OSTI / PAGES; USAspending `https://api.usaspending.gov` | USAspending covers all federal assistance awards. |

## Keys to request

| Env var | Needed for | Get it |
|---|---|---|
| `S2_API_KEY` (optional) | Semantic Scholar higher rate limits | https://www.semanticscholar.org/product/api#api-key-form |
| `PATENTSVIEW_API_KEY` (+ `PATENTSVIEW_API_URL` when ODP relaunches the API) | PatentsView | https://data.uspto.gov/apis/getting-started (legacy PatentsView key requests are closed) |
| `SBIR_API_ENABLED=1` | SBIR.gov once its API stops returning 403 | no key needed |

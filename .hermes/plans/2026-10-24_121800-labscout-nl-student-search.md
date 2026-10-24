# Labscout — natural-language student researcher search

**Clock:** it is ~12:20 EDT. Devpost closes 17:30. Live demos 17:45. Budget: 3.5h build, 1h for deploy + video + Devpost form.
(Composer-paste filename timestamps are UTC, not EDT — `date` is the truth.)

## Goal

A VC types a plain-English thesis ("students working on protein design with diffusion models") and gets a ranked list of current NYC students who published on it, each with a profile card, a 3-line "why this student" brief, and source links for every claim.

## Context / assumptions

- Repo: `~/projects/labscout` (GitHub `jakdemir/labscout`, public). Contains only `README.md`. All code is written today (hackathon rule).
- Track 1 (Sourcing). Positioning: **"PitchBook for students."** Judges score Design / Uniqueness / Execution / Feasibility, each 1–5. "Another dashboard" scores low; "outputs a VC could forward as-is" scores high → the product is a ranked list + forwardable brief, nothing else.
- Team: Jak (pipeline), Yi (glue/submission/video), Mirah (copy/brief/demo script). One frontend page only.
- Toolchain on this Mac: Node v26.3.1, pnpm 11.9.0, Vercel CLI authenticated (use scope `jakdemir`). Deploy target: Vercel.
- LLM: **Nicrron gateway** (hackathon sponsor, OpenAI-compatible). Base URL `https://api.nicrron.ai/v1`, model `anthropic/claude-haiku-5-5` (verified 12:30: 1.6 s round-trip). Key in hand → `.env.local` as `NICRRON_API_KEY` (project-local only; never into the Hermes shell env). Use the `openai` npm SDK with `baseURL` override.
- **Data sources (verified live 12:15 today, no keys needed):**
  - OpenAlex works search: `https://api.openalex.org/works?search=<q>&filter=authorships.institutions.id:I78577930|I57206974|I205783295|I4405261073,publication_year:2024-2026&per-page=50&select=id,title,publication_year,authorships,primary_location,cited_by_count,doi`
    - `I78577930` Columbia · `I57206974` NYU · `I205783295` Cornell · `I4405261073` Cornell Tech
    - `authorships[].author.{id,display_name,orcid}`, `authorships[].author_position` ∈ `first|middle|last`, `authorships[].institutions[].display_name`
  - OpenAlex author: `https://api.openalex.org/authors/A5138408313` → `works_count`, `cited_by_count`, `counts_by_year[]`, `last_known_institutions[]`, `orcid`
  - ORCID educations: `GET https://pub.orcid.org/v3.0/<orcid>/educations` with header `Accept: application/json` → `affiliation-group[].summaries[].education-summary.{organization.name, role-title, start-date.year.value, end-date}`; **`end-date == null` ⇒ current student**. Example: ORCID `0009-0007-3825-0098` → `Columbia University in the City of New York, Masters, 2025, end null`.
  - OpenAlex free tier: shared daily budget per IP; add `mailto=<email>` param to be polite. If rate-limited at the venue, register a key at `https://openalex.org/settings/api` and append `api_key=`.
- No database. No auth. No caching beyond an in-memory `Map` in the API route. YAGNI.

## Architecture

Next.js 15 (App Router, TypeScript, Tailwind) with a single page and a single API route. `POST /api/search {q}` → Claude (via Nicrron) turns the query into keywords → OpenAlex works search restricted to NYC universities → authorships aggregated per author into candidates → top 15 authors enriched in parallel (OpenAlex author + ORCID education) → deterministic score → Claude writes a 3-line brief per top 10 → JSON back to the page, which renders ranked cards. All pure logic (aggregation, scoring, student detection) lives in `src/lib/*.ts` with Vitest tests; network code is thin and untested.

```
src/
  app/
    page.tsx              # search box + results
    api/search/route.ts   # orchestration only
  lib/
    institutions.ts       # id → short name map
    openalex.ts           # searchWorks(), getAuthor()
    orcid.ts              # getEducation()
    aggregate.ts          # works → candidates      (tested)
    score.ts              # candidate → score       (tested)
    llm.ts                # parseQuery(), writeBrief()
    types.ts
  components/
    CandidateCard.tsx
tests/
  aggregate.test.ts
  score.test.ts
```

## Tasks

Commit after every task: `git add -A` then `git commit -m "<task title>"` (two separate commands — chained `&&` is blocked by the terminal gate; or run via a script file).

### 1. Scaffold (3 min)

```sh
cd ~/projects/labscout
pnpm dlx create-next-app@latest . --ts --tailwind --eslint --app --src-dir --no-import-alias --use-pnpm
```
Answer "Yes" to overwrite prompt if asked (README.md will be kept — if it is overwritten, `git checkout README.md`).

```sh
pnpm add openai
pnpm add -D vitest
```

Add to `package.json` scripts: `"test": "vitest run"`.

Create `.env.local`:
```
NICRRON_API_KEY=sk-af-9c6c4d86a58a31a503d33fae8e38115293835ab778972224
OPENALEX_MAILTO=jakdemir@gmail.com
```
Confirm `.env.local` is in `.gitignore` (create-next-app adds `.env*`). Verify: `git status --short` must NOT list `.env.local`.

Verify: `pnpm dev` → open http://localhost:3000 → default Next page renders. Stop it.

Commit: `Scaffold Next.js app`.

### 2. Types + institutions (2 min)

`src/lib/types.ts`
```ts
export type Work = {
  id: string;
  title: string;
  year: number;
  doi: string | null;
  url: string | null;
  venue: string | null;
  citedBy: number;
  position: "first" | "middle" | "last";
  isCorresponding: boolean;
};

export type Education = {
  institution: string;
  degree: string | null;
  startYear: number | null;
  endYear: number | null;
};

export type Candidate = {
  authorId: string;          // https://openalex.org/A...
  name: string;
  orcid: string | null;
  institutions: string[];    // short names, e.g. ["Columbia"]
  works: Work[];             // matching works only
  worksCount: number | null; // from author endpoint
  citedByCount: number | null;
  firstPubYear: number | null;
  education: Education[];
  isCurrentStudent: boolean | null; // null = unknown (no ORCID)
  score: number;
  brief: string | null;
};
```

`src/lib/institutions.ts`
```ts
export const NYC_INSTITUTIONS: Record<string, string> = {
  "https://openalex.org/I78577930": "Columbia",
  "https://openalex.org/I57206974": "NYU",
  "https://openalex.org/I205783295": "Cornell",
  "https://openalex.org/I4405261073": "Cornell Tech",
};

export const INSTITUTION_FILTER = Object.keys(NYC_INSTITUTIONS)
  .map((u) => u.replace("https://openalex.org/", ""))
  .join("|");
```

Commit: `Add types and NYC institution map`.

### 3. Aggregate works → candidates (TDD, 8 min)

`tests/aggregate.test.ts`
```ts
import { describe, it, expect } from "vitest";
import { aggregate } from "../src/lib/aggregate";

const work = (overrides: Partial<any> = {}) => ({
  id: "https://openalex.org/W1",
  title: "Diffusion for proteins",
  publication_year: 2025,
  doi: "https://doi.org/10.1/x",
  cited_by_count: 3,
  primary_location: { landing_page_url: "https://doi.org/10.1/x", source: { display_name: "NeurIPS" } },
  authorships: [
    {
      author_position: "first",
      is_corresponding: true,
      author: { id: "https://openalex.org/A1", display_name: "Ada Lovelace", orcid: "https://orcid.org/0000-0001" },
      institutions: [{ id: "https://openalex.org/I78577930", display_name: "Columbia University" }],
    },
    {
      author_position: "last",
      is_corresponding: false,
      author: { id: "https://openalex.org/A2", display_name: "Prof Senior", orcid: null },
      institutions: [{ id: "https://openalex.org/I78577930", display_name: "Columbia University" }],
    },
  ],
  ...overrides,
});

describe("aggregate", () => {
  it("creates one candidate per author with NYC affiliation", () => {
    const c = aggregate([work()]);
    expect(c.map((x) => x.name)).toEqual(["Ada Lovelace", "Prof Senior"]);
    expect(c[0].institutions).toEqual(["Columbia"]);
    expect(c[0].orcid).toBe("https://orcid.org/0000-0001");
    expect(c[0].works[0]).toMatchObject({ position: "first", venue: "NeurIPS", year: 2025, citedBy: 3 });
  });

  it("merges works for the same author", () => {
    const c = aggregate([work(), work({ id: "https://openalex.org/W2", title: "Second" })]);
    expect(c.find((x) => x.authorId === "https://openalex.org/A1")!.works).toHaveLength(2);
  });

  it("drops authors with no NYC institution on that work", () => {
    const w = work();
    w.authorships[0].institutions = [{ id: "https://openalex.org/I999", display_name: "MIT" }];
    const c = aggregate([w]);
    expect(c.map((x) => x.name)).toEqual(["Prof Senior"]);
  });
});
```

Run `pnpm test` → expect FAIL: `Cannot find module '../src/lib/aggregate'`.

`src/lib/aggregate.ts`
```ts
import { NYC_INSTITUTIONS } from "./institutions";
import type { Candidate, Work } from "./types";

export function aggregate(works: any[]): Candidate[] {
  const byAuthor = new Map<string, Candidate>();
  for (const w of works) {
    const work: Omit<Work, "position" | "isCorresponding"> = {
      id: w.id,
      title: w.title ?? "(untitled)",
      year: w.publication_year ?? 0,
      doi: w.doi ?? null,
      url: w.primary_location?.landing_page_url ?? w.doi ?? null,
      venue: w.primary_location?.source?.display_name ?? null,
      citedBy: w.cited_by_count ?? 0,
    };
    for (const a of w.authorships ?? []) {
      const nyc = (a.institutions ?? [])
        .map((i: any) => NYC_INSTITUTIONS[i.id])
        .filter(Boolean) as string[];
      if (nyc.length === 0) continue;
      const id = a.author?.id;
      if (!id) continue;
      const existing = byAuthor.get(id) ?? {
        authorId: id,
        name: a.author.display_name ?? "Unknown",
        orcid: a.author.orcid ?? null,
        institutions: [],
        works: [],
        worksCount: null,
        citedByCount: null,
        firstPubYear: null,
        education: [],
        isCurrentStudent: null,
        score: 0,
        brief: null,
      };
      for (const n of nyc) if (!existing.institutions.includes(n)) existing.institutions.push(n);
      existing.works.push({ ...work, position: a.author_position, isCorresponding: !!a.is_corresponding });
      byAuthor.set(id, existing);
    }
  }
  return [...byAuthor.values()];
}
```

Run `pnpm test` → expect `3 passed`.

Commit: `Aggregate OpenAlex works into candidates`.

### 4. Score (TDD, 8 min)

Scoring intent: reward **first-author** recent work on the topic, reward **confirmed current student**, penalize heavy publication history (senior faculty). Deterministic, explainable.

`tests/score.test.ts`
```ts
import { describe, it, expect } from "vitest";
import { score, isCurrentStudent } from "../src/lib/score";
import type { Candidate } from "../src/lib/types";

const base = (o: Partial<Candidate> = {}): Candidate => ({
  authorId: "A1", name: "X", orcid: null, institutions: ["Columbia"],
  works: [{ id: "W1", title: "t", year: 2025, doi: null, url: null, venue: null, citedBy: 0, position: "first", isCorresponding: false }],
  worksCount: 3, citedByCount: 5, firstPubYear: 2024, education: [], isCurrentStudent: null, score: 0, brief: null, ...o,
});

describe("isCurrentStudent", () => {
  it("true when an education entry has no end year", () => {
    expect(isCurrentStudent([{ institution: "Columbia", degree: "PhD", startYear: 2023, endYear: null }])).toBe(true);
  });
  it("false when all education ended", () => {
    expect(isCurrentStudent([{ institution: "Columbia", degree: "PhD", startYear: 2015, endYear: 2020 }])).toBe(false);
  });
  it("null when no education data", () => {
    expect(isCurrentStudent([])).toBeNull();
  });
});

describe("score", () => {
  it("first author beats middle author", () => {
    const first = score(base());
    const middle = score(base({ works: [{ ...base().works[0], position: "middle" }] }));
    expect(first).toBeGreaterThan(middle);
  });
  it("confirmed student beats unknown beats confirmed non-student", () => {
    const s = score(base({ isCurrentStudent: true }));
    const u = score(base({ isCurrentStudent: null }));
    const n = score(base({ isCurrentStudent: false }));
    expect(s).toBeGreaterThan(u);
    expect(u).toBeGreaterThan(n);
  });
  it("senior author with 200 works scores below early-career", () => {
    expect(score(base({ worksCount: 200, firstPubYear: 2005 }))).toBeLessThan(score(base()));
  });
  it("more matching works scores higher", () => {
    const two = base({ works: [base().works[0], { ...base().works[0], id: "W2" }] });
    expect(score(two)).toBeGreaterThan(score(base()));
  });
});
```

Run `pnpm test` → expect FAIL on `../src/lib/score`.

`src/lib/score.ts`
```ts
import type { Candidate, Education } from "./types";

export function isCurrentStudent(edu: Education[]): boolean | null {
  if (edu.length === 0) return null;
  return edu.some((e) => e.endYear === null);
}

const POS: Record<string, number> = { first: 10, middle: 3, last: 1 };

export function score(c: Candidate): number {
  let s = 0;
  for (const w of c.works) {
    s += POS[w.position] ?? 2;
    s += Math.min(w.citedBy, 20) * 0.25;
    if (w.year >= 2025) s += 2;
  }
  if (c.isCurrentStudent === true) s += 15;
  if (c.isCurrentStudent === false) s -= 15;
  if (c.worksCount !== null && c.worksCount > 30) s -= Math.min(20, (c.worksCount - 30) / 5);
  if (c.firstPubYear !== null && c.firstPubYear < 2018) s -= 10;
  return Math.round(s * 10) / 10;
}
```

Run `pnpm test` → expect `7 passed`.

Commit: `Deterministic candidate score with student detection`.

### 5. OpenAlex client (5 min, no test — thin network)

`src/lib/openalex.ts`
```ts
import { INSTITUTION_FILTER } from "./institutions";

const BASE = "https://api.openalex.org";
const mailto = () => (process.env.OPENALEX_MAILTO ? `&mailto=${process.env.OPENALEX_MAILTO}` : "");

export async function searchWorks(keywords: string, perPage = 50): Promise<any[]> {
  const url =
    `${BASE}/works?search=${encodeURIComponent(keywords)}` +
    `&filter=authorships.institutions.id:${INSTITUTION_FILTER},publication_year:2024-2026` +
    `&per-page=${perPage}&select=id,title,publication_year,authorships,primary_location,cited_by_count,doi${mailto()}`;
  const r = await fetch(url, { next: { revalidate: 0 } });
  if (!r.ok) throw new Error(`OpenAlex works ${r.status}`);
  return (await r.json()).results ?? [];
}

export async function getAuthor(authorId: string): Promise<{ worksCount: number; citedByCount: number; firstPubYear: number | null }> {
  const id = authorId.replace("https://openalex.org/", "");
  const r = await fetch(`${BASE}/authors/${id}?select=works_count,cited_by_count,counts_by_year${mailto()}`);
  if (!r.ok) return { worksCount: 0, citedByCount: 0, firstPubYear: null };
  const a = await r.json();
  const years = (a.counts_by_year ?? []).map((y: any) => y.year).filter((y: number) => !!y);
  return {
    worksCount: a.works_count ?? 0,
    citedByCount: a.cited_by_count ?? 0,
    firstPubYear: years.length ? Math.min(...years) : null,
  };
}
```

Verify manually in `node --input-type=module -e` is awkward with TS; instead verify in Task 8 via the API route.

Commit: `OpenAlex client`.

### 6. ORCID client (4 min)

`src/lib/orcid.ts`
```ts
import type { Education } from "./types";

export async function getEducation(orcidUrl: string | null): Promise<Education[]> {
  if (!orcidUrl) return [];
  const id = orcidUrl.replace("https://orcid.org/", "");
  try {
    const r = await fetch(`https://pub.orcid.org/v3.0/${id}/educations`, { headers: { Accept: "application/json" } });
    if (!r.ok) return [];
    const d = await r.json();
    const out: Education[] = [];
    for (const g of d["affiliation-group"] ?? []) {
      for (const s of g.summaries ?? []) {
        const e = s["education-summary"];
        if (!e) continue;
        out.push({
          institution: e.organization?.name ?? "Unknown",
          degree: e["role-title"] ?? null,
          startYear: e["start-date"]?.year?.value ? Number(e["start-date"].year.value) : null,
          endYear: e["end-date"]?.year?.value ? Number(e["end-date"].year.value) : null,
        });
      }
    }
    return out;
  } catch {
    return [];
  }
}
```

Commit: `ORCID education client`.

### 7. LLM: parse query + write brief (6 min)

`src/lib/llm.ts`
```ts
import OpenAI from "openai";
import type { Candidate } from "./types";

const client = new OpenAI({ apiKey: process.env.NICRRON_API_KEY, baseURL: "https://api.nicrron.ai/v1" });
const MODEL = "anthropic/claude-haiku-5-5";

async function ask(content: string, max_tokens: number): Promise<string> {
  const r = await client.chat.completions.create({ model: MODEL, max_tokens, messages: [{ role: "user", content }] });
  return r.choices[0]?.message?.content?.trim() ?? "";
}

export async function parseQuery(q: string): Promise<{ keywords: string }> {
  const text = await ask(`Turn this VC sourcing request into 2-5 search keywords for an academic paper search engine. Output ONLY the keywords separated by spaces, nothing else.\n\nRequest: ${q}`, 100);
  return { keywords: text || q };
}

export async function writeBrief(c: Candidate, query: string): Promise<string> {
  const works = c.works.slice(0, 3).map((w) => `- [${w.position} author, ${w.year}${w.venue ? ", " + w.venue : ""}] ${w.title}`).join("\n");
  const edu = c.education.map((e) => `${e.degree ?? "degree"} at ${e.institution}${e.endYear ? ` (ended ${e.endYear})` : " (current)"}`).join("; ") || "unknown";
  return ask(`You write 3-line "why this student deserves a coffee" briefs for a pre-seed VC. Be concrete, no hype, only use the facts below. Line 1: what they built/published. Line 2: why it fits the VC's thesis. Line 3: the one question to ask them.\n\nVC thesis: ${query}\nName: ${c.name}\nAffiliation: ${c.institutions.join(", ")}\nEducation: ${edu}\nTotal papers: ${c.worksCount ?? "?"}, citations: ${c.citedByCount ?? "?"}\nMatching papers:\n${works}`, 200);
}
```

Commit: `Claude query parsing and brief generation`.

### 8. API route (6 min)

`src/app/api/search/route.ts`
```ts
import { NextResponse } from "next/server";
import { aggregate } from "@/lib/aggregate";
import { score, isCurrentStudent } from "@/lib/score";
import { searchWorks, getAuthor } from "@/lib/openalex";
import { getEducation } from "@/lib/orcid";
import { parseQuery, writeBrief } from "@/lib/llm";

export const maxDuration = 60;
const cache = new Map<string, any>();

export async function POST(req: Request) {
  const { q } = await req.json();
  if (!q || typeof q !== "string") return NextResponse.json({ error: "q required" }, { status: 400 });
  if (cache.has(q)) return NextResponse.json(cache.get(q));

  const { keywords } = await parseQuery(q);
  const works = await searchWorks(keywords);
  let candidates = aggregate(works);

  // cheap pre-rank, then enrich only the top 15
  candidates.forEach((c) => (c.score = score(c)));
  candidates.sort((a, b) => b.score - a.score);
  const top = candidates.slice(0, 15);

  await Promise.all(
    top.map(async (c) => {
      const [author, education] = await Promise.all([getAuthor(c.authorId), getEducation(c.orcid)]);
      Object.assign(c, author, { education, isCurrentStudent: isCurrentStudent(education) });
      c.score = score(c);
    })
  );
  top.sort((a, b) => b.score - a.score);
  const final = top.slice(0, 10);
  await Promise.all(final.map(async (c) => (c.brief = await writeBrief(c, q))));

  const payload = { query: q, keywords, totalWorks: works.length, candidates: final };
  cache.set(q, payload);
  return NextResponse.json(payload);
}
```

If `@/lib/...` alias fails (we passed `--no-import-alias`), use relative `../../../lib/...` — or re-run scaffold without that flag. Pick one and be consistent.

Verify: `pnpm dev`, then in another terminal:
```sh
curl -s -X POST localhost:3000/api/search -H 'content-type: application/json' -d '{"q":"students working on protein design with diffusion models"}'
```
Expected: JSON with `keywords`, `totalWorks` > 0, `candidates` array of ≤10 objects each having `name`, `institutions`, `score`, `brief` (non-empty string), `works[0].url`. Should return in < 20 s.

Commit: `Search API route`.

### 9. UI (10 min)

`src/components/CandidateCard.tsx`
```tsx
import type { Candidate } from "@/lib/types";

export function CandidateCard({ c, rank }: { c: Candidate; rank: number }) {
  const status = c.isCurrentStudent === true ? "Current student" : c.isCurrentStudent === false ? "Not a current student" : "Student status unverified";
  const edu = c.education.find((e) => e.endYear === null);
  return (
    <div className="rounded-lg border border-neutral-200 p-4 flex gap-4">
      <div className="text-2xl font-semibold text-neutral-400 w-8">{rank}</div>
      <div className="flex-1 space-y-2">
        <div className="flex items-baseline gap-3">
          <h3 className="text-lg font-semibold">{c.name}</h3>
          <span className="text-sm text-neutral-500">{c.institutions.join(" · ")}</span>
          <span className={`text-xs px-2 py-0.5 rounded ${c.isCurrentStudent ? "bg-green-100 text-green-800" : "bg-neutral-100 text-neutral-600"}`}>{status}{edu ? ` — ${edu.degree ?? ""} ${edu.institution}` : ""}</span>
        </div>
        {c.brief && <p className="whitespace-pre-line text-sm">{c.brief}</p>}
        <ul className="text-sm space-y-1">
          {c.works.slice(0, 3).map((w) => (
            <li key={w.id}>
              <span className="text-neutral-500">[{w.position} author, {w.year}{w.venue ? `, ${w.venue}` : ""}]</span>{" "}
              {w.url ? <a className="underline" href={w.url} target="_blank" rel="noreferrer">{w.title}</a> : w.title}
            </li>
          ))}
        </ul>
        <div className="text-xs text-neutral-500 flex gap-4">
          <span>score {c.score}</span>
          <span>{c.worksCount ?? "?"} papers · {c.citedByCount ?? "?"} citations</span>
          <a className="underline" href={c.authorId} target="_blank" rel="noreferrer">OpenAlex</a>
          {c.orcid && <a className="underline" href={c.orcid} target="_blank" rel="noreferrer">ORCID</a>}
        </div>
      </div>
    </div>
  );
}
```

`src/app/page.tsx`
```tsx
"use client";
import { useState } from "react";
import { CandidateCard } from "@/components/CandidateCard";
import type { Candidate } from "@/lib/types";

const EXAMPLES = [
  "students working on protein design with diffusion models",
  "LLM agents for software engineering",
  "battery materials discovery with machine learning",
];

export default function Home() {
  const [q, setQ] = useState(EXAMPLES[0]);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<{ keywords: string; totalWorks: number; candidates: Candidate[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(query = q) {
    setLoading(true); setError(null); setData(null);
    try {
      const r = await fetch("/api/search", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ q: query }) });
      if (!r.ok) throw new Error(await r.text());
      setData(await r.json());
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  }

  return (
    <main className="max-w-3xl mx-auto p-8 space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Labscout</h1>
        <p className="text-neutral-600">PitchBook for students. Describe your thesis; get the NYC students already publishing on it.</p>
      </header>
      <form onSubmit={(e) => { e.preventDefault(); run(); }} className="flex gap-2">
        <input className="flex-1 border rounded px-3 py-2" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. students working on protein design with diffusion models" />
        <button className="bg-black text-white rounded px-4 py-2 disabled:opacity-50" disabled={loading}>{loading ? "Searching…" : "Find students"}</button>
      </form>
      <div className="flex gap-2 flex-wrap text-sm">
        {EXAMPLES.map((e) => <button key={e} className="border rounded-full px-3 py-1 hover:bg-neutral-100" onClick={() => { setQ(e); run(e); }}>{e}</button>)}
      </div>
      {error && <p className="text-red-600 text-sm">{error}</p>}
      {data && (
        <section className="space-y-3">
          <p className="text-sm text-neutral-500">Searched OpenAlex for “{data.keywords}” across Columbia, NYU, Cornell and Cornell Tech (2024–26): {data.totalWorks} papers → {data.candidates.length} ranked students.</p>
          {data.candidates.map((c, i) => <CandidateCard key={c.authorId} c={c} rank={i + 1} />)}
        </section>
      )}
    </main>
  );
}
```

Delete the default content of `src/app/page.tsx` entirely before pasting. Leave `layout.tsx` as scaffolded; change `<title>` metadata to `Labscout — PitchBook for students`.

Verify: `pnpm dev` → http://localhost:3000 → click an example chip → ≤20 s later 10 cards with green "Current student" badges on some, briefs, clickable paper links.

Commit: `Search UI with ranked candidate cards`.

### 10. Deploy (5 min)

```sh
vercel link --yes --project labscout --scope jakdemir   # personal account, NOT protocogni
vercel env add NICRRON_API_KEY production        # paste when prompted
vercel env add OPENALEX_MAILTO production
vercel --prod
```
Expected: `✅ Production: https://labscout-<hash>.vercel.app`. Open it, run one search end-to-end. Then push: `git push`.

If a search exceeds 10 s on Hobby plan it will 504 — `maxDuration = 60` requires a Pro team; `protocogni` is Pro. If not, reduce enrich set to top 8 and briefs to top 6.

Commit: `Vercel config` (if any files changed).

### 11. README + Devpost inputs (5 min, Mirah/Yi in parallel with 9–10)

Update `README.md` with: one-liner, how it works (4 bullets: OpenAlex → aggregate → ORCID student check → Claude brief), data sources with links, live URL, "run locally" (`pnpm i`, `.env.local`, `pnpm dev`), team.

Devpost form needs: description, track (1), sponsor award (none unless Akta is wired), founder brief (problem / customer / interview evidence / market / competition / business model / why now — Mirah's doc), tools (Next.js, OpenAlex, ORCID, Claude via Nicrron, Vercel), repo URL, live URL, ≤3-min video (Yi records a screen capture of one search + one card walkthrough; QuickTime is fine).

## Validation checklist (before 17:00)

- [ ] `pnpm test` → `7 passed`
- [ ] `pnpm build` → no type errors
- [ ] Production URL returns results for all 3 example chips
- [ ] Every card has ≥1 clickable paper link and an OpenAlex link (Execution: "where every claim comes from")
- [ ] `git status` clean, `git log origin/main..main` empty
- [ ] Devpost submitted with video ≤ 3:00

## Cut-lines (in order, if behind schedule)

1. Drop Claude brief → show works list only (saves Task 7's `writeBrief`).
2. Drop ORCID enrichment → badge becomes "early-career (first paper ≥ 2023)" from OpenAlex `counts_by_year` only.
3. Drop Claude query parse → send the raw query to OpenAlex `search=`.

## Stretch (only if everything above is green by 15:30)

- GitHub enrichment: `GET https://api.github.com/search/users?q=<name>+in:name` → repos count, link. Adds "shipped code" signal.
- Akta API (Wokelo) call per candidate's lab/startup → enter Best Use of External Data. Needs the key from the Stripe signup you do yourself.
- "Copy brief" button → forwardable text (Design criterion).

## Risks / open questions

- **OpenAlex shared IP budget** at Betaworks: 150 people on one network. Mitigation: register a free key (`https://openalex.org/settings/api`) in the first 5 minutes and append `api_key=`; the in-memory cache makes repeat demo queries free.
- **Student detection coverage**: only authors with ORCID + filled education get a verified badge; many undergrads/MS students have none. Score treats unknown as neutral; the UI says "unverified" honestly rather than guessing.
- **Faculty leakage**: last-author profs will appear with low scores. Acceptable; the penalty terms in `score.ts` push them down, and the badge makes it obvious.
- **Haiku-via-Nicrron latency** for 10 briefs in parallel ≈ 3–5 s. Fine. If Nicrron rate-limits, fall back to `openai/gpt-5.4-mini` (same endpoint) — one-line change in `llm.ts`.
- **Name collisions** across OpenAlex author IDs are rare but exist; we key by author ID, not name.
- Should the demo also include MIT/Stanford to show it generalizes? No — NYC-only is the story ("your judges' backyard"). Keep the map editable in one file.

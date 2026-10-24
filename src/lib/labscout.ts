import fixture from "@/lib/mock-search.json";

const BASE_URL = process.env.LABSCOUT_API_URL ?? "https://labscout-nyc.vercel.app";

/** The upstream search runs OpenAlex, ORCID, akta.pro and the briefs in one call. */
const TIMEOUT_MS = 60_000;

export type Work = {
  title: string;
  year: number | null;
  venue: string | null;
  url: string | null;
  position: "first" | "middle" | "last";
  citedBy: number | null;
};

export type Mention = {
  title: string;
  url: string;
  publisher: string | null;
  publishedDate: string | null;
  summary: string | null;
};

export type Education = {
  institution: string | null;
  degree: string | null;
  startYear: number | null;
  endYear: number | null;
};

export type Signal = {
  source: string;
  kind: string;
  label: string;
  url: string | null;
  date: string | null;
  weight: number;
};

export type Candidate = {
  authorId: string;
  name: string;
  orcid: string | null;
  institutions: string[];
  works: Work[];
  worksCount: number;
  citedByCount: number;
  recentWorksCount: number;
  firstPubYear: number | null;
  reasons: string[];
  mentions: Mention[];
  education: Education[];
  /** null means ORCID had nothing, which is not the same as "not a student". */
  isCurrentStudent: boolean | null;
  score: number;
  brief: string;
  signals?: Signal[];
};

export type MarketItem = {
  title: string;
  url: string;
  publisher: string | null;
  publishedDate: string | null;
  sentiment: string | null;
  summary: string | null;
  companies?: string[];
};

export type SearchResult = {
  query: string;
  keywords: string;
  totalWorks: number;
  candidates: Candidate[];
  market: MarketItem[];
  roundtable: { path: string; version: string } | null;
  integrations: { nicrron: boolean; prism: boolean; akta: boolean; roundtable: boolean };
};

/** The density readout that lets an investor pick a niche on evidence. */
export type Probe = {
  query: string;
  label: string;
  totalWorks: number;
  candidates: number;
  verifiedStudents: number;
  topScore: number;
  topNames: string[];
  marketHeadlines: number;
  /** Ranked people set aside as faculty or as unjudgeable profiles. */
  setAside: number;
  error?: string;
};

export type Standing = "student" | "unverified" | "ended" | "senior" | "incomplete";

/**
 * Upstream marks a professor as a current student whenever their ORCID
 * education entry has no end date, so one faculty member can top every niche.
 * It also sometimes returns a candidate with no profile stats at all, which
 * defeats its own faculty penalty. The thresholds here are upstream's own.
 */
export function standing(candidate: Candidate): Standing {
  if (candidate.worksCount === 0 && candidate.firstPubYear === null) return "incomplete";
  if (candidate.worksCount > 30) return "senior";
  if (candidate.firstPubYear !== null && candidate.firstPubYear < 2018) return "senior";
  if (candidate.isCurrentStudent === true) return "student";
  if (candidate.isCurrentStudent === false) return "ended";
  return "unverified";
}

export function likelyStudent(candidate: Candidate) {
  const where = standing(candidate);
  return where === "student" || where === "unverified";
}

function mockResult(query: string): SearchResult {
  return { ...(fixture as unknown as SearchResult), query };
}

export async function search(query: string): Promise<SearchResult> {
  if (process.env.LABSCOUT_MOCK === "1") return mockResult(query);

  const response = await fetch(`${BASE_URL}/api/search`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ q: query }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error ?? `Search failed with ${response.status}`);
  }

  return response.json();
}

export function toProbe(label: string, result: SearchResult): Probe {
  const students = result.candidates.filter(likelyStudent);

  return {
    query: result.query,
    label,
    totalWorks: result.totalWorks,
    candidates: result.candidates.length,
    verifiedStudents: students.filter((one) => one.isCurrentStudent === true).length,
    topScore: students[0]?.score ?? 0,
    topNames: students.slice(0, 3).map((one) => one.name),
    marketHeadlines: result.market.length,
    setAside: result.candidates.length - students.length,
  };
}

/**
 * Probes run concurrently, so the wall clock is roughly one search rather than
 * one per niche. A probe also warms the upstream cache, which makes the full
 * search for the chosen niche come back fast.
 */
export async function probeAll(niches: { label: string; query: string }[]): Promise<Probe[]> {
  const settled = await Promise.allSettled(niches.map((niche) => search(niche.query)));

  return settled.map((outcome, index) => {
    const niche = niches[index];

    if (outcome.status === "fulfilled") return toProbe(niche.label, outcome.value);

    return {
      query: niche.query,
      label: niche.label,
      totalWorks: 0,
      candidates: 0,
      verifiedStudents: 0,
      topScore: 0,
      topNames: [],
      marketHeadlines: 0,
      setAside: 0,
      error: outcome.reason instanceof Error ? outcome.reason.message : "Probe failed",
    };
  });
}

// GitHub — builder signal (stage 2): repos, stars, forks, outside adoption.
// One GraphQL user search per candidate; strict name + institution/topic disambiguation (common names!).
// Note: `email` is not queried — it needs the user:email scope and fails the whole query for public-read tokens.
import type { Candidate } from "../types.ts";
import type { Signal, SourceModule } from "./types.ts";

export type GhRepo = {
  nameWithOwner: string; url: string; description: string | null; stargazerCount: number; forkCount: number;
  pushedAt: string | null; primaryLanguage: { name: string } | null;
  repositoryTopics?: { nodes: { topic: { name: string } }[] };
};
export type GhUser = {
  login: string; name: string | null; bio: string | null; company: string | null; location: string | null;
  websiteUrl: string | null; url: string; email: string | null; repositories?: { nodes: GhRepo[] };
};

export const QUERY = `query($q: String!) { search(query: $q, type: USER, first: 5) { nodes { ... on User {
  login name bio company location websiteUrl url
  repositories(first: 5, ownerAffiliations: OWNER, isFork: false, orderBy: {field: STARGAZERS, direction: DESC}) {
    nodes { nameWithOwner url description stargazerCount forkCount pushedAt primaryLanguage { name }
      repositoryTopics(first: 5) { nodes { topic { name } } } } } } } } }`;

export const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  .replace(/[^a-z\s-]/g, " ").replace(/[-\s]+/g, " ").trim();

/** Same person name: exact tokens, or same first+last with middle names/initials omitted on either side. */
export function sameName(a: string, b: string): boolean {
  const x = norm(a).split(" ").filter(Boolean), y = norm(b).split(" ").filter(Boolean);
  if (!x.length || !y.length) return false;
  if (x.join(" ") === y.join(" ")) return true;
  if (x.length < 2 || y.length < 2) return false;
  return x[0] === y[0] && x[x.length - 1] === y[y.length - 1];
}

const INST_PATTERNS: Record<string, RegExp[]> = {
  Columbia: [/columbia/i],
  NYU: [/\bnyu\b/i, /new york university/i],
  Cornell: [/cornell/i],
  "Cornell Tech": [/cornell/i],
};

function institutionEvidence(c: Candidate, u: GhUser): number {
  const text = [u.bio, u.company, u.location, u.websiteUrl, u.email].filter(Boolean).join(" ");
  let n = 0;
  const pats = new Set<RegExp>();
  for (const inst of c.institutions) for (const p of INST_PATTERNS[inst] ?? [new RegExp(inst.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")]) pats.add(p);
  for (const p of pats) if (p.test(text)) n += 2;
  if (/\.edu(?![.\w])/i.test(text)) n += 1; // US .edu only, not .edu.cn etc.
  return n;
}

/** Number of distinct thesis keywords (>3 chars) found in the user's repo names/descriptions/topics. */
function keywordHits(u: GhUser, keywords: string): number {
  const kws = new Set(norm(keywords).split(" ").filter((w) => w.length > 3));
  const words = new Set<string>();
  for (const r of u.repositories?.nodes ?? []) {
    const text = norm([r.nameWithOwner.replace(/[/_.-]/g, " "), r.description ?? "", ...(r.repositoryTopics?.nodes ?? []).map((t) => t.topic.name)].join(" "));
    for (const w of text.split(" ")) words.add(w);
  }
  return [...kws].filter((k) => words.has(k)).length;
}

/** Picks the GitHub user that is the candidate, or null when ambiguous / unsupported by evidence. */
// Institution evidence is enough on its own. Topic-only evidence (no institution) is weak for common names, so it
// needs >=2 distinct thesis keywords AND the candidate's name must be unique among the search results.
export function pickUser(c: Candidate, users: GhUser[], keywords: string): GhUser | null {
  const named = users.filter((u) => u && u.login && u.name && sameName(u.name, c.name));
  const ok = named
    .map((u) => ({ u, inst: institutionEvidence(c, u), kw: named.length === 1 && keywordHits(u, keywords) >= 2 }))
    .filter((x) => x.inst > 0 || x.kw);
  if (!ok.length) return null;
  ok.sort((a, b) => b.inst - a.inst || Number(b.kw) - Number(a.kw));
  if (ok.length > 1 && ok[0].inst === ok[1].inst && ok[0].kw === ok[1].kw) return null;
  return ok[0].u;
}

const MONTH = 30 * 24 * 3600 * 1000;
const fmt = (n: number) => (n >= 1000 ? `${Math.round(n / 100) / 10}k` : String(n));

export function toSignals(u: GhUser, now = Date.now()): Signal[] {
  const snippet = (u.company || u.bio || "").replace(/\s+/g, " ").trim().slice(0, 80);
  const out: Signal[] = [{ source: "github", stage: 2, kind: "profile", label: `GitHub @${u.login}${snippet ? ` — ${snippet}` : ""}`, url: u.url, date: null, weight: 2 }];
  for (const r of u.repositories?.nodes ?? []) {
    const pushed = r.pushedAt ? Date.parse(r.pushedAt) : NaN;
    const age = Number.isFinite(pushed) ? now - pushed : Infinity;
    if (!(r.stargazerCount >= 5 || age <= 12 * MONTH)) continue;
    const weight = Math.min(6, Math.round(Math.log10(r.stargazerCount + 1) * 3)) + (age <= 6 * MONTH ? 1 : 0) + (r.forkCount >= 10 ? 1 : 0);
    const label = `${r.nameWithOwner} — ${fmt(r.stargazerCount)}★, ${r.forkCount} fork${r.forkCount === 1 ? "" : "s"}${r.primaryLanguage?.name ? `, ${r.primaryLanguage.name}` : ""}`;
    out.push({ source: "github", stage: 2, kind: "repo", label, url: r.url, date: r.pushedAt ?? null, weight });
  }
  return out;
}

export const source: SourceModule = {
  id: "github",
  enabled: () => !!process.env.GITHUB_TOKEN,
  async enrich(c, ctx) {
    try {
      const name = c.name.replace(/["\\]/g, " ").trim();
      if (!name) return [];
      const r = await fetch("https://api.github.com/graphql", {
        method: "POST",
        headers: { authorization: "bearer " + process.env.GITHUB_TOKEN, "content-type": "application/json", "user-agent": "labscout" },
        body: JSON.stringify({ query: QUERY, variables: { q: `${name} in:name type:user` } }),
        signal: AbortSignal.timeout(15000),
      });
      if (r.status !== 200) return [];
      const j: any = await r.json();
      const users: GhUser[] = (j?.data?.search?.nodes ?? []).filter((n: any) => n && n.login);
      const u = pickUser(c, users, ctx.keywords);
      return u ? toSignals(u) : [];
    } catch {
      return [];
    }
  },
};

// Hugging Face — builder signal (stage 2): models, datasets, Spaces and HF Papers by the candidate.
// Endpoints (verified 200, no key):
//   https://huggingface.co/api/papers/search?q=<title> -> [{paper:{id,title,upvotes,publishedAt,authors:[{name,user?:{user,fullname}}]}}]
//   https://huggingface.co/api/users/<user>/overview   -> {fullname, numModels, numDatasets, numSpaces, details, ...}
//   https://huggingface.co/api/{models|datasets|spaces}?author=<user>&sort=downloads&expand[]=downloads&expand[]=likes&expand[]=lastModified
// Quirk: list endpoints omit lastModified unless requested via expand[]; with expand[] ONLY those fields come back.
// Spaces have no download counts, so they are weighted by likes.
// Disambiguation: the username is only taken from an HF paper whose title matches one of the candidate's works
// (sharesWork) AND whose author entry namesMatch the candidate and is linked to an HF account.
import type { Candidate } from "../types.ts";
import type { Signal, SourceModule } from "./types.ts";
import { namesMatch, sharesWork } from "./match.ts";

export type HfPaper = { id: string; title?: string; upvotes?: number; publishedAt?: string; authors?: { name?: string; user?: { user?: string; fullname?: string } }[] };
export type HfArtifact = { id: string; downloads?: number; likes?: number; lastModified?: string; pipeline_tag?: string };
export type HfKind = "model" | "dataset" | "space";

const H = { "user-agent": "labscout/0.1" };
const YEAR = 365 * 24 * 3600 * 1000;
export const fmt = (n: number) => (n >= 1e9 ? `${Math.round(n / 1e8) / 10}B` : n >= 1e6 ? `${Math.round(n / 1e5) / 10}M` : n >= 1000 ? `${Math.round(n / 100) / 10}k` : String(n));

async function get(url: string): Promise<any> {
  try {
    const r = await fetch(url, { headers: H, signal: AbortSignal.timeout(12000) });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

/** HF username of the candidate: an author of a paper that is one of the candidate's works, linked to an HF account. */
export function findHfUser(c: Candidate, papers: HfPaper[]): string | null {
  for (const p of papers) {
    if (!p || !sharesWork(c, p.title)) continue;
    const a = (p.authors ?? []).find((x) => x?.user?.user && (namesMatch(x.name ?? "", c.name) || namesMatch(x.user.fullname ?? "", c.name)));
    if (a?.user?.user) return a.user.user;
  }
  return null;
}

/** HF Papers (upvotes >= 5) the candidate authored (shared work + name on the author list); max 2, +2 each. */
export function hfPaperSignals(c: Candidate, papers: HfPaper[]): Signal[] {
  const seen = new Set<string>();
  return papers
    .filter((p) => p?.id && (p.upvotes ?? 0) >= 5 && sharesWork(c, p.title) && (p.authors ?? []).some((a) => namesMatch(a?.name ?? "", c.name)))
    .filter((p) => !seen.has(p.id) && seen.add(p.id))
    .sort((a, b) => (b.upvotes ?? 0) - (a.upvotes ?? 0)).slice(0, 2)
    .map((p) => ({ source: "huggingface", stage: 2, kind: "paper", label: `HF Papers: ${String(p.title).replace(/\s+/g, " ")} — ${p.upvotes} upvotes`,
      url: `https://huggingface.co/papers/${p.id}`, date: p.publishedAt ?? null, weight: 2 }));
}

/** One signal per notable artifact (downloads >= 100, likes >= 5, or modified in the last 12 months). */
export function hfArtifactSignals(kind: HfKind, items: HfArtifact[], now = Date.now()): Signal[] {
  const out: Signal[] = [];
  for (const a of items ?? []) {
    if (!a?.id) continue;
    const dl = a.downloads ?? 0, likes = a.likes ?? 0;
    const t = a.lastModified ? Date.parse(a.lastModified) : NaN;
    const recent = Number.isFinite(t) && now - t <= YEAR;
    if (!(dl >= 100 || likes >= 5 || recent)) continue;
    const base = kind === "space" ? Math.round(Math.log10(likes + 1) * 2) : Math.round(Math.log10(dl + 1) * 2);
    const weight = Math.max(1, Math.min(6, base) + (likes >= 20 ? 1 : 0));
    const stats = [kind !== "space" ? `${fmt(dl)} downloads` : "", `${fmt(likes)} like${likes === 1 ? "" : "s"}`].filter(Boolean).join(", ");
    const prefix = kind === "dataset" ? "datasets/" : kind === "space" ? "spaces/" : "";
    out.push({ source: "huggingface", stage: 2, kind, label: `HF ${kind} ${a.id} — ${stats}${a.pipeline_tag ? ` (${a.pipeline_tag})` : ""}`,
      url: `https://huggingface.co/${prefix}${a.id}`, date: a.lastModified ?? null, weight });
  }
  return out;
}

/** Profile (+2) first, then highest-weight artifacts/papers until the 15-point cap. */
export function hfToSignals(user: string, artifacts: Signal[], papers: Signal[], fullname?: string | null): Signal[] {
  const out: Signal[] = [{ source: "huggingface", stage: 2, kind: "profile", label: `Hugging Face @${user}${fullname ? ` — ${fullname}` : ""}`,
    url: `https://huggingface.co/${user}`, date: null, weight: 2 }];
  let total = 2;
  for (const s of [...artifacts, ...papers].sort((a, b) => b.weight - a.weight)) {
    if (total + s.weight > 15) continue;
    total += s.weight;
    out.push(s);
  }
  return out;
}

const EXPAND = "&expand[]=downloads&expand[]=likes&expand[]=lastModified";

export const source: SourceModule = {
  id: "huggingface",
  enabled: () => true,
  async enrich(c: Candidate): Promise<Signal[]> {
    try {
      const titles = (c?.works ?? []).map((w) => w.title).filter((t) => t && t.length > 10).slice(0, 3);
      if (!c?.name || !titles.length) return [];
      const res = await Promise.all(titles.map((t) => get(`https://huggingface.co/api/papers/search?q=${encodeURIComponent(t)}`)));
      const papers: HfPaper[] = res.flatMap((r) => (Array.isArray(r) ? r.map((x: any) => x?.paper).filter(Boolean) : []));
      const user = findHfUser(c, papers);
      if (!user) return [];
      const u = encodeURIComponent(user);
      const ov = await get(`https://huggingface.co/api/users/${u}/overview`);
      const want = (n: unknown) => typeof n !== "number" || n > 0; // overview missing -> query anyway
      const [models, datasets, spaces] = await Promise.all([
        want(ov?.numModels) ? get(`https://huggingface.co/api/models?author=${u}&sort=downloads&limit=20${EXPAND}&expand[]=pipeline_tag`) : [],
        want(ov?.numDatasets) ? get(`https://huggingface.co/api/datasets?author=${u}&sort=downloads&limit=20${EXPAND}`) : [],
        want(ov?.numSpaces) ? get(`https://huggingface.co/api/spaces?author=${u}&sort=likes&limit=20&expand[]=likes&expand[]=lastModified`) : [],
      ]);
      const arr = (x: any) => (Array.isArray(x) ? x : []);
      const artifacts = [...hfArtifactSignals("model", arr(models)), ...hfArtifactSignals("dataset", arr(datasets)), ...hfArtifactSignals("space", arr(spaces))];
      return hfToSignals(user, artifacts, hfPaperSignals(c, papers), ov?.fullname ?? null);
    } catch {
      return [];
    }
  },
};

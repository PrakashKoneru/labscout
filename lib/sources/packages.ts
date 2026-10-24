// Packages (PyPI + npm) — builder signal (stage 2, wave 2): published packages with real monthly downloads.
// Wave 2: package names are derived from GitHub repo signals (and Hugging Face artifacts) found in wave 1.
// Endpoints (verified 200, no key):
//   https://pypi.org/pypi/<name>/json                       -> {info:{name, author, maintainer, home_page, project_urls, package_url}, urls:[{upload_time_iso_8601}]}
//   https://pypistats.org/api/packages/<name>/recent        -> {data:{last_day, last_week, last_month}}
//   https://registry.npmjs.org/<name>/latest                -> {name, repository:{url}|string, author:{name}|string, homepage}
//   https://api.npmjs.org/downloads/point/last-month/<name> -> {downloads}
// Quirk: the full npm packument (/<name>) can be many MB; /latest is small but has no publish time (date = null).
// Disambiguation: a package counts only if its metadata links the candidate's GitHub repo, or (for names without a
// repo, e.g. from HF) the PyPI/npm author namesMatch the candidate. Otherwise it is a namesake package.
import type { Candidate } from "../types.ts";
import type { Signal, SourceModule } from "./types.ts";
import { namesMatch } from "./match.ts";

export type PkgCandidate = { name: string; repo: string | null }; // repo = "owner/name" (lowercase) when from GitHub

const H = { "user-agent": "labscout/0.1" };
const fmt = (n: number) => (n >= 1e9 ? `${Math.round(n / 1e8) / 10}B` : n >= 1e6 ? `${Math.round(n / 1e5) / 10}M` : n >= 1000 ? `${Math.round(n / 100) / 10}k` : String(n));

async function get(url: string): Promise<any> {
  try {
    const r = await fetch(url, { headers: H, signal: AbortSignal.timeout(12000) });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

/** Package names to check: GitHub repo names (with -/_ variants) first, then HF model/space names; max 6 bases. */
export function packageCandidates(c: Candidate, max = 6): PkgCandidate[] {
  const out: PkgCandidate[] = [];
  const seen = new Set<string>();
  const add = (name: string, repo: string | null) => {
    const n = name.toLowerCase().replace(/\.git$/, "");
    if (!/^[a-z0-9][a-z0-9._-]{1,213}$/.test(n) || seen.has(n)) return;
    seen.add(n);
    out.push({ name: n, repo });
  };
  const bases: { name: string; repo: string | null }[] = [];
  for (const s of c.signals ?? []) {
    const gh = s.source === "github" && s.kind === "repo" && s.url?.match(/^https:\/\/github\.com\/([^/]+)\/([^/?#]+)/i);
    if (gh) bases.push({ name: gh[2], repo: `${gh[1]}/${gh[2]}`.toLowerCase() });
    const hf = s.source === "huggingface" && (s.kind === "model" || s.kind === "space") && s.url?.match(/huggingface\.co\/(?:spaces\/)?[^/]+\/([^/?#]+)/);
    if (hf) bases.push({ name: hf[1], repo: null });
  }
  for (const b of bases.slice(0, max)) {
    add(b.name, b.repo);
    add(b.name.replace(/_/g, "-"), b.repo);
    add(b.name.replace(/-/g, "_"), b.repo);
  }
  return out;
}

/** `text` links github.com/<repo> exactly (allowing .git, /subpath, #anchor; rejecting repo-suffix namesakes). */
export function linksRepo(text: string, repo: string): boolean {
  const esc = repo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`github\\.com[/:]${esc}(?![\\w-]|\\.(?!git\\b))`).test(text.toLowerCase());
}

const authorNames = (s: unknown) => String(s ?? "").split(/,|;|\band\b/).map((x) => x.replace(/<[^>]*>/g, "").trim()).filter(Boolean);

/** True if PyPI metadata links the repo, or (no repo known) an author/maintainer name matches the candidate. */
export function pypiOwned(c: Candidate, info: any, repo: string | null): boolean {
  if (!info) return false;
  const links = [info.home_page, info.download_url, info.project_url, ...Object.values(info.project_urls ?? {})].join(" ").toLowerCase();
  if (repo) return linksRepo(links, repo);
  return [...authorNames(info.author), ...authorNames(info.maintainer)].some((n) => namesMatch(n, c.name));
}

/** Same for an npm /latest document. */
export function npmOwned(c: Candidate, doc: any, repo: string | null): boolean {
  if (!doc) return false;
  const r = typeof doc.repository === "string" ? doc.repository : doc.repository?.url;
  const links = `${r ?? ""} ${doc.homepage ?? ""} ${typeof doc.bugs === "string" ? doc.bugs : doc.bugs?.url ?? ""}`.toLowerCase();
  if (repo) return linksRepo(links, repo);
  const a = typeof doc.author === "string" ? doc.author.replace(/<.*$/, "") : doc.author?.name;
  return authorNames(a).some((n) => namesMatch(n, c.name));
}

export function packageSignal(registry: "PyPI" | "npm", name: string, monthly: number, date: string | null): Signal | null {
  const weight = Math.min(7, Math.round(Math.log10(monthly + 1) * 1.75));
  if (!(weight >= 1)) return null;
  const url = registry === "PyPI" ? `https://pypi.org/project/${name}/` : `https://www.npmjs.com/package/${name}`;
  return { source: "packages", stage: 2, kind: "package", label: `${registry} ${name} — ${fmt(monthly)} downloads/month`, url, date, weight };
}

/** Dedupe by url, highest weight first, total <= 15. */
export function capSignals(all: Signal[]): Signal[] {
  const out: Signal[] = [];
  const seen = new Set<string>();
  let total = 0;
  for (const s of [...all].sort((a, b) => b.weight - a.weight)) {
    if (seen.has(String(s.url)) || total + s.weight > 15) continue;
    seen.add(String(s.url));
    total += s.weight;
    out.push(s);
  }
  return out;
}

async function pypi(c: Candidate, p: PkgCandidate): Promise<Signal | null> {
  const j = await get(`https://pypi.org/pypi/${encodeURIComponent(p.name)}/json`);
  if (!pypiOwned(c, j?.info, p.repo)) return null;
  const name = String(j.info.name ?? p.name);
  const st = await get(`https://pypistats.org/api/packages/${encodeURIComponent(name.toLowerCase())}/recent`);
  const date = Array.isArray(j.urls) && j.urls[0]?.upload_time_iso_8601 ? j.urls[0].upload_time_iso_8601 : null;
  return packageSignal("PyPI", name, Number(st?.data?.last_month ?? 0), date);
}

async function npm(c: Candidate, p: PkgCandidate): Promise<Signal | null> {
  const d = await get(`https://registry.npmjs.org/${encodeURIComponent(p.name)}/latest`);
  if (!npmOwned(c, d, p.repo)) return null;
  const st = await get(`https://api.npmjs.org/downloads/point/last-month/${encodeURIComponent(p.name)}`);
  return packageSignal("npm", p.name, Number(st?.downloads ?? 0), null);
}

export const source: SourceModule = {
  id: "packages",
  wave: 2,
  enabled: () => true,
  async enrich(c: Candidate): Promise<Signal[]> {
    try {
      const cands = packageCandidates(c);
      if (!cands.length) return [];
      // PyPI treats -/_ as equivalent, so only probe one spelling per base there; npm gets every variant.
      const py = cands.filter((p, i) => cands.findIndex((q) => q.name.replace(/[-_.]/g, "-") === p.name.replace(/[-_.]/g, "-")) === i);
      const res = await Promise.all([...py.map((p) => pypi(c, p)), ...cands.map((p) => npm(c, p))]);
      return capSignals(res.filter((s): s is Signal => !!s));
    } catch {
      return [];
    }
  },
};

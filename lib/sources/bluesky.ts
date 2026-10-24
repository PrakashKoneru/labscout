// Bluesky — commercial pull / spinout intent / early traction (stages 3-5): launch, hiring and high-engagement posts.
// Public AppView, no key (verified 200): app.bsky.actor.searchActors -> app.bsky.actor.getProfile + app.bsky.feed.getAuthorFeed.
// Wave 2: GitHub logins / ORCID from wave-1 signals count as identity evidence in the Bluesky bio.
// Quirks: filter=posts_no_replies still returns reposts (feed[].reason set, post.author is someone else) — only the
// actor's own posts count. displayName may be "" (then the actor is skipped: no name evidence).
import type { Candidate } from "../types.ts";
import type { Signal, SourceModule } from "./types.ts";
import { mentionsInstitution, namesMatch, normalizeName, topicOverlap } from "./match.ts";

export type BskyActor = { did: string; handle: string; displayName?: string; description?: string };
export type BskyPost = { uri: string; author?: { did: string }; record?: { text?: string; createdAt?: string }; likeCount?: number; repostCount?: number };
export type BskyFeedItem = { post: BskyPost; reason?: unknown };

const API = "https://public.api.bsky.app/xrpc/";
const H = { "user-agent": "labscout/0.1" };
export const LAUNCH_RE = /\b(launch(ing|ed)?|we('re| are) (building|hiring)|founding|co-?founder|our startup|stealth|y ?combinator|raised (our|a) (seed|pre-seed|round)|incorporat)/i;
// Tighter than /hiring|join us/: live feeds are full of "join us on the livestream next Wednesday" event posts.
export const HIRING_RE = /\b(we('re| are)? (now )?hiring|now hiring|hiring (a|an|our|for|founding)\b|join our team|join us as)/i;
const ACADEMIC_HIRING = /post-?doc|ph\.?\s?d|faculty|tenure|professor|predoc|phd students?/i; // lab hiring is not startup hiring

/** GitHub logins (lowercase) and ORCID iDs the candidate is already known by (wave-1 signals + c.orcid). */
export function knownHandles(c: Candidate): { github: string[]; orcid: string[] } {
  const gh = new Set<string>(), orcid = new Set<string>();
  for (const s of c.signals ?? []) {
    const m = (s.url ?? "").match(/^https?:\/\/(?:www\.)?github\.com\/([\w-]+)/i);
    if (m && (s.source === "github" || s.kind === "profile" || s.kind === "repo")) gh.add(m[1].toLowerCase());
    if (s.source === "wikidata") for (const w of s.label.matchAll(/github=([\w-]+)/gi)) gh.add(w[1].toLowerCase());
    for (const o of `${s.label} ${s.url ?? ""}`.matchAll(/\b(\d{4}-\d{4}-\d{4}-\d{3}[\dX])\b/g)) if (s.source === "wikidata" || s.source === "orcid") orcid.add(o[1]);
  }
  const co = (c.orcid ?? "").match(/\d{4}-\d{4}-\d{4}-\d{3}[\dX]/);
  if (co) orcid.add(co[0]);
  return { github: [...gh], orcid: [...orcid] };
}

function evidence(c: Candidate, a: BskyActor, keywords: string): number {
  const d = a.description ?? "";
  const known = knownHandles(c);
  let n = 0;
  if (mentionsInstitution(d, c.institutions)) n += 2;
  if (known.github.some((g) => new RegExp(`github\\.com/${g}(?![\\w-])`, "i").test(d)) || known.orcid.some((o) => d.includes(o))) n += 3;
  const words = new Set(normalizeName(d).split(" "));
  if ([...new Set(normalizeName(keywords).split(" ").filter((w) => w.length > 3))].filter((k) => words.has(k)).length >= 2) n += 1;
  return n;
}

/** The actor that is the candidate, or null when no name+evidence match or two actors tie. */
export function pickActor(c: Candidate, actors: BskyActor[], keywords: string): BskyActor | null {
  const ok = (actors ?? []).filter((a) => a?.did && a.displayName && namesMatch(a.displayName, c.name))
    .map((a) => ({ a, e: evidence(c, a, keywords) })).filter((x) => x.e > 0).sort((x, y) => y.e - x.e);
  if (!ok.length || (ok.length > 1 && ok[0].e === ok[1].e)) return null;
  return ok[0].a;
}

const postUrl = (handle: string, uri: string) => `https://bsky.app/profile/${handle}/post/${uri.split("/").pop()}`;
const snip = (t: string) => t.replace(/\s+/g, " ").trim().slice(0, 100);

export function bskyToSignals(c: Candidate, a: BskyActor, followers: number | null, feed: BskyFeedItem[], keywords: string, now = Date.now()): Signal[] {
  const out: Signal[] = [{
    source: "bluesky", stage: 3, kind: "profile", label: `Bluesky @${a.handle} — ${followers ?? "?"} followers`,
    url: `https://bsky.app/profile/${a.handle}`, date: null, weight: 1,
  }];
  const cutoff = now - 548 * 24 * 3600 * 1000; // 18 months
  let launch = 0, hiring = 0, traction = 0;
  for (const { post: p, reason } of feed ?? []) {
    if (reason || !p?.uri || (p.author && p.author.did !== a.did)) continue; // own posts only, no reposts
    const text = p.record?.text ?? "", date = p.record?.createdAt ?? null, t = date ? Date.parse(date) : NaN;
    if (!text || !(t >= cutoff)) continue;
    const base = { source: "bluesky" as const, label: `Bluesky post (${date!.slice(0, 10)}): ${snip(text)}`, url: postUrl(a.handle, p.uri), date };
    const isHiring = HIRING_RE.test(text) && !ACADEMIC_HIRING.test(text);
    const isLaunch = LAUNCH_RE.test(text.replace(/we('re| are) hiring/gi, "")); // a bare "we're hiring" is a hiring post only
    if (!launch && isLaunch) { launch++; out.push({ ...base, stage: 4, kind: "launch_post", weight: 6 }); }
    if (!hiring && isHiring) { hiring++; out.push({ ...base, stage: 5, kind: "hiring_post", weight: 4 }); }
    if (!isLaunch && !isHiring && traction < 2 && (p.likeCount ?? 0) >= 50 && topicOverlap(c, text, keywords)) { traction++; out.push({ ...base, stage: 5, kind: "traction_post", weight: 2 }); }
  }
  let total = 0;
  return out.filter((s) => (total + s.weight <= 15 ? ((total += s.weight), true) : false));
}

async function get(path: string): Promise<any> {
  const r = await fetch(API + path, { headers: H, signal: AbortSignal.timeout(12000) });
  if (!r.ok) throw new Error(`bluesky ${r.status}`);
  return r.json();
}

export const source: SourceModule = {
  id: "bluesky",
  wave: 2,
  enabled: () => true,
  async enrich(c, ctx) {
    try {
      if (!c?.name?.trim()) return [];
      const s = await get(`app.bsky.actor.searchActors?q=${encodeURIComponent(c.name.trim())}&limit=10`);
      const a = pickActor(c, s?.actors ?? [], ctx?.keywords ?? "");
      if (!a) return [];
      const did = encodeURIComponent(a.did);
      const [prof, feed] = await Promise.all([
        get(`app.bsky.actor.getProfile?actor=${did}`).catch(() => null),
        get(`app.bsky.feed.getAuthorFeed?actor=${did}&limit=50&filter=posts_no_replies`).catch(() => null),
      ]);
      return bskyToSignals(c, a, prof?.followersCount ?? null, feed?.feed ?? [], ctx?.keywords ?? "");
    } catch {
      return [];
    }
  },
};

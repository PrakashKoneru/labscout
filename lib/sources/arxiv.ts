// arXiv — research velocity (stage 1): recent preprints by the candidate on-topic.
// Endpoint (verified 200, Atom XML): http://export.arxiv.org/api/query?search_query=au:"First Last"
// One request per candidate. No key needed.
import type { Candidate } from "../types.ts";
import type { Signal, SourceModule, SourceContext } from "./types.ts";
import { namesMatch, sharesWork, topicOverlap } from "./match.ts";

export type ArxivEntry = { id: string; url: string; title: string; summary: string; published: string; authors: string[] };

function decode(s: string): string {
  return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

function tag(block: string, name: string): string {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  return m ? decode(m[1]) : "";
}

export function parseArxivAtom(xml: string): ArxivEntry[] {
  const out: ArxivEntry[] = [];
  for (const m of String(xml ?? "").matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const b = m[1];
    const id = tag(b, "id");
    const alt = b.match(/<link[^>]*href="([^"]+)"[^>]*rel="alternate"/) ?? b.match(/<link[^>]*rel="alternate"[^>]*href="([^"]+)"/);
    const authors = [...b.matchAll(/<author>\s*<name>([\s\S]*?)<\/name>/g)].map((a) => decode(a[1]));
    out.push({
      id, url: alt ? alt[1] : id.replace(/^http:/, "https:"),
      title: tag(b, "title"), summary: tag(b, "summary"), published: tag(b, "published"), authors,
    });
  }
  return out;
}

export function arxivToSignals(c: Candidate, entries: ArxivEntry[], keywords: string, now = new Date()): Signal[] {
  const cutoff = now.getTime() - 365 * 24 * 3600 * 1000;
  const recent = entries.filter((e) => {
    const t = Date.parse(e.published);
    return Number.isFinite(t) && t >= cutoff &&
      e.authors.some((a) => namesMatch(a, c.name)) &&
      (sharesWork(c, e.title) || topicOverlap(c, `${e.title} ${e.summary}`, keywords));
  });
  const signals: Signal[] = recent.slice(0, 3).map((e) => ({
    source: "arxiv", stage: 1, kind: "preprint",
    label: `arXiv: ${e.title} (${e.published.slice(0, 7)})`,
    url: e.url, date: e.published || null, weight: 2,
  }));
  if (recent.length >= 3) signals.push({
    source: "arxiv", stage: 1, kind: "velocity",
    label: `arXiv: ${recent.length}${recent.length >= 10 ? "+" : ""} on-topic preprints in the last 12 months`,
    url: `https://arxiv.org/search/?searchtype=author&query=${encodeURIComponent(c.name)}`,
    date: recent[0].published || null, weight: 3,
  });
  return signals;
}

export const source: SourceModule = {
  id: "arxiv",
  enabled: () => true,
  async enrich(c: Candidate, ctx: SourceContext): Promise<Signal[]> {
    try {
      if (!c?.name) return [];
      const q = encodeURIComponent(`au:"${c.name.replace(/"/g, "")}"`);
      const url = `http://export.arxiv.org/api/query?search_query=${q}&sortBy=submittedDate&sortOrder=descending&max_results=10`;
      const r = await fetch(url, { headers: { "user-agent": "labscout/0.1" }, signal: AbortSignal.timeout(12000) });
      if (!r.ok) return [];
      return arxivToSignals(c, parseArxivAtom(await r.text()), ctx?.keywords ?? "");
    } catch {
      return [];
    }
  },
};

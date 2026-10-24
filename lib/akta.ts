// akta.pro by Wokelo AI — News Signals API (open-ended topic query, no company UUID needed).
// Docs: https://docs.akta.pro/api-reference/news-signals  (header x-api-key)
import type { NewsSignal } from "./types.ts";

/** GET with a 25 s timeout and one retry — akta latency varies (p50 ~4 s, spikes past 15 s). */
async function getJson(u: string): Promise<any | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(u, { headers: { "x-api-key": process.env.AKTA_API_KEY! }, signal: AbortSignal.timeout(25000) });
      if (r.ok) return await r.json();
      if (r.status < 500 && r.status !== 429) return null;
    } catch { /* timeout or network: retry once */ }
  }
  return null;
}

export function aktaEnabled(): boolean {
  return !!process.env.AKTA_API_KEY;
}

/** Market pull for the thesis: recent news on the topic, with AI summaries. Returns [] on any failure. */
export async function marketSignals(topic: string, limit = 5): Promise<NewsSignal[]> {
  if (!aktaEnabled()) return [];
  try {
    const u = `https://api.akta.pro/api/v1/news/?query=${encodeURIComponent(topic)}&limit=${limit}&unique_article=true&news_score_list=High,Medium`;
    const d = await getJson(u);
    if (!d) return [];
    return (d.data ?? []).map((a: any) => ({
      title: a.title ?? "(untitled)",
      url: a.url ?? "",
      publisher: a.publisher ?? null,
      publishedDate: a.published_date ?? null,
      sentiment: a.sentiment ?? null,
      summary: a.ai_summary ?? null,
      companies: (a.company_mentions ?? []).map((c: any) => c.name).filter(Boolean).slice(0, 5),
    }));
  } catch {
    return [];
  }
}

/** Press mentions of a person (entity search). Used for the top candidates only. */
/** Keep only articles that also mention the person's university or a thesis keyword — guards against namesakes. */
export function relevantMention(n: NewsSignal, name: string, context: string[]): boolean {
  const text = `${n.title} ${n.summary ?? ""}`.toLowerCase();
  const last = name.trim().split(/\s+/).pop()!.toLowerCase();
  if (!text.includes(last)) return false;
  return context.some((c) => c.length > 3 && text.includes(c.toLowerCase()));
}

export async function personMentions(name: string, limit = 3, context: string[] = []): Promise<NewsSignal[]> {
  if (!aktaEnabled()) return [];
  try {
    const u = `https://api.akta.pro/api/v1/news/?entity_person_list=${encodeURIComponent(name)}&limit=${limit * 3}&unique_article=true`;
    const d = await getJson(u);
    if (!d) return [];
    return (d.data ?? []).map((a: any) => ({
      title: a.title ?? "(untitled)", url: a.url ?? "", publisher: a.publisher ?? null, publishedDate: a.published_date ?? null,
      sentiment: a.sentiment ?? null, summary: a.ai_summary ?? null, companies: [],
    })).filter((n: NewsSignal) => context.length === 0 || relevantMention(n, name, context));
  } catch {
    return [];
  }
}

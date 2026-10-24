// akta.pro by Wokelo AI — News Signals API (open-ended topic query, no company UUID needed).
// Docs: https://docs.akta.pro/api-reference/news-signals  (header x-api-key)
import type { NewsSignal } from "./types.ts";

export function aktaEnabled(): boolean {
  return !!process.env.AKTA_API_KEY;
}

/** Market pull for the thesis: recent news on the topic, with AI summaries. Returns [] on any failure. */
export async function marketSignals(topic: string, limit = 5): Promise<NewsSignal[]> {
  if (!aktaEnabled()) return [];
  try {
    const u = `https://api.akta.pro/api/v1/news?query=${encodeURIComponent(topic)}&limit=${limit}&unique_article=true&news_score_list=High,Medium`;
    const r = await fetch(u, { headers: { "x-api-key": process.env.AKTA_API_KEY! }, signal: AbortSignal.timeout(15000) });
    if (!r.ok) return [];
    const d = await r.json();
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
export async function personMentions(name: string, limit = 3): Promise<NewsSignal[]> {
  if (!aktaEnabled()) return [];
  try {
    const u = `https://api.akta.pro/api/v1/news?entity_person_list=${encodeURIComponent(name)}&limit=${limit}&unique_article=true`;
    const r = await fetch(u, { headers: { "x-api-key": process.env.AKTA_API_KEY! }, signal: AbortSignal.timeout(15000) });
    if (!r.ok) return [];
    const d = await r.json();
    return (d.data ?? []).map((a: any) => ({
      title: a.title ?? "(untitled)", url: a.url ?? "", publisher: a.publisher ?? null, publishedDate: a.published_date ?? null,
      sentiment: a.sentiment ?? null, summary: a.ai_summary ?? null, companies: [],
    }));
  } catch {
    return [];
  }
}

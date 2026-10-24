import { INSTITUTION_FILTER } from "./institutions.ts";

const BASE = "https://api.openalex.org";
const mailto = () => (process.env.OPENALEX_MAILTO ? `&mailto=${process.env.OPENALEX_MAILTO}` : "");

export async function searchWorks(keywords: string, perPage = 50): Promise<any[]> {
  const url = `${BASE}/works?search=${encodeURIComponent(keywords)}&filter=authorships.institutions.id:${INSTITUTION_FILTER},publication_year:2024-2026&per-page=${perPage}&select=id,title,publication_year,authorships,primary_location,cited_by_count,doi${mailto()}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`OpenAlex works ${r.status}`);
  return (await r.json()).results ?? [];
}

export async function getAuthor(authorId: string): Promise<{ worksCount: number; citedByCount: number; firstPubYear: number | null; recentWorksCount: number | null }> {
  const id = authorId.replace("https://openalex.org/", "");
  const r = await fetch(`${BASE}/authors/${id}?select=works_count,cited_by_count,counts_by_year${mailto()}`);
  if (!r.ok) return { worksCount: 0, citedByCount: 0, firstPubYear: null, recentWorksCount: null };
  const a = await r.json();
  const years = (a.counts_by_year ?? []).map((y: any) => y.year).filter((y: number) => !!y);
  const nowY = new Date().getFullYear();
  const recent = (a.counts_by_year ?? []).filter((y: any) => y.year >= nowY - 1).reduce((n: number, y: any) => n + (y.works_count ?? 0), 0);
  return { worksCount: a.works_count ?? 0, citedByCount: a.cited_by_count ?? 0, firstPubYear: years.length ? Math.min(...years) : null, recentWorksCount: recent };
}

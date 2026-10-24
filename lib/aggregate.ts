import { NYC_INSTITUTIONS } from "./institutions.ts";
import type { Candidate, Work } from "./types.ts";

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
      const nyc = (a.institutions ?? []).map((i: any) => NYC_INSTITUTIONS[i.id]).filter(Boolean) as string[];
      if (nyc.length === 0) continue;
      const id = a.author?.id;
      if (!id) continue;
      const existing = byAuthor.get(id) ?? {
        authorId: id, name: a.author.display_name ?? "Unknown", orcid: a.author.orcid ?? null,
        institutions: [], works: [], worksCount: null, citedByCount: null, firstPubYear: null, recentWorksCount: null, reasons: [], mentions: [],
        education: [], isCurrentStudent: null, score: 0, brief: null,
      };
      for (const n of nyc) if (!existing.institutions.includes(n)) existing.institutions.push(n);
      existing.works.push({ ...work, position: a.author_position, isCorresponding: !!a.is_corresponding });
      byAuthor.set(id, existing);
    }
  }
  return [...byAuthor.values()];
}

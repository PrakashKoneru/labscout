import type { Education } from "./types.ts";

export async function getEducation(orcidUrl: string | null): Promise<Education[]> {
  if (!orcidUrl) return [];
  const id = orcidUrl.replace("https://orcid.org/", "");
  try {
    const r = await fetch(`https://pub.orcid.org/v3.0/${id}/educations`, { headers: { Accept: "application/json" } });
    if (!r.ok) return [];
    const d = await r.json();
    const out: Education[] = [];
    for (const g of d["affiliation-group"] ?? []) for (const s of g.summaries ?? []) {
      const e = s["education-summary"];
      if (!e) continue;
      out.push({
        institution: e.organization?.name ?? "Unknown",
        degree: e["role-title"] ?? null,
        startYear: e["start-date"]?.year?.value ? Number(e["start-date"].year.value) : null,
        endYear: e["end-date"]?.year?.value ? Number(e["end-date"].year.value) : null,
      });
    }
    return out;
  } catch {
    return [];
  }
}

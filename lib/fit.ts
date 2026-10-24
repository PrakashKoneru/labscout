// Thesis fit: does a candidate meet each investor criterion from the uploaded thesis?
// The model only sees facts that are also on the card, so a judge can check every verdict.
import type { Candidate, Fit } from "./types.ts";

export const MAX_CRITERIA = 4;
export const FIT_POINTS = { yes: 3, partial: 1, no: 0 } as const;
const VERDICTS = new Set(["yes", "partial", "no"]);
const NO_EVIDENCE = "No evidence in the sources.";

/** Criteria from the client: strings only, trimmed, case-insensitively deduped, max 4, 120 chars each. */
export function cleanCriteria(x: unknown): string[] {
  if (!Array.isArray(x)) return [];
  const out: string[] = [];
  for (const c of x) {
    if (typeof c !== "string") continue;
    const t = c.trim().slice(0, 120);
    if (t && !out.some((o) => o.toLowerCase() === t.toLowerCase())) out.push(t);
    if (out.length === MAX_CRITERIA) break;
  }
  return out;
}

/** One Fit per criterion, in criteria order. Anything missing, unknown or unsupported becomes "no". */
export function parseFit(raw: string, criteria: string[]): Fit[] {
  let arr: any[] = [];
  const m = String(raw || "").match(/\[[\s\S]*\]/);
  if (m) { try { const d = JSON.parse(m[0]); if (Array.isArray(d)) arr = d; } catch { /* keep [] */ } }
  return criteria.map((criterion, i) => {
    const d = arr.find((x) => x && Number(x.i) === i + 1) ?? (arr[i] && arr[i].i == null ? arr[i] : undefined);
    const v = typeof d?.verdict === "string" ? d.verdict.toLowerCase().trim() : "";
    const evidence = typeof d?.evidence === "string" ? d.evidence.trim().slice(0, 160) : "";
    if (!VERDICTS.has(v) || (v !== "no" && !evidence)) return { criterion, verdict: "no", evidence: NO_EVIDENCE };
    return { criterion, verdict: v as Fit["verdict"], evidence: evidence || NO_EVIDENCE };
  });
}

export function fitPoints(fit: Fit[]): number {
  return fit.reduce((a, f) => a + FIT_POINTS[f.verdict], 0);
}

export function fitPrompt(c: Candidate, criteria: string[], thesis: string): string {
  const works = c.works.slice(0, 5).map((w) => `- [${w.position} author, ${w.year}${w.venue ? ", " + w.venue : ""}] ${w.title}`).join("\n") || "- none";
  const sigs = (c.signals ?? []).slice(0, 12).map((s) => `- [${s.source}] ${s.label}`).join("\n") || "- none";
  const edu = (c.education ?? []).map((e) => `${e.degree ?? "degree"} at ${e.institution}${e.endYear ? ` (ended ${e.endYear})` : " (current)"}`).join("; ") || "unknown";
  return `You check one university researcher against a VC's investment criteria. Use ONLY the facts listed below; if no fact supports a criterion, the verdict is "no". ` +
    `Reply with JSON only, no prose: an array with one object per criterion, [{"i": <criterion number>, "verdict": "yes" | "partial" | "no", "evidence": "<max 20 words naming the fact you used>"}].\n\n` +
    `VC thesis: ${thesis}\nCriteria:\n${criteria.map((x, i) => `${i + 1}. ${x}`).join("\n")}\n\n` +
    `Name: ${c.name}\nAffiliation: ${c.institutions.join(", ")}\nEducation: ${edu}\nTotal papers: ${c.worksCount ?? "?"}, citations: ${c.citedByCount ?? "?"}\n` +
    `Matching papers:\n${works}\nFounder signals:\n${sigs}`;
}

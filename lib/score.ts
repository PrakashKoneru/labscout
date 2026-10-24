import type { Candidate, Education } from "./types.ts";
import type { Signal } from "./sources/types.ts";

export function isCurrentStudent(edu: Education[]): boolean | null {
  if (edu.length === 0) return null;
  return edu.some((e) => e.endYear === null);
}

const POS: Record<string, number> = { first: 10, middle: 3, last: 1 };

/** Deterministic, explainable score. Returns the number and fills c.reasons with the breakdown. */
export function score(c: Candidate): number {
  const reasons: string[] = [];
  let s = 0;
  const firsts = c.works.filter((w) => w.position === "first").length;
  const others = c.works.length - firsts;
  let wPts = 0;
  for (const w of c.works) {
    wPts += POS[w.position] ?? 2;
    wPts += Math.min(w.citedBy, 20) * 0.25;
    if (w.year >= 2025) wPts += 2;
  }
  s += wPts;
  reasons.push(`${c.works.length} matching paper${c.works.length === 1 ? "" : "s"} (${firsts} first-author${others ? `, ${others} co-author` : ""}) +${r1(wPts)}`);

  if (c.isCurrentStudent === true) { s += 15; reasons.push("verified current student (ORCID) +15"); }
  if (c.isCurrentStudent === false) { s -= 15; reasons.push("education ended (ORCID) −15"); }

  // Momentum: velocity over totals. Share of the author's output in the last 2 years.
  if (c.worksCount !== null && c.worksCount > 0 && c.recentWorksCount !== null) {
    const share = Math.min(1, c.recentWorksCount / c.worksCount);
    const m = Math.round(share * 10 * 10) / 10;
    s += m;
    reasons.push(`momentum: ${c.recentWorksCount}/${c.worksCount} papers in last 2 yrs +${m}`);
  }

  if (c.worksCount !== null && c.worksCount > 30) { const p = Math.min(20, (c.worksCount - 30) / 5); s -= p; reasons.push(`established author (${c.worksCount} papers) −${r1(p)}`); }
  if (c.firstPubYear !== null && c.firstPubYear < 2018) { s -= 10; reasons.push(`publishing since ${c.firstPubYear} −10`); }

  // Founder signals (lib/sources/*): sum weights per source, capped at SOURCE_CAP each.
  const bySource = new Map<string, Signal[]>();
  for (const sig of c.signals ?? []) {
    const list = bySource.get(sig.source) ?? [];
    list.push(sig);
    bySource.set(sig.source, list);
  }
  for (const [src, list] of bySource) {
    const raw = list.reduce((a, x) => a + (Number.isFinite(x.weight) ? Math.max(0, x.weight) : 0), 0);
    const pts = r1(Math.min(SOURCE_CAP, raw));
    if (pts <= 0) continue;
    s += pts;
    reasons.push(`${src}: ${describe(list)} +${pts}`);
  }

  c.reasons = reasons;
  return Math.round(s * 10) / 10;
}

export const SOURCE_CAP = 15;

function describe(list: Signal[]): string {
  const kinds = new Map<string, number>();
  for (const x of list) kinds.set(x.kind, (kinds.get(x.kind) ?? 0) + 1);
  const parts = [...kinds].map(([k, n]) => `${n} ${k}${n === 1 ? "" : "s"}`);
  const stars = list.reduce((a, x) => a + (Number(/(\d+(?:\.\d+)?k?)★/.exec(x.label)?.[1]?.replace("k", "e3")) || 0), 0);
  if (stars > 0) parts.push(`${stars >= 1000 ? r1(stars / 1000) + "k" : stars} stars`);
  return parts.join(", ");
}

const r1 = (n: number) => Math.round(n * 10) / 10;

import type { Candidate, Education } from "./types.ts";

export function isCurrentStudent(edu: Education[]): boolean | null {
  if (edu.length === 0) return null;
  return edu.some((e) => e.endYear === null);
}

const POS: Record<string, number> = { first: 10, middle: 3, last: 1 };

export function score(c: Candidate): number {
  let s = 0;
  for (const w of c.works) {
    s += POS[w.position] ?? 2;
    s += Math.min(w.citedBy, 20) * 0.25;
    if (w.year >= 2025) s += 2;
  }
  if (c.isCurrentStudent === true) s += 15;
  if (c.isCurrentStudent === false) s -= 15;
  if (c.worksCount !== null && c.worksCount > 30) s -= Math.min(20, (c.worksCount - 30) / 5);
  if (c.firstPubYear !== null && c.firstPubYear < 2018) s -= 10;
  return Math.round(s * 10) / 10;
}

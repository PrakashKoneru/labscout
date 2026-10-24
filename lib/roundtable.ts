// Roundtable — shared agent workspace. Every search saves a versioned shortlist file so other
// agents (and partners) can read it. HTTP: POST https://roundtable.bot/api/tools/<tool>, Bearer key.
import type { Candidate } from "./types.ts";

const URL_ = (process.env.ROUNDTABLE_URL || "https://roundtable.bot").replace(/\/+$/, "");

export function roundtableEnabled(): boolean {
  return !!process.env.ROUNDTABLE_KEY;
}

async function call(tool: string, args: Record<string, unknown>): Promise<any> {
  const r = await fetch(`${URL_}/api/tools/${tool}`, {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.ROUNDTABLE_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ ...args, request_id: crypto.randomUUID() }),
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`Roundtable ${tool} ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

export function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "query";
}

export function renderShortlist(query: string, keywords: string, candidates: Candidate[]): string {
  const lines: string[] = [];
  lines.push(`# Labscout shortlist: ${query}`, "", `Keywords: ${keywords}`, `Generated: ${new Date().toISOString()}`, "");
  candidates.forEach((c, i) => {
    const status = c.isCurrentStudent === true ? "current student" : c.isCurrentStudent === false ? "not a current student" : "student status unverified";
    lines.push(`## ${i + 1}. ${c.name} — ${c.institutions.join(", ")} (${status}, score ${c.score})`);
    if (c.brief) lines.push("", c.brief);
    lines.push("", "Evidence:");
    for (const w of c.works.slice(0, 3)) lines.push(`- [${w.position} author, ${w.year}${w.venue ? ", " + w.venue : ""}] ${w.title}${w.url ? ` — ${w.url}` : ""}`);
    for (const r of c.reasons) lines.push(`- score: ${r}`);
    lines.push(`- OpenAlex: ${c.authorId}${c.orcid ? `\n- ORCID: ${c.orcid}` : ""}`, "");
  });
  return lines.join("\n");
}

export type Saved = { path: string; version: string | null; bank: string | null };

/** Saves the shortlist to the agent's own folder. Returns null on any failure. */
export async function saveShortlist(query: string, keywords: string, candidates: Candidate[]): Promise<Saved | null> {
  if (!roundtableEnabled()) return null;
  try {
    const path = `labscout/${slug(query)}.md`;
    const d = await call("write_file", { path, content: renderShortlist(query, keywords, candidates), message: `Labscout shortlist for: ${query}` });
    return { path, version: d?.version?.id ?? d?.version ?? null, bank: d?.bank ?? null };
  } catch {
    return null;
  }
}

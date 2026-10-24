// Roundtable — shared agent workspace. Every search saves a versioned shortlist file so other
// agents (and partners) can read it. HTTP: POST https://roundtable.bot/api/tools/<tool>, Bearer key.
import type { Candidate, Changes } from "./types.ts";

const URL_ = (process.env.ROUNDTABLE_URL || "https://roundtable.bot").replace(/\/+$/, "");

export function roundtableEnabled(): boolean {
  return !!process.env.ROUNDTABLE_KEY;
}

// Write tools take a request_id for idempotent retries; read tools reject it with 422.
async function call(tool: string, args: Record<string, unknown>, write = true): Promise<any> {
  const r = await fetch(`${URL_}/api/tools/${tool}`, {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.ROUNDTABLE_KEY}`, "content-type": "application/json" },
    body: JSON.stringify(write ? { ...args, request_id: crypto.randomUUID() } : args),
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
    if (c.fit?.length) { lines.push("", "Thesis fit:"); for (const f of c.fit) lines.push(`- ${f.verdict}: ${f.criterion} — ${f.evidence}`); }
    lines.push("", "Evidence:");
    for (const w of c.works.slice(0, 3)) lines.push(`- [${w.position} author, ${w.year}${w.venue ? ", " + w.venue : ""}] ${w.title}${w.url ? ` — ${w.url}` : ""}`);
    const sigs = c.signals ?? [];
    if (sigs.length) {
      lines.push("", "Signals:");
      for (const s of sigs) lines.push(`- [stage ${s.stage} ${s.source}] ${s.label}${s.url ? ` — ${s.url}` : ""}`);
      lines.push("");
    }
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

/** Names (in rank order) and the Generated timestamp from a shortlist written by renderShortlist. */
export function parseShortlist(md: string): { names: string[]; generatedAt: string | null } {
  const s = String(md || "");
  const names = [...s.matchAll(/^## \d+\. (.+?) — /gm)].map((m) => m[1].trim());
  const g = /^Generated: (\S+)/m.exec(s);
  return { names, generatedAt: g ? g[1] : null };
}

export function diffShortlist(prev: { names: string[]; generatedAt: string | null }, next: string[]): Changes {
  const p = new Set(prev.names), n = new Set(next);
  return { prevAt: prev.generatedAt, added: next.filter((x) => !p.has(x)), dropped: prev.names.filter((x) => !n.has(x)), kept: next.filter((x) => p.has(x)).length };
}

/** Previous shortlist for this query, or null (no file, Roundtable off, any error). Never throws. */
export async function readShortlist(query: string): Promise<string | null> {
  if (!roundtableEnabled()) return null;
  try {
    const d = await call("read_file", { path: `labscout/${slug(query)}.md` }, false);
    const text = [d?.content, d?.file?.content, d?.data?.content].find((x) => typeof x === "string");
    if (text === undefined) console.log("roundtable read_file: no content field; keys =", Object.keys(d ?? {}).join(","));
    return text ?? null;
  } catch {
    return null;
  }
}

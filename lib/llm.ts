import type { Candidate } from "./types.ts";

const MODEL = "anthropic/claude-haiku-5-5";

async function ask(content: string, max_tokens: number): Promise<string> {
  const r = await fetch("https://api.nicrron.ai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.NICRRON_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens, messages: [{ role: "user", content }] }),
  });
  if (!r.ok) throw new Error(`LLM ${r.status}`);
  const d = await r.json();
  // Gateway returns content:null when finish_reason is "length". The model spends ~1-1.5k hidden
  // reasoning tokens before emitting text, so max_tokens must be generous (>=1500).
  return d.choices?.[0]?.message?.content?.trim() ?? "";
}

export async function parseQuery(q: string): Promise<{ keywords: string }> {
  const text = await ask(`Turn this VC sourcing request into 2-5 search keywords for an academic paper search engine. Output ONLY the keywords separated by spaces, nothing else.\n\nRequest: ${q}`, 1500);
  return { keywords: text || q };
}

export async function writeBrief(c: Candidate, query: string): Promise<string> {
  const works = c.works.slice(0, 3).map((w) => `- [${w.position} author, ${w.year}${w.venue ? ", " + w.venue : ""}] ${w.title}`).join("\n");
  const edu = c.education.map((e) => `${e.degree ?? "degree"} at ${e.institution}${e.endYear ? ` (ended ${e.endYear})` : " (current)"}`).join("; ") || "unknown";
  const text = await ask(`You write 3-line "why this student deserves a coffee" briefs for a pre-seed VC. Be concrete, no hype, only use the facts below. Each line max 25 words, plain text, no markdown, no line labels. Line 1: what they built/published. Line 2: why it fits the VC's thesis. Line 3: the one question to ask them.\n\nVC thesis: ${query}\nName: ${c.name}\nAffiliation: ${c.institutions.join(", ")}\nEducation: ${edu}\nTotal papers: ${c.worksCount ?? "?"}, citations: ${c.citedByCount ?? "?"}\nMatching papers:\n${works}`, 3000);
  if (!text) throw new Error("LLM returned empty brief");
  return text;
}

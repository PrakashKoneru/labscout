// Turn an uploaded thesis document (text extracted in the browser) into a sourcing query.
import { askJson } from "./llm.ts";

export type Thesis = { title: string; query: string; keywords: string; criteria: string[] };

const MAX_CHARS = 24000;

export function cleanText(text: string): string {
  return String(text || "").replace(/\u0000/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, MAX_CHARS);
}

/** Parse the model's JSON reply defensively (it may wrap it in prose or code fences). */
export function parseThesis(raw: string, fallbackTitle = "Uploaded thesis"): Thesis | null {
  const m = String(raw || "").match(/\{[\s\S]*\}/);
  if (!m) return null;
  let d: any;
  try { d = JSON.parse(m[0]); } catch { return null; }
  const query = typeof d.query === "string" ? d.query.trim().slice(0, 200) : "";
  if (!query) return null;
  const crit = Array.isArray(d.criteria) ? d.criteria : [];
  return {
    title: (typeof d.title === "string" && d.title.trim() ? d.title.trim() : fallbackTitle).slice(0, 120),
    query,
    keywords: typeof d.keywords === "string" ? d.keywords.trim().slice(0, 160) : "",
    criteria: crit.filter((c: unknown) => typeof c === "string" && c.trim()).map((c: string) => c.trim().slice(0, 120)).slice(0, 4),
  };
}

export async function thesisFromText(text: string, filename = ""): Promise<Thesis> {
  const body = cleanText(text);
  if (body.length < 80) throw new Error("Could not read enough text from the document (is it a scanned image?)");
  const raw = await askJson(
    `You read venture capital investment theses. From the thesis below, write JSON only, no prose:\n` +
    `{"title": "<short title, max 8 words>", "query": "<one plain-English sourcing request under 15 words to find university student researchers whose work fits this thesis, e.g. 'students building AI weather and climate models'>", ` +
    `"keywords": "<3-6 academic search keywords separated by spaces>", "criteria": ["<up to 3 founder criteria from the thesis, max 8 words each>"]}\n\n` +
    `File: ${filename}\n---\n${body}`,
    "thesis-reader",
  );
  const t = parseThesis(raw, filename.replace(/\.[a-z0-9]+$/i, "") || "Uploaded thesis");
  if (!t) throw new Error("Could not turn the document into a search");
  return t;
}

import { test } from "node:test";
import assert from "node:assert/strict";
import { renderShortlist, slug, parseShortlist, diffShortlist } from "../lib/roundtable.ts";

test("slug is filesystem-safe", () => {
  assert.equal(slug("LLM agents for software engineering!"), "llm-agents-for-software-engineering");
});

test("shortlist markdown lists every candidate with evidence", () => {
  const md = renderShortlist("q", "kw", [{
    authorId: "https://openalex.org/A1", name: "Ada", orcid: null, institutions: ["Columbia"],
    works: [{ id: "W1", title: "T", year: 2025, doi: null, url: "https://x", venue: "NeurIPS", citedBy: 0, position: "first", isCorresponding: false }],
    worksCount: 1, citedByCount: 0, firstPubYear: 2025, recentWorksCount: 1, reasons: ["r1"], mentions: [], education: [], isCurrentStudent: true, score: 10, brief: "b",
    signals: [{ source: "github", stage: 2, kind: "repo", label: "ada/tool — 40★", url: "https://github.com/ada/tool", date: null, weight: 5 }],
  }]);
  assert.ok(md.includes("## 1. Ada — Columbia (current student, score 10)"));
  assert.ok(md.includes("[first author, 2025, NeurIPS] T — https://x"));
  assert.ok(md.includes("- score: r1"));
  assert.ok(md.includes("Signals:"));
  assert.ok(md.includes("- [stage 2 github] ada/tool — 40★ — https://github.com/ada/tool"));
});
test("parseShortlist reads names and the generated timestamp", () => {
  const md = "# Labscout shortlist: q\n\nKeywords: kw\nGenerated: 2026-10-24T18:10:40.212Z\n\n## 1. Ada Lovelace — Columbia (current student, score 10)\n\nb\n\n## 2. Alan Turing — NYU, Cornell (student status unverified, score 8)\n";
  assert.deepEqual(parseShortlist(md), { names: ["Ada Lovelace", "Alan Turing"], generatedAt: "2026-10-24T18:10:40.212Z" });
  assert.deepEqual(parseShortlist(""), { names: [], generatedAt: null });
});
test("diffShortlist lists added, dropped and kept", () => {
  assert.deepEqual(diffShortlist({ names: ["A", "B", "C"], generatedAt: "t" }, ["B", "D", "A"]), { prevAt: "t", added: ["D"], dropped: ["C"], kept: 2 });
});
test("shortlist markdown includes thesis fit and round-trips through parseShortlist", () => {
  const md = renderShortlist("q", "kw", [{
    authorId: "https://openalex.org/A1", name: "Ada", orcid: null, institutions: ["Columbia"],
    works: [{ id: "W1", title: "T", year: 2025, doi: null, url: "https://x", venue: "NeurIPS", citedBy: 0, position: "first", isCorresponding: false }],
    worksCount: 1, citedByCount: 0, firstPubYear: 2025, recentWorksCount: 1, reasons: [], mentions: [], education: [], isCurrentStudent: true, score: 10, brief: "b",
    signals: [], fit: [{ criterion: "Open-source traction", verdict: "yes", evidence: "40-star repo" }],
  }]);
  assert.ok(md.includes("Thesis fit:"));
  assert.ok(md.includes("- yes: Open-source traction — 40-star repo"));
  assert.deepEqual(parseShortlist(md).names, ["Ada"]);
});

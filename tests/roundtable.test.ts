import { test } from "node:test";
import assert from "node:assert/strict";
import { renderShortlist, slug } from "../lib/roundtable.ts";

test("slug is filesystem-safe", () => {
  assert.equal(slug("LLM agents for software engineering!"), "llm-agents-for-software-engineering");
});

test("shortlist markdown lists every candidate with evidence", () => {
  const md = renderShortlist("q", "kw", [{
    authorId: "https://openalex.org/A1", name: "Ada", orcid: null, institutions: ["Columbia"],
    works: [{ id: "W1", title: "T", year: 2025, doi: null, url: "https://x", venue: "NeurIPS", citedBy: 0, position: "first", isCorresponding: false }],
    worksCount: 1, citedByCount: 0, firstPubYear: 2025, recentWorksCount: 1, reasons: ["r1"], mentions: [], education: [], isCurrentStudent: true, score: 10, brief: "b",
  }]);
  assert.ok(md.includes("## 1. Ada — Columbia (current student, score 10)"));
  assert.ok(md.includes("[first author, 2025, NeurIPS] T — https://x"));
  assert.ok(md.includes("- score: r1"));
});

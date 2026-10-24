import { test } from "node:test";
import assert from "node:assert/strict";
import { memoHtml } from "../public/assets/memo.js";

const d = { query: "AI weather models", keywords: "weather emulation", totalWorks: 42 };
const list = [
  { name: "Ada <script>x</script>", institutions: ["Columbia"], isCurrentStudent: true, score: 31.5, brief: "Line one\nLine two",
    works: [{ title: "Neural emulators", url: "https://doi.org/10.1/x", year: 2025, venue: "ICML", position: "first" }],
    signals: [{ source: "github", label: "ada/wx — 40★", url: "javascript:alert(1)" }],
    fit: [{ criterion: "Open-source traction", verdict: "yes", evidence: "40-star repo" }] },
  { name: "Alan", institutions: ["NYU"], isCurrentStudent: null, score: 20, brief: null, works: [], signals: [], fit: [] },
];
test("memo lists students in rank order with fit and sources", () => {
  const h = memoHtml(d, list, ["Open-source traction"], new Date("2026-10-24T18:00:00Z"));
  assert.ok(h.startsWith("<!doctype html>"));
  assert.ok(h.includes("<h1>AI weather models</h1>"));
  assert.ok(h.indexOf("1. Ada") < h.indexOf("2. Alan"));
  assert.ok(h.includes("<b>Yes</b> — Open-source traction: 40-star repo"));
  assert.ok(h.includes('<a href="https://doi.org/10.1/x">Neural emulators</a>'));
  assert.ok(h.includes("2026-10-24"));
  assert.ok(h.includes("Line one<br>Line two"));
});
test("memo escapes HTML and drops non-http links", () => {
  const h = memoHtml(d, list, [], new Date());
  assert.ok(!h.includes("<script>x"));
  assert.ok(h.includes("&lt;script&gt;"));
  assert.ok(!h.includes("javascript:"));
});

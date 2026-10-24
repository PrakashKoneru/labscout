import { test } from "node:test";
import assert from "node:assert/strict";
import { score } from "../lib/score.ts";
import type { Candidate } from "../lib/types.ts";
import type { Signal } from "../lib/sources/types.ts";

const base = (o: Partial<Candidate> = {}): Candidate => ({
  authorId: "A1", name: "X", orcid: null, institutions: ["Columbia"],
  works: [{ id: "W1", title: "t", year: 2025, doi: null, url: null, venue: null, citedBy: 0, position: "first", isCorresponding: false }],
  worksCount: 3, citedByCount: 5, firstPubYear: 2024, recentWorksCount: null, reasons: [], mentions: [], education: [], isCurrentStudent: null, score: 0, brief: null, signals: [], ...o,
});
const sig = (o: Partial<Signal> = {}): Signal => ({ source: "github", stage: 2, kind: "repo", label: "a/b — 10★", url: null, date: null, weight: 5, ...o });

test("zero signals leaves the score unchanged", () => {
  const c = base();
  const before = score(c);
  assert.equal(score(base({ signals: [] })), before);
  assert.ok(!c.reasons.some((r) => r.startsWith("github")));
});
test("signal weights add to the score", () => {
  assert.equal(score(base({ signals: [sig({ weight: 4 })] })) - score(base()), 4);
});
test("each source is capped at 15 points", () => {
  const many = [sig({ weight: 6 }), sig({ weight: 6 }), sig({ weight: 6 }), sig({ weight: 6 })];
  assert.equal(score(base({ signals: many })) - score(base()), 15);
  const two = [...many, sig({ source: "nsf", stage: 4, kind: "icorps", label: "I-Corps", weight: 6 })];
  assert.equal(score(base({ signals: two })) - score(base()), 21);
});
test("one reason per source with counts, stars and points", () => {
  const c = base({ signals: [
    sig({ kind: "profile", label: "GitHub @x", weight: 2 }),
    sig({ label: "x/a — 1200★, 3 forks", weight: 6 }),
    sig({ label: "x/b — 100★, 3 forks", weight: 6 }),
    sig({ source: "arxiv", stage: 1, kind: "preprint", label: "p", weight: 3 }),
  ] });
  score(c);
  const gh = c.reasons.filter((r) => r.startsWith("github:"));
  assert.equal(gh.length, 1);
  assert.equal(gh[0], "github: 1 profile, 2 repos, 1.3k stars +14");
  assert.ok(c.reasons.includes("arxiv: 1 preprint +3"));
});

import { createRequire } from "node:module";
import { test } from "node:test";
import assert from "node:assert/strict";
import { collectSignals } from "../lib/search.ts";
import { searchPhases } from "../lib/search-watch.ts";
import type { Candidate } from "../lib/types.ts";
import type { SourceModule } from "../lib/sources/types.ts";

const require = createRequire(import.meta.url);
const watch = require("../public/assets/search-watch.js") as {
  applyLook: (state: Watch, look: Look) => Watch;
  watchHeading: (state: Watch) => string;
  watchDetail: (state: Watch) => string;
};

type Watch = { phase: string; phaseId: string; phaseIndex: number; phaseTotal: number; looking: string[] };
type Look =
  | { type: "phase"; id: string; label: string; index: number; total: number }
  | { type: "source"; id: string; label: string; state: "looking" | "done" };

const blank = (): Watch => ({ phase: "Starting the search", phaseId: "start", phaseIndex: 0, phaseTotal: 0, looking: [] });

test("a phase keeps sources that are still in flight", () => {
  const started = watch.applyLook(blank(), { type: "source", id: "akta", label: "the news", state: "looking" });
  const papers = watch.applyLook(started, { type: "phase", id: "papers", label: "Searching papers", index: 1, total: 6 });
  assert.equal(watch.watchHeading(papers), "Searching papers");
  assert.equal(watch.watchDetail(papers), "Also looking at the news");
  const done = watch.applyLook(papers, { type: "source", id: "akta", label: "the news", state: "done" });
  assert.equal(watch.watchDetail(done), "");
});

test("the signal phase names the sources still open, newest first", () => {
  let state = watch.applyLook(blank(), { type: "phase", id: "signals", label: "Checking founder-signal sources", index: 3, total: 7 });
  for (const label of ["GitHub", "arXiv", "NSF awards", "patents"]) {
    state = watch.applyLook(state, { type: "source", id: label, label, state: "looking" });
  }
  assert.equal(watch.watchHeading(state), "Checking patents, NSF awards, arXiv, and 1 more");
  assert.equal(watch.watchDetail(state), "");
  state = watch.applyLook(state, { type: "source", id: "patents", label: "patents", state: "done" });
  assert.equal(watch.watchHeading(state), "Checking NSF awards, arXiv, and GitHub");
});

test("search phases follow the pipeline that will actually run", () => {
  assert.deepEqual(searchPhases({ signals: true, follow: true }).map((phase) => phase.id), [
    "thesis", "papers", "roster", "signals", "follow", "briefs", "shortlist",
  ]);
  assert.deepEqual(searchPhases({ signals: false, follow: false }).map((phase) => phase.id), [
    "thesis", "papers", "roster", "briefs", "shortlist",
  ]);
});

test("collectSignals reports each enabled source once per wave and still finishes a source that throws", async () => {
  const events: { type: string; id?: string; state?: string; wave?: number }[] = [];
  const ok: SourceModule = {
    id: "github", enabled: () => true,
    enrich: async () => [{ source: "github", stage: 2, kind: "repo", label: "a/b", url: null, date: null, weight: 1 }],
  };
  const bad: SourceModule = { id: "arxiv", enabled: () => true, enrich: async () => { throw new Error("boom"); } };
  const off: SourceModule = { id: "nsf", enabled: () => false, enrich: async () => { throw new Error("should not run"); } };
  const later: SourceModule = { id: "hackernews", wave: 2, enabled: () => true, enrich: async () => [] };
  const cand = (): Candidate => ({
    authorId: "A1", name: "Ada Lovelace", orcid: null, institutions: [], works: [], worksCount: 0, citedByCount: 0,
    firstPubYear: null, recentWorksCount: 0, reasons: [], mentions: [], education: [], isCurrentStudent: null,
    score: 0, brief: null, signals: [], fit: [],
  });
  const people = [cand(), cand()];
  await collectSignals(people, { query: "q", keywords: "k" }, [ok, bad, off, later], {
    onLook(look) { if (look.type === "source") events.push(look); },
    onWave(wave) { events.push({ type: "wave", wave }); },
  });
  const ids = (state: string, id: string) => events.filter((event) => event.type === "source" && event.id === id && event.state === state);
  assert.equal(ids("looking", "github").length, 1);
  assert.equal(ids("done", "github").length, 1);
  assert.equal(ids("done", "arxiv").length, 1);
  assert.equal(ids("looking", "nsf").length, 0);
  assert.deepEqual(events.map((event) => event.type === "wave" ? `wave ${event.wave}` : `${event.state} ${event.id}`), [
    "wave 1", "looking github", "looking arxiv", "done github", "done arxiv", "wave 2", "looking hackernews", "done hackernews",
  ]);
  assert.equal(people[0].signals.length, 1);
  assert.equal(people[1].signals.length, 1);
});

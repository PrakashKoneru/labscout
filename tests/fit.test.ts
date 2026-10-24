import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanCriteria, parseFit, fitPoints, fitPrompt } from "../lib/fit.ts";

const CRIT = ["Proprietary data", "Deep physics expertise", "Open-source traction"];

test("cleanCriteria keeps up to 4 trimmed, deduped strings", () => {
  assert.deepEqual(cleanCriteria(null), []);
  assert.deepEqual(cleanCriteria(["  a ", 3, "", "A", "b", "c", "d", "e"]), ["a", "b", "c", "d"]);
  assert.equal(cleanCriteria(["x".repeat(300)])[0].length, 120);
});
test("parseFit maps fenced JSON by criterion number", () => {
  const raw = '```json\n[{"i":2,"verdict":"partial","evidence":"PhD in atmospheric physics"},{"i":1,"verdict":"yes","evidence":"built a private sensor dataset"},{"i":3,"verdict":"no","evidence":"no repos listed"}]\n```';
  const f = parseFit(raw, CRIT);
  assert.deepEqual(f.map((x) => x.verdict), ["yes", "partial", "no"]);
  assert.equal(f[0].criterion, "Proprietary data");
  assert.equal(f[1].evidence, "PhD in atmospheric physics");
  assert.equal(f[2].evidence, "no repos listed");
});
test("parseFit never invents a yes: missing, unknown or unsupported verdicts become no", () => {
  const f = parseFit('[{"i":1,"verdict":"YES","evidence":""},{"i":2,"verdict":"maybe","evidence":"x"}]', CRIT);
  assert.deepEqual(f.map((x) => x.verdict), ["no", "no", "no"]);
  assert.equal(f[0].evidence, "No evidence in the sources.");
  assert.deepEqual(parseFit("not json", CRIT).map((x) => x.verdict), ["no", "no", "no"]);
});
test("parseFit falls back to array order when the model omits i", () => {
  assert.deepEqual(parseFit('[{"verdict":"yes","evidence":"e1"},{"verdict":"partial","evidence":"e2"}]', CRIT).map((x) => x.verdict), ["yes", "partial", "no"]);
});
test("fitPoints: yes 3, partial 1, no 0", () => {
  assert.equal(fitPoints([{ criterion: "a", verdict: "yes", evidence: "e" }, { criterion: "b", verdict: "partial", evidence: "e" }, { criterion: "c", verdict: "no", evidence: "e" }]), 4);
});
test("fitPrompt numbers the criteria and lists the facts", () => {
  const p = fitPrompt({ name: "Ada", institutions: ["Columbia"], education: [], works: [{ title: "Neural weather emulators", year: 2025, venue: "ICML", position: "first" }], signals: [{ source: "github", label: "ada/wx — 40★" }], worksCount: 3, citedByCount: 9 } as any, CRIT, "AI weather");
  assert.ok(p.includes("1. Proprietary data"));
  assert.ok(p.includes("3. Open-source traction"));
  assert.ok(p.includes("[first author, 2025, ICML] Neural weather emulators"));
  assert.ok(p.includes("- [github] ada/wx — 40★"));
});

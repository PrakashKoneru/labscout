import { test } from "node:test";
import assert from "node:assert/strict";
import { parseThesis, cleanText } from "../lib/thesis.ts";

test("parses fenced JSON", () => {
  const t = parseThesis('```json\n{"title":"AI climate","query":"students building AI weather models","keywords":"weather emulation climate","criteria":["proprietary data","domain depth"]}\n```');
  assert.equal(t!.query, "students building AI weather models");
  assert.deepEqual(t!.criteria, ["proprietary data", "domain depth"]);
});
test("returns null without a query", () => {
  assert.equal(parseThesis('{"title":"x"}'), null);
  assert.equal(parseThesis("no json here"), null);
});
test("falls back to filename title", () => {
  assert.equal(parseThesis('{"query":"q"}', "my_thesis")!.title, "my_thesis");
});
test("cleanText trims whitespace and caps length", () => {
  assert.equal(cleanText("a  \n\n\n\nb"), "a \n\nb");
  assert.equal(cleanText("x".repeat(30000)).length, 24000);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { relevantMention } from "../lib/akta.ts";

const n = (title: string, summary = "") => ({ title, summary, url: "", publisher: null, publishedDate: null, sentiment: null, companies: [] });

test("keeps a mention naming the person and their university", () => {
  assert.ok(relevantMention(n("Columbia PhD student Ada Lovelace wins award"), "Ada Lovelace", ["Columbia", "diffusion"]));
});
test("drops a namesake with no university or thesis context", () => {
  assert.ok(!relevantMention(n("Ada Lovelace opens bakery in Ohio"), "Ada Lovelace", ["Columbia", "diffusion"]));
});
test("drops articles that do not contain the surname", () => {
  assert.ok(!relevantMention(n("Columbia diffusion lab news"), "Ada Lovelace", ["Columbia"]));
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { aggregate } from "../lib/aggregate.ts";

const work = (overrides: Record<string, any> = {}) => ({
  id: "https://openalex.org/W1",
  title: "Diffusion for proteins",
  publication_year: 2025,
  doi: "https://doi.org/10.1/x",
  cited_by_count: 3,
  primary_location: { landing_page_url: "https://doi.org/10.1/x", source: { display_name: "NeurIPS" } },
  authorships: [
    { author_position: "first", is_corresponding: true,
      author: { id: "https://openalex.org/A1", display_name: "Ada Lovelace", orcid: "https://orcid.org/0000-0001" },
      institutions: [{ id: "https://openalex.org/I78577930", display_name: "Columbia University" }] },
    { author_position: "last", is_corresponding: false,
      author: { id: "https://openalex.org/A2", display_name: "Prof Senior", orcid: null },
      institutions: [{ id: "https://openalex.org/I78577930", display_name: "Columbia University" }] },
  ],
  ...overrides,
});

test("one candidate per author with NYC affiliation", () => {
  const c = aggregate([work()]);
  assert.deepEqual(c.map((x) => x.name), ["Ada Lovelace", "Prof Senior"]);
  assert.deepEqual(c[0].institutions, ["Columbia"]);
  assert.equal(c[0].orcid, "https://orcid.org/0000-0001");
  assert.equal(c[0].works[0].position, "first");
  assert.equal(c[0].works[0].venue, "NeurIPS");
  assert.equal(c[0].works[0].year, 2025);
  assert.equal(c[0].works[0].citedBy, 3);
});

test("merges works for the same author", () => {
  const c = aggregate([work(), work({ id: "https://openalex.org/W2", title: "Second" })]);
  assert.equal(c.find((x) => x.authorId === "https://openalex.org/A1")!.works.length, 2);
});

test("drops authors with no NYC institution on that work", () => {
  const w = work();
  w.authorships[0].institutions = [{ id: "https://openalex.org/I999", display_name: "MIT" }];
  const c = aggregate([w]);
  assert.deepEqual(c.map((x) => x.name), ["Prof Senior"]);
});

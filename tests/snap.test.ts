import { test } from "node:test";
import assert from "node:assert/strict";
import { snapKey } from "../public/assets/snap.js";

test("snapKey normalizes case/whitespace and appends criteria", () => {
  assert.equal(snapKey("  LLM  agents ", []), "llm agents");
  assert.equal(snapKey("Q", [" Open-Source ", ""]), "q | open-source");
  assert.equal(snapKey("q", undefined), "q");
});

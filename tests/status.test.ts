import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizePrismTraces, traceArray, summarizeBanks, summarizeFolder, checkRoundtable, checkAkta, checkNicrron, runCheck } from "../lib/status.ts";

test("traceArray handles bare arrays and wrapped objects", () => {
  assert.equal(traceArray([{ a: 1 }]).length, 1);
  assert.equal(traceArray({ page: 1, traces: [{}, {}] }).length, 2);
  assert.deepEqual(traceArray(null), []);
});

test("summarizePrismTraces counts by agent, distinct sessions, latest", () => {
  const s = summarizePrismTraces([
    { agent_id: "query-parser", session_id: "search:a", created_at: "2026-10-24T10:00:00Z" },
    { agent_id: "brief-writer", session_id: "search:a", created_at: "2026-10-24T10:00:05Z" },
    { agent_id: "brief-writer", session_id: "search:b", created_at: "2026-10-24T11:00:00Z" },
    { session_id: null },
  ]);
  assert.deepEqual(s.byAgent, { "query-parser": 1, "brief-writer": 2, unknown: 1 });
  assert.equal(s.sessions, 2);
  assert.equal(s.latest, "2026-10-24T11:00:00Z");
  assert.equal(s.total, 4);
});

test("summarizeBanks tolerates shapes", () => {
  assert.deepEqual(summarizeBanks({ banks: [{ name: "x", file_count: 3 }, { name: "y", files: [1, 2] }] }), { banks: [{ name: "x", files: 3 }, { name: "y", files: 2 }], totalFiles: 5 });
  assert.deepEqual(summarizeBanks(null), { banks: [], totalFiles: 0 });
});

test("summarizeFolder keeps file names only, newest first", () => {
  const f = summarizeFolder({ files: [
    { path: "labscout/a.md", version_id: "v1", updated_at: "2026-10-24T01:00:00Z" },
    { path: "labscout/b.md", version: { id: "v2" }, updated_at: "2026-10-24T02:00:00Z" },
    { name: "sub", type: "folder" },
  ] });
  assert.equal(f.count, 2);
  assert.deepEqual(f.latest.map((x) => x.name), ["b.md", "a.md"]);
  assert.equal(f.latest[0].version, "v2");
});

test("missing env var -> ok:false 'not configured', no fetch", async () => {
  const saved = process.env.ROUNDTABLE_KEY;
  delete process.env.ROUNDTABLE_KEY;
  const orig = globalThis.fetch;
  let called = false;
  globalThis.fetch = (async () => { called = true; throw new Error("x"); }) as any;
  try {
    const c = await checkRoundtable();
    assert.equal(c.ok, false);
    assert.deepEqual(c.detail, { reason: "not configured" });
    assert.equal(called, false);
  } finally {
    globalThis.fetch = orig;
    if (saved !== undefined) process.env.ROUNDTABLE_KEY = saved;
  }
});

test("fetch rejection -> ok:false without throwing, no error body leaked", async () => {
  const orig = globalThis.fetch;
  const savedA = process.env.AKTA_API_KEY, savedN = process.env.NICRRON_API_KEY;
  process.env.AKTA_API_KEY = "wk_test_secret";
  process.env.NICRRON_API_KEY = "sk-test-secret";
  globalThis.fetch = (async () => { throw new Error("boom wk_test_secret"); }) as any;
  try {
    for (const c of [await checkAkta(), await checkNicrron()]) {
      assert.equal(c.ok, false);
      assert.equal(c.detail.reason, "request failed");
      assert.ok(!JSON.stringify(c).includes("secret"));
    }
  } finally {
    globalThis.fetch = orig;
    if (savedA === undefined) delete process.env.AKTA_API_KEY; else process.env.AKTA_API_KEY = savedA;
    if (savedN === undefined) delete process.env.NICRRON_API_KEY; else process.env.NICRRON_API_KEY = savedN;
  }
});

test("runCheck maps timeouts", async () => {
  process.env.__T = "1";
  const c = await runCheck({ id: "t", name: "t", role: "t", env: ["__T"] }, async () => { const e = new Error("t"); e.name = "TimeoutError"; throw e; });
  assert.equal(c.detail.reason, "timeout");
});

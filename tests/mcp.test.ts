import { test } from "node:test";
import assert from "node:assert/strict";
import { handleRpc } from "../lib/mcp.ts";

const fake = async (q: string): Promise<any> => ({
  query: q, keywords: "kw", totalWorks: 1, market: [], roundtable: { path: "labscout/x.md", version: "v1", bank: null },
  integrations: { nicrron: true, prism: true, akta: true, roundtable: true },
  candidates: [{ authorId: "https://openalex.org/A1", name: "Ada", orcid: null, institutions: ["Columbia"], works: [], worksCount: 1, citedByCount: 0,
    firstPubYear: 2025, recentWorksCount: 1, reasons: [], mentions: [], education: [], isCurrentStudent: true, score: 10, brief: "b", signals: [] }],
});

test("initialize advertises tools capability", async () => {
  const r: any = await handleRpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } }, fake);
  assert.equal(r.result.serverInfo.name, "labscout");
  assert.ok(r.result.capabilities.tools);
});
test("notifications get no response", async () => {
  assert.equal(await handleRpc({ jsonrpc: "2.0", method: "notifications/initialized" }, fake), null);
});
test("tools/list exposes search_students", async () => {
  const r: any = await handleRpc({ jsonrpc: "2.0", id: 2, method: "tools/list" }, fake);
  assert.deepEqual(r.result.tools.map((t: any) => t.name), ["search_students"]);
});
test("tools/call returns markdown + structured content", async () => {
  const r: any = await handleRpc({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "search_students", arguments: { query: "q" } } }, fake);
  assert.ok(r.result.content[0].text.includes("## 1. Ada"));
  assert.ok(r.result.content[0].text.includes("Saved to Roundtable: labscout/x.md"));
  assert.equal(r.result.structuredContent.candidates.length, 1);
});
test("unknown method -> -32601", async () => {
  const r: any = await handleRpc({ jsonrpc: "2.0", id: 4, method: "nope" }, fake);
  assert.equal(r.error.code, -32601);
});

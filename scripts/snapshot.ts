// Records demo snapshots from production so the live demo survives venue Wi-Fi.
// Usage: node scripts/snapshot.ts [--base URL] [--pdf path/to/thesis.pdf ...] ["query" ...]
// No queries and no --pdf -> the four starter chips. Merges into public/demo/demo.json:
// { version, savedAt, base, thesis: {<filename>: Thesis}, search: {<snapKey(q, criteria)>: SearchResponse} }
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { snapKey } from "../public/assets/snap.js";

const STARTERS = [
  "students working on protein design with diffusion models",
  "LLM agents for software engineering",
  "battery materials discovery with machine learning",
  "robot learning for manipulation and dexterous hands",
];
const args = process.argv.slice(2);
let base = "https://labscout-nyc.vercel.app";
const pdfs: string[] = [], queries: string[] = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--base") base = args[++i];
  else if (args[i] === "--pdf") pdfs.push(args[++i]);
  else queries.push(args[i]);
}
if (!queries.length && !pdfs.length) queries.push(...STARTERS);

const DIR = new URL("../public/demo/", import.meta.url);
const OUT = new URL("demo.json", DIR);
await mkdir(DIR, { recursive: true });
let snap: any = { version: 1, savedAt: null, base, thesis: {}, search: {} };
try { snap = { ...snap, ...JSON.parse(await readFile(OUT, "utf8")) }; } catch { /* first run */ }

async function post(p: string, body: unknown) {
  const t0 = Date.now();
  const r = await fetch(base + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(120000) });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${p} HTTP ${r.status}: ${j.error ?? ""}`);
  return { j, ms: Date.now() - t0 };
}
async function search(q: string, criteria: string[] = []) {
  try {
    const { j, ms } = await post("/api/search", { q, criteria });
    j.tookMs ??= ms;
    snap.search[snapKey(q, criteria)] = j;
    console.log(`search "${q}"${criteria.length ? ` +${criteria.length} criteria` : ""} -> ${j.candidates?.length ?? 0} candidates, ${(ms / 1000).toFixed(1)} s`);
  } catch (e: any) { console.log(`FAILED "${q}": ${e?.message ?? e}`); }
}
for (const pdf of pdfs) {
  const text = execFileSync("pdftotext", ["-layout", pdf, "-"], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  const filename = path.basename(pdf);
  try {
    const { j: t } = await post("/api/thesis", { text, filename });
    snap.thesis[filename] = t;
    console.log(`thesis ${filename} -> "${t.query}" criteria=${JSON.stringify(t.criteria)}`);
    await search(t.query, t.criteria);
  } catch (e: any) { console.log(`FAILED thesis ${filename}: ${e?.message ?? e}`); }
}
await Promise.all(queries.map((q) => search(q)));
snap.savedAt = new Date().toISOString();
await writeFile(OUT, JSON.stringify(snap));
console.log(`wrote public/demo/demo.json: ${Object.keys(snap.thesis).length} theses, ${Object.keys(snap.search).length} searches`);

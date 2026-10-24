import http from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

// load .env.local without deps (before importing modules that read env at call time)
try {
  const env = await readFile(new URL("../.env.local", import.meta.url), "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
} catch {}

const { runSearch } = await import("../api/search.ts");

const PUB = new URL("../public/", import.meta.url).pathname;
const TYPES: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png" };

http.createServer(async (req, res) => {
  if (req.method === "POST" && req.url === "/api/search") {
    let body = "";
    for await (const ch of req) body += ch;
    try {
      const { q } = JSON.parse(body || "{}");
      if (!q || typeof q !== "string") { res.writeHead(400, { "content-type": "application/json" }); res.end(JSON.stringify({ error: "q required" })); return; }
      const t = Date.now();
      const out = await runSearch(q);
      console.log(`search "${q}" -> ${out.candidates.length} candidates in ${Date.now() - t}ms`);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(out));
    } catch (e: any) {
      console.error(e);
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: e?.message ?? String(e) }));
    }
    return;
  }
  const rel = req.url === "/" ? "index.html" : (req.url ?? "").split("?")[0];
  const f = path.join(PUB, path.normalize(rel).replace(/^(\.\.[/\\])+/, ""));
  if (f.startsWith(PUB) && existsSync(f)) {
    res.writeHead(200, { "content-type": TYPES[path.extname(f)] ?? "application/octet-stream" });
    res.end(await readFile(f));
    return;
  }
  res.writeHead(404);
  res.end("not found");
}).listen(Number(process.env.PORT ?? 3000), () => console.log(`labscout dev on http://localhost:${process.env.PORT ?? 3000}`));

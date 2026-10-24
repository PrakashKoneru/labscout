// Live health + usage of the four sponsor integrations, for /sponsors.
// Safety: never returns keys or raw upstream bodies — only numbers, enums and names we pick out.
export type Check = {
  id: string;
  name: string;
  role: string;
  ok: boolean;
  latencyMs: number;
  detail: Record<string, unknown>;
  checkedAt: string;
};

const TIMEOUT = 8000;
const PRISM_HOST = () => (process.env.PRISMTRACE_HOST || "https://prism.blockconvey.com").replace(/\/+$/, "");
const RT_URL = () => (process.env.ROUNDTABLE_URL || "https://roundtable.bot").replace(/\/+$/, "");

const str = (v: unknown, max = 120): string | null => (typeof v === "string" ? v.slice(0, max) : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Run one check: missing env -> not configured; any throw -> ok:false with a generic reason. Never throws. */
export async function runCheck(
  meta: { id: string; name: string; role: string; env: string[] },
  fn: () => Promise<{ ok: boolean; detail: Record<string, unknown> }>,
): Promise<Check> {
  const t0 = Date.now();
  const base = { id: meta.id, name: meta.name, role: meta.role };
  if (meta.env.some((k) => !process.env[k])) {
    return { ...base, ok: false, latencyMs: 0, detail: { reason: "not configured" }, checkedAt: new Date().toISOString() };
  }
  try {
    const r = await fn();
    return { ...base, ok: r.ok, latencyMs: Date.now() - t0, detail: r.detail, checkedAt: new Date().toISOString() };
  } catch (e: any) {
    const reason = e?.name === "TimeoutError" || e?.name === "AbortError" ? "timeout" : "request failed";
    return { ...base, ok: false, latencyMs: Date.now() - t0, detail: { reason }, checkedAt: new Date().toISOString() };
  }
}

async function getJson(url: string, init: RequestInit = {}): Promise<{ status: number; json: any }> {
  const r = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT) });
  const json = await r.json().catch(() => null);
  return { status: r.status, json };
}

// ---------- pure helpers (tested) ----------

export function traceArray(json: any): any[] {
  if (Array.isArray(json)) return json;
  for (const k of ["traces", "data", "items", "results"]) if (Array.isArray(json?.[k])) return json[k];
  return [];
}

export function summarizePrismTraces(arr: any[]): { total: number; byAgent: Record<string, number>; sessions: number; latest: string | null; recentSessions: string[] } {
  const byAgent: Record<string, number> = {};
  const sessions = new Set<string>();
  const ordered: string[] = [];
  let latest: string | null = null;
  for (const t of arr ?? []) {
    const a = str(t?.agent_id, 60) ?? "unknown";
    byAgent[a] = (byAgent[a] ?? 0) + 1;
    const s = str(t?.session_id, 80);
    if (s && !sessions.has(s)) { sessions.add(s); ordered.push(s); }
    const c = str(t?.created_at, 40);
    if (c && (!latest || c > latest)) latest = c;
  }
  return { total: (arr ?? []).length, byAgent, sessions: sessions.size, latest, recentSessions: ordered.slice(0, 5) };
}

export function summarizeBanks(json: any): { banks: { name: string; files: number | null }[]; totalFiles: number } {
  const list = Array.isArray(json) ? json : Array.isArray(json?.banks) ? json.banks : Array.isArray(json?.data) ? json.data : [];
  const banks = list.map((b: any) => ({
    name: str(b?.name ?? b?.slug ?? b?.id, 80) ?? "bank",
    files: num(b?.file_count ?? b?.files_count ?? b?.fileCount ?? b?.files) ?? (Array.isArray(b?.files) ? b.files.length : null),
  }));
  return { banks, totalFiles: banks.reduce((s: number, b: any) => s + (b.files ?? 0), 0) };
}

export function summarizeFolder(json: any): { count: number; latest: { name: string; version: string | null; updatedAt: string | null }[] } {
  const list = Array.isArray(json) ? json
    : ["files", "entries", "items", "children", "data"].map((k) => json?.[k]).find(Array.isArray) ?? [];
  const files = list
    .filter((f: any) => (f?.type ?? f?.kind ?? "file") !== "folder" && (f?.is_dir ?? f?.isDir) !== true)
    .map((f: any) => ({
      name: (str(f?.name ?? f?.path, 120) ?? "file").replace(/^.*\//, ""),
      version: str(f?.version_id ?? f?.version?.id ?? f?.latest_version_id ?? (typeof f?.version === "string" ? f.version : null), 60),
      updatedAt: str(f?.updated_at ?? f?.updatedAt ?? f?.modified_at ?? f?.created_at, 40),
    }));
  files.sort((a: any, b: any) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
  return { count: files.length, latest: files.slice(0, 5) };
}

// ---------- the four checks ----------

export const checkNicrron = () => runCheck(
  { id: "nicrron", name: "NicrronNinoo", role: "LLM gateway: thesis → keywords, 3-line briefs", env: ["NICRRON_API_KEY"] },
  async () => {
    const { status, json } = await getJson("https://api.nicrron.ai/v1/models", { headers: { Authorization: `Bearer ${process.env.NICRRON_API_KEY}` } });
    const data = Array.isArray(json?.data) ? json.data : [];
    return { ok: status === 200 && data.length > 0, detail: { httpStatus: status, models: data.length, model: "anthropic/claude-haiku-5-5", modelListed: data.some((m: any) => m?.id === "anthropic/claude-haiku-5-5") } };
  },
);

export const checkPrism = () => runCheck(
  { id: "prism", name: "PRISM by Block Convey", role: "Observability: traces every LLM call + each search", env: ["PRISMTRACE_API_KEY", "PRISMTRACE_PROJECT_ID"] },
  async () => {
    const h = { headers: { "X-PRISMtrace-Key": process.env.PRISMTRACE_API_KEY! } };
    const pid = encodeURIComponent(process.env.PRISMTRACE_PROJECT_ID!);
    const [doc, tr] = await Promise.all([
      getJson(`${PRISM_HOST()}/api/setup-doctor?project_id=${pid}`, h),
      getJson(`${PRISM_HOST()}/api/traces?project_id=${pid}&limit=50`, h),
    ]);
    const s = summarizePrismTraces(traceArray(tr.json));
    return {
      ok: doc.status === 200 && tr.status === 200,
      detail: { overall: str(doc.json?.overall, 40), liveTraceCount: num(doc.json?.live_trace_count), recentWindow: s.total, byAgent: s.byAgent, searchesTraced: s.sessions, recentSessions: s.recentSessions, latest: s.latest },
    };
  },
);

export const checkAkta = () => runCheck(
  { id: "akta", name: "akta.pro by Wokelo AI", role: "News Signals: market pull + press mentions", env: ["AKTA_API_KEY"] },
  async () => {
    // Free, 0-credit Request Status API: a 404 "Request ... not found" proves the key is accepted; 401/403 means it isn't.
    const probe = crypto.randomUUID();
    const { status, json } = await getJson(`https://api.akta.pro/api/v1/status/${probe}`, { headers: { "x-api-key": process.env.AKTA_API_KEY! } });
    const authed = status === 200 || (status === 404 && /^Request .* not found/i.test(String(json?.detail ?? "")));
    return { ok: authed, detail: { httpStatus: status, keyAccepted: authed, endpoint: "GET /api/v1/status/{request_id}", creditsConsumed: 0, method: "free status probe (no credits spent)" } };
  },
);

export const checkRoundtable = () => runCheck(
  { id: "roundtable", name: "Roundtable", role: "Shared agent workspace: saves every shortlist", env: ["ROUNDTABLE_KEY"] },
  async () => {
    const post = (tool: string, body: object) => getJson(`${RT_URL()}/api/tools/${tool}`, {
      method: "POST", headers: { authorization: `Bearer ${process.env.ROUNDTABLE_KEY}`, "content-type": "application/json" }, body: JSON.stringify(body),
    });
    const [banks, folder] = await Promise.all([post("list_banks", {}), post("browse_folder", { path: "labscout/" }).catch(() => null)]);
    const b = summarizeBanks(banks.json);
    const f = folder && folder.status === 200 ? summarizeFolder(folder.json) : null;
    return {
      ok: banks.status === 200,
      detail: { httpStatus: banks.status, banks: b.banks.slice(0, 5), bankFiles: b.totalFiles, shortlistFiles: f?.count ?? null, latestShortlists: f?.latest ?? [], browse: f ? "ok" : `unavailable${folder ? ` (${folder.status})` : ""}` },
    };
  },
);

let cache: { at: number; body: any } | null = null;

/** All four checks in parallel; 60 s in-memory cache so the page can't hammer upstreams. */
export async function getStatus(force = false): Promise<{ checks: Check[]; allOk: boolean; checkedAt: string; cached: boolean }> {
  // force (?fresh=1) still honours a 10 s floor so it can't be used to hammer upstreams
  if (cache && Date.now() - cache.at < (force ? 10_000 : 60_000)) return { ...cache.body, cached: true };
  const checks = await Promise.all([checkNicrron(), checkPrism(), checkAkta(), checkRoundtable()]);
  const body = { checks, allOk: checks.every((c) => c.ok), checkedAt: new Date().toISOString() };
  cache = { at: Date.now(), body };
  return { ...body, cached: false };
}

export function _resetCache() { cache = null; }

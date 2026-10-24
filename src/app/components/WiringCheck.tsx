"use client";

import { useCallback, useEffect, useState } from "react";
import styles from "./WiringCheck.module.css";

type Health = {
  database: string;
  branch: string | null;
  anthropicConfigured: boolean;
};

type Ping = { id: number; note: string; createdAt: string };

export default function WiringCheck() {
  const [health, setHealth] = useState<Health | null>(null);
  const [pings, setPings] = useState<Ping[]>([]);
  const [reply, setReply] = useState<string | null>(null);
  const [busy, setBusy] = useState<"ping" | "ai" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadPings = useCallback(async () => {
    const res = await fetch("/api/pings");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Could not read pings");
    setPings(data.pings);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/health");
        setHealth(await res.json());
        await loadPings();
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Unexpected error");
      }
    })();
  }, [loadPings]);

  async function writePing() {
    setBusy("ping");
    setError(null);
    try {
      const res = await fetch("/api/pings", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not write a ping");
      await loadPings();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unexpected error");
    } finally {
      setBusy(null);
    }
  }

  async function askClaude() {
    setBusy("ai");
    setError(null);
    try {
      const res = await fetch("/api/ai", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not reach Anthropic");
      setReply(data.text);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unexpected error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className={styles.panel}>
      <dl className={styles.status}>
        <dt>Postgres</dt>
        <dd>{health ? health.database : "checking…"}</dd>
        <dt>Neon branch</dt>
        <dd>{health?.branch ?? "unknown"}</dd>
        <dt>Anthropic key</dt>
        <dd>{health ? (health.anthropicConfigured ? "present" : "missing") : "checking…"}</dd>
      </dl>

      <div className={styles.actions}>
        <button onClick={writePing} disabled={busy !== null}>
          {busy === "ping" ? "Writing…" : "Write a ping"}
        </button>
        <button onClick={askClaude} disabled={busy !== null}>
          {busy === "ai" ? "Asking…" : "Ask Claude"}
        </button>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      {pings.length > 0 && (
        <ol className={styles.pings}>
          {pings.map((ping) => (
            <li key={ping.id}>
              <span>#{ping.id}</span> {ping.note}{" "}
              <time dateTime={ping.createdAt}>{new Date(ping.createdAt).toLocaleTimeString()}</time>
            </li>
          ))}
        </ol>
      )}

      {reply && <p className={styles.reply}>{reply}</p>}
    </section>
  );
}

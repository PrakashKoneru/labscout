"use client";

import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, FormEvent, KeyboardEvent } from "react";
import NichePanel from "./components/NichePanel";
import PeoplePanel from "./components/PeoplePanel";
import type { Probe, SearchResult } from "@/lib/labscout";
import type { Niche, ThesisRead, Turn } from "@/lib/thesis";
import styles from "./page.module.css";

const ACCEPT = ".pdf,.txt,.md,.markdown,.csv,.json,.rtf";

const EXAMPLES = [
  "We back pre-seed technical founders in AI for drug discovery",
  "Hard tech: battery materials, novel compute, climate sensing",
  "Applied ML systems — agents, inference infrastructure, eval tooling",
];

type SourceSummary = { kind: string; label: string; note: string; readable: boolean };

type Busy = null | "thesis" | "chat" | "people";

const WAITING: Record<Exclude<Busy, null>, string> = {
  thesis: "Reading your thesis, then probing every niche against OpenAlex, ORCID and akta.pro",
  chat: "Rethinking the niches and re-probing each one",
  people: "Searching papers, checking ORCID, writing briefs, saving to Roundtable",
};

export default function Home() {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState<Busy>(null);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [sources, setSources] = useState<SourceSummary[]>([]);
  const [thesis, setThesis] = useState<ThesisRead | null>(null);
  const [niches, setNiches] = useState<Niche[]>([]);
  const [probes, setProbes] = useState<Probe[]>([]);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [chosen, setChosen] = useState<string | null>(null);
  const [result, setResult] = useState<SearchResult | null>(null);

  const fileInput = useRef<HTMLInputElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);

  const hasInput = text.trim().length > 0 || files.length > 0;

  useEffect(() => {
    if (!busy) return;
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 500);
    return () => clearInterval(timer);
  }, [busy]);

  /** Resetting the clock here rather than in the effect keeps renders from cascading. */
  function start(kind: Exclude<Busy, null>) {
    setElapsed(0);
    setBusy(kind);
    setError(null);
  }

  function grow(element: HTMLTextAreaElement) {
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, 320)}px`;
  }

  function onTextChange(event: ChangeEvent<HTMLTextAreaElement>) {
    setText(event.target.value);
    grow(event.target);
  }

  function onFilesPicked(event: ChangeEvent<HTMLInputElement>) {
    setFiles((current) => [...current, ...Array.from(event.target.files ?? [])]);
    event.target.value = "";
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submitThesis();
    }
  }

  async function submitThesis() {
    if (!hasInput || busy) return;

    start("thesis");
    setResult(null);
    setChosen(null);
    setTurns([]);

    const payload = new FormData();
    payload.set("text", text);
    for (const file of files) payload.append("files", file);

    try {
      const response = await fetch("/api/thesis", { method: "POST", body: payload });
      const data = await response.json();
      if (!response.ok || data.error) throw new Error(data.error ?? "Could not read the thesis");

      setThesis(data.thesis);
      setNiches(data.thesis.niches);
      setProbes(data.probes);
      setSources(data.sources ?? []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  async function refine(message: string) {
    if (!thesis || busy) return;

    const history: Turn[] = [...turns, { role: "user", content: message }];
    setTurns(history);
    start("chat");

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ thesis: { ...thesis, niches }, history }),
      });
      const data = await response.json();
      if (!response.ok || data.error) throw new Error(data.error ?? "Could not refine the niches");

      setTurns([...history, { role: "assistant", content: data.reply }]);
      setNiches(data.niches);
      setProbes(data.probes);
      setChosen(null);
      setResult(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  async function choose(niche: Niche) {
    if (busy) return;

    start("people");
    setChosen(niche.query);

    try {
      const response = await fetch("/api/people", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: niche.query }),
      });
      const data = await response.json();
      if (!response.ok || data.error) throw new Error(data.error ?? "Could not find people");
      setResult(data);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  function reset() {
    setThesis(null);
    setNiches([]);
    setProbes([]);
    setTurns([]);
    setResult(null);
    setChosen(null);
    setSources([]);
    setError(null);
    setText("");
    setFiles([]);
  }

  const skipped = sources.filter((source) => !source.readable);

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <h1 className={styles.wordmark}>labscout</h1>
        <p className={styles.tagline}>
          Drop your fund thesis. We find the niches where the talent actually is, then the people in them.
        </p>

        {!thesis && (
          <>
            <form className={styles.composer} onSubmit={(event: FormEvent) => {
              event.preventDefault();
              void submitThesis();
            }}>
              {files.length > 0 && (
                <ul className={styles.chips}>
                  {files.map((file, index) => (
                    <li key={`${file.name}-${index}`} className={styles.chip}>
                      <span className={styles.chipName}>{file.name}</span>
                      <button
                        type="button"
                        className={styles.chipRemove}
                        onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}
                        aria-label={`Remove ${file.name}`}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <textarea
                ref={textarea}
                className={styles.input}
                value={text}
                onChange={onTextChange}
                onKeyDown={onKeyDown}
                placeholder="Paste your thesis, attach the memo, or describe what you invest in…"
                rows={1}
              />

              <div className={styles.actions}>
                <input
                  ref={fileInput}
                  type="file"
                  multiple
                  accept={ACCEPT}
                  className={styles.hiddenInput}
                  onChange={onFilesPicked}
                />
                <button type="button" className={styles.attach} onClick={() => fileInput.current?.click()}>
                  Attach thesis
                </button>
                <button type="submit" className={styles.send} disabled={!hasInput || busy !== null}>
                  {busy ? "Working…" : "Find my niche"}
                </button>
              </div>
            </form>

            <div className={styles.examples}>
              {EXAMPLES.map((example) => (
                <button
                  key={example}
                  type="button"
                  className={styles.example}
                  onClick={() => {
                    setText(example);
                    if (textarea.current) grow(textarea.current);
                  }}
                >
                  {example}
                </button>
              ))}
            </div>
          </>
        )}

        {busy && (
          <p className={styles.waiting}>
            {WAITING[busy]} · {elapsed}s
            <span className={styles.waitingHint}>usually 10–20 seconds</span>
          </p>
        )}

        {error && <p className={styles.error}>{error}</p>}

        {skipped.length > 0 && (
          <ul className={styles.skipped}>
            {skipped.map((source) => (
              <li key={source.label}>
                {source.label}: {source.note}
              </li>
            ))}
          </ul>
        )}

        {thesis && (
          <NichePanel
            thesis={thesis}
            niches={niches}
            probes={probes}
            turns={turns}
            busy={busy !== null}
            chosen={chosen}
            onRefine={(message) => void refine(message)}
            onChoose={(niche) => void choose(niche)}
          />
        )}

        {result && <PeoplePanel result={result} />}

        {thesis && (
          <button type="button" className={styles.reset} onClick={reset} disabled={busy !== null}>
            Start over with a different thesis
          </button>
        )}
      </main>
    </div>
  );
}

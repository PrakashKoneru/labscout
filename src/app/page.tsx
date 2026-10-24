"use client";

import { useRef, useState } from "react";
import type { ChangeEvent, FormEvent, KeyboardEvent } from "react";
import styles from "./page.module.css";

const ACCEPT = ".pdf,.txt,.md,.markdown,.csv,.json,.rtf";

type Source = {
  kind: "file" | "gdoc";
  label: string;
  note: string;
  readable: boolean;
};

type Profile = {
  title: string;
  summary: string;
  field: string;
  stage: string;
  keywords: string[];
  methods: string[];
  applications: string[];
  commercialAngle: string;
};

type IntakeResponse = {
  sources?: Source[];
  profile?: Profile;
  model?: string;
  usage?: { inputTokens: number; outputTokens: number };
  match?: unknown;
  error?: string;
};

export default function Home() {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<IntakeResponse | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);

  const hasInput = text.trim().length > 0 || files.length > 0;

  function grow(element: HTMLTextAreaElement) {
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, 320)}px`;
  }

  function onTextChange(event: ChangeEvent<HTMLTextAreaElement>) {
    setText(event.target.value);
    grow(event.target);
  }

  function onFilesPicked(event: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(event.target.files ?? []);
    setFiles((current) => [...current, ...picked]);
    event.target.value = "";
  }

  function removeFile(index: number) {
    setFiles((current) => current.filter((_, i) => i !== index));
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submit();
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    await submit();
  }

  async function submit() {
    if (!hasInput || busy) return;

    setBusy(true);
    setError(null);
    setResult(null);

    const payload = new FormData();
    payload.set("text", text);
    for (const file of files) payload.append("files", file);

    try {
      const response = await fetch("/api/intake", { method: "POST", body: payload });
      const data: IntakeResponse = await response.json();
      if (!response.ok || data.error) throw new Error(data.error ?? "Intake failed");
      setResult(data);
      setText("");
      setFiles([]);
      if (textarea.current) {
        textarea.current.style.height = "auto";
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <h1 className={styles.wordmark}>labscout</h1>
        <p className={styles.tagline}>
          Paste your work, drop a doc, or share a Google Doc link.
        </p>

        <form className={styles.composer} onSubmit={onSubmit}>
          {files.length > 0 && (
            <ul className={styles.chips}>
              {files.map((file, index) => (
                <li key={`${file.name}-${index}`} className={styles.chip}>
                  <span className={styles.chipName}>{file.name}</span>
                  <button
                    type="button"
                    className={styles.chipRemove}
                    onClick={() => removeFile(index)}
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
            placeholder="Describe what you are building, or paste a link…"
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
            <button
              type="button"
              className={styles.attach}
              onClick={() => fileInput.current?.click()}
            >
              Attach
            </button>
            <button type="submit" className={styles.send} disabled={!hasInput || busy}>
              {busy ? "Processing…" : "Send"}
            </button>
          </div>
        </form>

        <p className={styles.hint}>Enter to send · Shift + Enter for a new line</p>

        {error && <p className={styles.error}>{error}</p>}

        {result && (
          <section className={styles.result}>
            <h2 className={styles.resultTitle}>Sources</h2>
            {result.sources?.map((source, index) => (
              <article key={index} className={styles.source}>
                <header className={styles.sourceHead}>
                  <span className={styles.sourceKind}>{source.kind}</span>
                  <span className={styles.sourceLabel}>{source.label}</span>
                  <span className={styles.sourceMeta}>{source.readable ? "read" : "skipped"}</span>
                </header>
                <p className={styles.sourcePreview}>{source.note}</p>
              </article>
            ))}

            {result.profile && (
              <>
                <h2 className={`${styles.resultTitle} ${styles.spaced}`}>
                  Extracted
                  <span className={styles.usage}>
                    {result.model}
                    {result.usage &&
                      ` · ${result.usage.inputTokens.toLocaleString()} in · ${result.usage.outputTokens.toLocaleString()} out`}
                  </span>
                </h2>
                <pre className={styles.json}>{JSON.stringify(result.profile, null, 2)}</pre>
              </>
            )}

            {result.match !== undefined && (
              <>
                <h2 className={`${styles.resultTitle} ${styles.spaced}`}>Matching API response</h2>
                <pre className={styles.json}>{JSON.stringify(result.match, null, 2)}</pre>
              </>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

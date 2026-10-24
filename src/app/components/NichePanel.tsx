"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import type { Probe } from "@/lib/labscout";
import type { Niche, ThesisRead, Turn } from "@/lib/thesis";
import styles from "./NichePanel.module.css";

type Props = {
  thesis: ThesisRead;
  niches: Niche[];
  probes: Probe[];
  turns: Turn[];
  busy: boolean;
  chosen: string | null;
  onRefine: (message: string) => void;
  onChoose: (niche: Niche) => void;
};

function Density({ probe }: { probe: Probe }) {
  if (probe.error) {
    return <p className={styles.probeError}>Could not probe this niche: {probe.error}</p>;
  }

  return (
    <div className={styles.density}>
      <span className={styles.metric}>
        <strong>{probe.totalWorks}</strong> papers
      </span>
      <span className={styles.metric}>
        <strong>{probe.verifiedStudents}</strong> verified students
      </span>
      <span className={styles.metric}>
        top score <strong>{probe.topScore}</strong>
      </span>
      {probe.marketHeadlines > 0 && (
        <span className={styles.metric}>
          <strong>{probe.marketHeadlines}</strong> market stories
        </span>
      )}
      {probe.setAside > 0 && (
        <span className={styles.metricFaint}>{probe.setAside} faculty or incomplete, set aside</span>
      )}
    </div>
  );
}

export default function NichePanel({
  thesis,
  niches,
  probes,
  turns,
  busy,
  chosen,
  onRefine,
  onChoose,
}: Props) {
  const [message, setMessage] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = message.trim();
    if (!trimmed || busy) return;
    onRefine(trimmed);
    setMessage("");
  }

  /** The strongest niche by talent found, which is not always the first proposed. */
  const best = probes.reduce<Probe | null>(
    (leader, probe) => (!probe.error && (!leader || probe.topScore > leader.topScore) ? probe : leader),
    null,
  );

  return (
    <section className={styles.panel}>
      <div className={styles.thesis}>
        <h2 className={styles.heading}>What your thesis says</h2>
        <p className={styles.summary}>{thesis.summary}</p>
        <div className={styles.tagRow}>
          {thesis.focusAreas.map((area) => (
            <span key={area} className={styles.tag}>
              {area}
            </span>
          ))}
          {thesis.avoid.map((area) => (
            <span key={area} className={`${styles.tag} ${styles.tagAvoid}`}>
              not {area}
            </span>
          ))}
        </div>
      </div>

      {turns.length > 0 && (
        <div className={styles.thread}>
          {turns.map((turn, index) => (
            <p key={index} className={turn.role === "user" ? styles.fromUser : styles.fromAgent}>
              {turn.content}
            </p>
          ))}
        </div>
      )}

      <h2 className={styles.heading}>
        Where the talent actually is
        {best && <span className={styles.note}>strongest: {best.label}</span>}
      </h2>

      <ul className={styles.niches}>
        {niches.map((niche) => {
          const probe = probes.find((one) => one.query === niche.query);
          const isChosen = chosen === niche.query;

          return (
            <li key={niche.query} className={`${styles.niche} ${isChosen ? styles.nicheChosen : ""}`}>
              <div className={styles.nicheHead}>
                <h3 className={styles.nicheLabel}>{niche.label}</h3>
                <code className={styles.query}>{niche.query}</code>
              </div>

              <p className={styles.rationale}>{niche.rationale}</p>
              <p className={styles.evidence}>From your thesis: &ldquo;{niche.evidence}&rdquo;</p>

              {probe ? <Density probe={probe} /> : <p className={styles.probeError}>Not probed.</p>}

              {probe && probe.topNames.length > 0 && (
                <p className={styles.names}>Leading: {probe.topNames.join(", ")}</p>
              )}

              <button
                type="button"
                className={styles.choose}
                disabled={busy || !probe || Boolean(probe.error)}
                onClick={() => onChoose(niche)}
              >
                {isChosen ? "Showing people" : "Find people"}
              </button>
            </li>
          );
        })}
      </ul>

      <form className={styles.refine} onSubmit={submit}>
        <input
          className={styles.refineInput}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Narrow it down — &ldquo;more hardware, less bio&rdquo;, &ldquo;only wet-lab work&rdquo;…"
          disabled={busy}
        />
        <button type="submit" className={styles.refineSend} disabled={busy || !message.trim()}>
          Refine
        </button>
      </form>
    </section>
  );
}

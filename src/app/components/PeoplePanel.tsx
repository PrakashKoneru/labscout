"use client";

import { useState } from "react";
import { standing, type Candidate, type SearchResult } from "@/lib/labscout";
import styles from "./PeoplePanel.module.css";

const BADGES = {
  student: { label: "Current student", className: "badgeOk" },
  unverified: { label: "Unverified", className: "badgeUnknown" },
  ended: { label: "Education ended", className: "badgeEnded" },
  senior: { label: "Established researcher", className: "badgeSenior" },
  incomplete: { label: "Profile incomplete", className: "badgeUnknown" },
} as const;

function Badge({ candidate }: { candidate: Candidate }) {
  const badge = BADGES[standing(candidate)];
  return <span className={styles[badge.className]}>{badge.label}</span>;
}

function briefText(candidate: Candidate) {
  const sources = [candidate.authorId, candidate.orcid].filter(Boolean).join("\n");
  return `${candidate.name} — ${candidate.institutions.join(", ")}\n\n${candidate.brief}\n\nSources:\n${sources}`;
}

function PersonCard({ candidate, rank }: { candidate: Candidate; rank: number }) {
  const [copied, setCopied] = useState(false);
  const [showScore, setShowScore] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(briefText(candidate));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <article className={styles.card}>
      <header className={styles.cardHead}>
        <span className={styles.rank}>{rank}</span>
        <div className={styles.identity}>
          <h3 className={styles.name}>{candidate.name}</h3>
          <p className={styles.school}>{candidate.institutions.join(", ") || "Institution unknown"}</p>
        </div>
        <Badge candidate={candidate} />
        <button
          type="button"
          className={styles.score}
          onClick={() => setShowScore((open) => !open)}
          aria-expanded={showScore}
        >
          {candidate.score} <span className={styles.scoreHint}>why</span>
        </button>
      </header>

      {showScore && (
        <ul className={styles.reasons}>
          {candidate.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      )}

      <div className={styles.brief}>
        {candidate.brief.split("\n").map((line, index) => (
          <p key={index}>{line}</p>
        ))}
      </div>

      {candidate.works.length > 0 && (
        <ul className={styles.works}>
          {candidate.works.slice(0, 3).map((work) => (
            <li key={work.url ?? work.title}>
              <a href={work.url ?? "#"} target="_blank" rel="noreferrer" className={styles.workTitle}>
                {work.title}
              </a>
              <span className={styles.workMeta}>
                {work.position} author
                {work.year ? ` · ${work.year}` : ""}
                {work.venue ? ` · ${work.venue}` : ""}
                {work.citedBy ? ` · ${work.citedBy} citations` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}

      {candidate.mentions.length > 0 && (
        <div className={styles.mentions}>
          <span className={styles.mentionsLabel}>Press</span>
          {candidate.mentions.slice(0, 2).map((mention) => (
            <a key={mention.url} href={mention.url} target="_blank" rel="noreferrer" className={styles.mention}>
              {mention.title}
              {mention.publisher ? ` — ${mention.publisher}` : ""}
            </a>
          ))}
        </div>
      )}

      <footer className={styles.cardFoot}>
        <button type="button" className={styles.copy} onClick={copy}>
          {copied ? "Copied" : "Copy brief"}
        </button>
        <a href={candidate.authorId} target="_blank" rel="noreferrer" className={styles.link}>
          OpenAlex
        </a>
        {candidate.orcid && (
          <a href={candidate.orcid} target="_blank" rel="noreferrer" className={styles.link}>
            ORCID
          </a>
        )}
        <span className={styles.counts}>
          {candidate.worksCount} papers · {candidate.recentWorksCount} recent
        </span>
      </footer>
    </article>
  );
}

export default function PeoplePanel({ result }: { result: SearchResult }) {
  const ran = Object.entries(result.integrations).filter(([, used]) => used);

  return (
    <section className={styles.panel}>
      {result.market.length > 0 && (
        <>
          <h2 className={styles.heading}>
            Market pull
            <span className={styles.note}>akta.pro</span>
          </h2>
          <ul className={styles.market}>
            {result.market.slice(0, 4).map((item) => (
              <li key={item.url} className={styles.marketItem}>
                <a href={item.url} target="_blank" rel="noreferrer" className={styles.marketTitle}>
                  {item.title}
                </a>
                <span className={styles.marketMeta}>
                  {item.publisher}
                  {item.publishedDate ? ` · ${item.publishedDate.slice(0, 10)}` : ""}
                  {item.sentiment ? ` · ${item.sentiment}` : ""}
                </span>
                {item.summary && <p className={styles.marketSummary}>{item.summary}</p>}
              </li>
            ))}
          </ul>
        </>
      )}

      <h2 className={`${styles.heading} ${styles.spaced}`}>
        People
        <span className={styles.note}>
          {result.candidates.length} ranked from {result.totalWorks} papers · keywords &ldquo;{result.keywords}
          &rdquo;
        </span>
      </h2>

      <div className={styles.cards}>
        {result.candidates.map((candidate, index) => (
          <PersonCard key={candidate.authorId} candidate={candidate} rank={index + 1} />
        ))}
      </div>

      <footer className={styles.provenance}>
        {result.roundtable && (
          <span>
            Shortlist saved to <code>{result.roundtable.path}</code> (version{" "}
            {result.roundtable.version.slice(0, 8)})
          </span>
        )}
        <span className={styles.dots}>
          {ran.map(([name]) => (
            <span key={name} className={styles.dot}>
              ● {name}
            </span>
          ))}
        </span>
      </footer>
    </section>
  );
}

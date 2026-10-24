"use client";

import { useState, useSyncExternalStore, type KeyboardEvent } from "react";
import { profiles, type Evidence } from "./data";
import styles from "./Dossier.module.css";

type Props = { id: string; onBack: () => void; onOpen: (id: string) => void };
type Tab = "overview" | "research" | "social" | "github";
const SAVE_EVENT = "full-signal-saved-change";
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "overview", label: "Overview", icon: "◫" },
  { id: "research", label: "Research", icon: "▤" },
  { id: "social", label: "Social & marketing", icon: "◎" },
  { id: "github", label: "GitHub", icon: "⌘" },
];

function subscribeToSaved(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(SAVE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(SAVE_EVENT, callback);
  };
}

function readSaved(id: string) {
  try {
    return window.localStorage.getItem(`full-signal:saved:${id}`) === "true" ? "saved" : "unsaved";
  } catch {
    return "unavailable";
  }
}

function EvidenceList({ items, empty }: { items: Evidence[]; empty: string }) {
  return items.length ? <div className={styles.evidenceList}>{items.map((item) => (
    <article className={styles.evidenceEntry} key={item.id}>
      <div className={styles.recordMeta}><span>{item.category}</span><time dateTime={item.date}>{item.date}</time></div>
      <h3>{item.title}</h3>
      <p>{item.detail}</p>
      <div className={styles.interpretation}><span>Our reading</span><p>{item.interpretation}</p></div>
      <small>{item.source} · Fictional sample record, no verified source link</small>
    </article>
  ))}</div> : <p className={styles.emptyEvidence}>{empty}</p>;
}

export default function Dossier({ id, onBack, onOpen }: Props) {
  const profile = profiles.find((item) => item.id === id);
  const [tab, setTab] = useState<Tab>("overview");
  const [saveError, setSaveError] = useState("");
  const savedState = useSyncExternalStore(subscribeToSaved, () => readSaved(id), () => "unsaved");

  if (!profile) return <section className={styles.empty}><h1 id="dossier-heading" tabIndex={-1}>This file is unavailable.</h1><button type="button" onClick={onBack}>Back to cabinet</button></section>;

  const isSaved = savedState === "saved";
  const fileNumber = String(profiles.indexOf(profile) + 1).padStart(3, "0");
  const evidence = [...profile.evidence].sort((a, b) => b.date.localeCompare(a.date));
  const research = evidence.filter((item) => /arxiv|scholar|patent|nsf|grant|paper|research/i.test(`${item.source} ${item.title}`));
  const social = evidence.filter((item) => /Commercial pull|Early traction/.test(item.category));
  const github = evidence.filter((item) => /repository|github|git/i.test(item.source));

  function handleSave() {
    try {
      window.localStorage.setItem(`full-signal:saved:${id}`, String(!isSaved));
      window.dispatchEvent(new Event(SAVE_EVENT));
      setSaveError("");
    } catch {
      setSaveError("Your browser could not save this file. Please enable browser storage and try again.");
    }
  }

  function handleTabKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = event.key === "ArrowRight" ? (index + 1) % TABS.length : event.key === "ArrowLeft" ? (index + TABS.length - 1) % TABS.length : event.key === "Home" ? 0 : event.key === "End" ? TABS.length - 1 : null;
    if (next === null) return;
    event.preventDefault();
    setTab(TABS[next].id);
    document.getElementById(`dossier-tab-${TABS[next].id}`)?.focus();
  }

  return (
    <section className={styles.dossier} aria-label="Candidate dossier">
      <nav className={styles.navigation} aria-label="Dossier navigation"><button type="button" onClick={onBack}>← <span>Back to cabinet</span></button><span className={styles.fileNumber}>FILE {fileNumber}</span></nav>
      <div className={styles.file}>
        <div className={styles.folderTop}>
          <span className={styles.shoulder}>{profile.type} file <span>{fileNumber}</span></span>
          <div className={styles.tabs} role="tablist" aria-label="Dossier sections">{TABS.map((item, index) => <button type="button" role="tab" id={`dossier-tab-${item.id}`} aria-controls={`dossier-panel-${item.id}`} aria-selected={tab === item.id} tabIndex={tab === item.id ? 0 : -1} key={item.id} onClick={() => setTab(item.id)} onKeyDown={(event) => handleTabKey(event, index)}><span aria-hidden="true">{item.icon}</span>{item.label}</button>)}</div>
        </div>
        <article className={styles.paper}>
          <header className={styles.header}>
            <div><p className={styles.eyebrow}>{profile.field}</p><h1 id="dossier-heading" tabIndex={-1}>{profile.name}</h1><p className={styles.affiliation}>{profile.affiliation}</p><p className={styles.status}><span aria-hidden="true" />{profile.status}</p></div>
            <button className={styles.save} type="button" onClick={handleSave} aria-pressed={isSaved}><span aria-hidden="true">{isSaved ? "★" : "☆"}</span> {isSaved ? "Saved" : "Save"}</button>
          </header>
          {(saveError || savedState === "unavailable") && <p className={styles.saveMessage} role="status">{saveError || "Browser storage is unavailable. Saved files may not persist."}</p>}
          <div role="tabpanel" id={`dossier-panel-${tab}`} aria-labelledby={`dossier-tab-${tab}`} tabIndex={0} className={styles.panel}>
            {tab === "overview" && <>
              <section className={styles.scorePanel} aria-label="Spinout assessment">
                <div><span className={styles.smallLabel}>Spinout Score</span><p className={styles.score}>{profile.score}<span>/100</span></p><span className={styles.trend}>↗ {profile.trend}</span></div>
                <div className={styles.scoreContext}><span className={styles.smallLabel}>Strongest signal</span><h2>{profile.strongestSignal}</h2><p>Intent and recent momentum, with builder and track-record bonuses.</p><a href="#profile-evidence" onClick={(event) => { event.preventDefault(); document.getElementById("profile-evidence")?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" }); }} className={styles.scoreAction}>View the evidence <span aria-hidden="true">↘</span></a></div>
              </section>
              <div className={styles.categories} aria-label="Signal breakdown">{profile.categories.map((category, index) => <div className={category.label === "Spinout intent" ? styles.primaryCategory : styles.category} key={category.label}><span>{String(index + 1).padStart(2, "0")} {category.label}</span><div className={styles.categoryValue}><strong>{category.value || "—"}</strong><span className={styles.blocks} aria-hidden="true">{[0, 1, 2, 3, 4].map((block) => <i key={block} data-filled={category.value > block * 20} />)}</span></div></div>)}</div>
              <section className={styles.whyNow}><span className={styles.smallLabel}>Why now</span><p>{profile.summary}</p></section>
              <div className={styles.contentGrid}>
                <section id="profile-evidence"><div className={styles.sectionHeading}><h2>Recent evidence</h2><span>{evidence.length} records</span></div><EvidenceList items={evidence} empty="No evidence is available yet. Missing coverage is not a negative assessment." /></section>
                <aside className={styles.related}><div className={styles.sectionHeading}><h2>Connected files</h2></div>{profile.related.length ? profile.related.map((person) => person.id ? <button type="button" key={person.name} onClick={() => onOpen(person.id!)}><span><strong>{person.name}</strong><small>{person.relation}</small></span><span aria-hidden="true">↗</span></button> : <div className={styles.relatedPerson} key={person.name}><strong>{person.name}</strong><small>{person.relation}</small></div>) : <p>No related files identified.</p>}<p className={styles.relatedNote}>Shared activity suggests a connection; it does not confirm startup intent.</p></aside>
              </div>
            </>}
            {tab === "research" && <section><div className={styles.sectionHeading}><h2>Research & IP</h2><span>{research.length} records</span></div><p className={styles.sectionIntro}>Papers, grants, and patent activity connected to this file.</p><EvidenceList items={research} empty="No research or IP records are available for this file yet." /></section>}
            {tab === "social" && <section><div className={styles.sectionHeading}><h2>Social & marketing</h2><span>{social.length} records</span></div><p className={styles.sectionIntro}>Public-facing activity and signs of commercial interest.</p><div className={styles.coverageNote}>No verified social profiles or marketing links are connected to this file.</div><EvidenceList items={social} empty="No commercial announcements or public-facing activity are recorded yet. This is a coverage gap, not evidence of inactivity." /></section>}
            {tab === "github" && <section><div className={styles.sectionHeading}><h2>GitHub & open source</h2><span>{github.length} records</span></div><p className={styles.sectionIntro}>Repository activity and released artifacts found in the available evidence.</p><EvidenceList items={github} empty="No repository records are available yet. A GitHub account has not been verified for this candidate." /></section>}
          </div>
          <footer className={styles.footer}>Fictional sample profile and evidence. Scores are illustrative rankings, not verified assessments or probabilities.</footer>
        </article>
      </div>
    </section>
  );
}

"use client";

import { useState } from "react";
import type { CSSProperties } from "react";
import { profiles } from "./data";
import type { Profile } from "./data";
import styles from "./Cabinet.module.css";

type CabinetProps = { onOpen: (id: string) => void; onNewSearch: () => void; query: string };
const PAGE_SIZE = 8;
const TYPES = ["All files", "Researcher", "Emerging team", "Company"] as const;
type EntityFilter = (typeof TYPES)[number];
type SortOrder = "signal" | "recent" | "name";
const SIGNALS = ["Research", "Builder", "Industry pull", "Spinout intent"];

function latestDate(profile: Profile) {
  return Math.max(0, ...profile.evidence.map((item) => Date.parse(item.date) || 0));
}

function shortName(profile: Profile) {
  const words = profile.name.split(" ");
  return profile.type === "Researcher" ? `${words[0][0]}. ${words.slice(1).join(" ")}` : profile.name;
}

function Folder({ profile, index, row, isSelected, onSelect }: {
  profile: Profile; index: number; row: number; isSelected: boolean; onSelect: () => void;
}) {
  const offset = [68, 548, 300, 588, 92, 360, 570, 160][row % 8];
  const tabPath = `M${offset} 31Q${offset + 7} 31 ${offset + 13} 23L${offset + 24} 9Q${offset + 30} 1 ${offset + 40} 1H${offset + 216}Q${offset + 226} 1 ${offset + 232} 9L${offset + 243} 23Q${offset + 249} 31 ${offset + 256} 31Z`;
  const path = `M12 31H${offset}Q${offset + 7} 31 ${offset + 13} 23L${offset + 24} 9Q${offset + 30} 1 ${offset + 40} 1H${offset + 216}Q${offset + 226} 1 ${offset + 232} 9L${offset + 243} 23Q${offset + 249} 31 ${offset + 256} 31H888Q899 31 899 43V84H1V43Q1 31 12 31Z`;
  const style = { "--tab-left": `${offset / 900 * 100}%`, "--tab-width": `${256 / 900 * 100}%` } as CSSProperties;
  return <li className={`${styles.folderItem} ${isSelected ? styles.activeItem : ""}`} style={style}>
    <button type="button" className={styles.folder} onClick={onSelect} aria-pressed={isSelected} aria-label={`Select ${profile.name}, spinout score ${profile.score}`}>
      <svg className={styles.folderShape} viewBox="0 0 900 85" preserveAspectRatio="none" aria-hidden="true"><path d={path} />{isSelected && <path className={styles.activeTabShape} d={tabPath} />}</svg>
      <span className={styles.folderTab}><span>{String(index + 1).padStart(3, "0")}</span><span className={styles.tabName}>{shortName(profile)}</span><strong>{profile.score}</strong></span>
    </button>
  </li>;
}

function OpenFile({ profile, onOpen }: { profile: Profile; onOpen: () => void }) {
  return <article className={styles.openFile} aria-live="polite" aria-label={`${profile.name} selected file`}>
    <div className={styles.identity}><h2>{profile.name}</h2><p>{profile.type} · {profile.field}</p></div>
    <div className={styles.scorePanel}>
      <div className={styles.score}><span className={styles.smallLabel}>SPINOUT SCORE</span><div><strong>{profile.score}</strong><span>/100</span></div></div>
      <div className={styles.momentum}><span className={styles.smallLabel}>RECENT MOMENTUM</span><p className={styles.trend}>{profile.trend} <span aria-hidden="true">↗</span></p><p className={styles.strongest}>{profile.strongestSignal}</p><button type="button" onClick={onOpen}>VIEW FULL DOSSIER <span aria-hidden="true">↗</span></button></div>
    </div>
    <div className={styles.ratings}>{SIGNALS.map((label, index) => {
      const category = profile.categories[index];
      const filled = Math.round((category?.value ?? 0) / 20);
      return <div key={label} className={`${styles.rating} ${index === 3 ? styles.intent : ""}`} aria-label={`${label}: ${category?.value ?? 0} out of 100`}><span>{String(index + 1).padStart(2, "0")} {label}{index === 3 ? " · ×WEIGHT" : ""}</span><div aria-hidden="true">{[0, 1, 2, 3, 4].map((box) => <i key={box} className={box < filled ? styles.filled : ""} />)}</div></div>;
    })}</div>
  </article>;
}

export default function Cabinet({ onOpen, onNewSearch, query }: CabinetProps) {
  const [search, setSearch] = useState("");
  const [entityType, setEntityType] = useState<EntityFilter>("All files");
  const [sort, setSort] = useState<SortOrder>("signal");
  const [selectedId, setSelectedId] = useState(profiles[0]?.id ?? "");
  const [page, setPage] = useState(0);
  const normalizedSearch = search.trim().toLowerCase();
  const filtered = profiles.filter((profile) => (entityType === "All files" || profile.type === entityType) && [profile.name, profile.field, profile.affiliation, profile.company ?? "", profile.strongestSignal].join(" ").toLowerCase().includes(normalizedSearch)).sort((left, right) => {
    if (sort === "name") return left.name.localeCompare(right.name);
    if (sort === "recent") return latestDate(right) - latestDate(left);
    return right.score - left.score;
  });
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const selected = visible.find((profile) => profile.id === selectedId) ?? visible[0];
  const stacked = selected ? [...visible.filter((profile) => profile.id !== selected.id), selected] : [];
  function clearFilters() { setSearch(""); setEntityType("All files"); setPage(0); }

  return <section className={styles.page} aria-labelledby="cabinet-title">
    <header className={styles.titleRow}><div><h1 id="cabinet-title">Spinout watchlist</h1><p title={query}>{query || "The people behind what comes next."}</p></div><button type="button" onClick={onNewSearch}>New search <span aria-hidden="true">↗</span></button></header>
    <div className={styles.toolbar}>
      <label className={styles.search}><span aria-hidden="true">⌕</span><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); }} placeholder="Find a name, field, or signal" aria-label="Search within cabinet" /></label>
      <div className={styles.filterGroup} aria-label="Filter by entity type">{TYPES.map((type) => <button type="button" key={type} aria-pressed={entityType === type} className={entityType === type ? styles.activeFilter : ""} onClick={() => { setEntityType(type); setPage(0); }}>{type === "Researcher" ? "People" : type === "Emerging team" ? "Teams" : type === "Company" ? "Companies" : type}</button>)}</div>
      <label className={styles.sort}><span className={styles.srOnly}>Sort files</span><select value={sort} onChange={(event) => { setSort(event.target.value as SortOrder); setPage(0); }}><option value="signal">Sort: Spinout score</option><option value="recent">Sort: Recent activity</option><option value="name">Sort: Name A–Z</option></select></label>
    </div>
    <div className={styles.archive}>
      <div className={styles.cabinetMeta}><span aria-live="polite">{String(filtered.length).padStart(2, "0")} CONNECTED FILES</span><span>INTENT × MOMENTUM</span></div>
      <div className={styles.cabinet}>
        {selected ? <><ol className={styles.folderList}>{stacked.map((profile, row) => <Folder key={profile.id} profile={profile} index={profiles.findIndex((item) => item.id === profile.id)} row={row} isSelected={selected.id === profile.id} onSelect={() => setSelectedId(profile.id)} />)}</ol><OpenFile profile={selected} onOpen={() => onOpen(selected.id)} /></> : <div className={styles.empty}><h2>No files in this section.</h2><p>Try another name, field, or type.</p><button type="button" onClick={clearFilters}>Clear filters</button></div>}
        <div className={styles.drawerFront} aria-hidden="true"><div className={styles.nameplate}>spinout watchlist · {selected?.field.toLowerCase() || "research archive"}</div><div className={styles.handle}><span /><span /></div></div>
      </div>
      <div className={styles.cabinetFooter}><p>Select a tab. Follow the evidence.</p><div className={styles.pagination}><button type="button" disabled={currentPage === 0} onClick={() => setPage((value) => value - 1)} aria-label="Previous drawer page">←</button><span>{currentPage + 1} / {pageCount}</span><button type="button" disabled={currentPage >= pageCount - 1} onClick={() => setPage((value) => value + 1)} aria-label="Next drawer page">→</button></div></div>
    </div>
  </section>;
}

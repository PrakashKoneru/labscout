"use client";
import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import styles from "./Landing.module.css";
import InkTitle from "./InkTitle";
import ArchiveIllustration from "./ArchiveIllustration";

type Props = { onStart: (query: string, files: string[]) => void };
function Icon({ name }: { name: "attach" | "connect" | "arrow" | "close" }) {
  const paths = { attach: "m8 12 6-6a3 3 0 0 1 4 4l-8 8a5 5 0 0 1-7-7l9-9M6 14l8-8", connect: "M12 5v14M5 12h14", arrow: "M12 19V5m-6 6 6-6 6 6", close: "m6 6 12 12M6 18 18 6" };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
export default function Landing({ onStart }: Props) {
  const [query, setQuery] = useState("");
  const [files, setFiles] = useState<string[]>([]);
  const [isSourcePickerOpen, setIsSourcePickerOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    function adjustHeight() {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.style.height = "60px";
      textarea.style.height = `${Math.max(60, Math.min(textarea.scrollHeight, 200))}px`;
      textarea.style.overflowY = textarea.scrollHeight > 200 ? "auto" : "hidden";
    }
    adjustHeight();
    window.addEventListener("resize", adjustHeight);
    return () => window.removeEventListener("resize", adjustHeight);
  }, [query]);
  const canSubmit = query.trim().length > 0 || files.length > 0;
  function handleFiles(event: ChangeEvent<HTMLInputElement>) { const names = Array.from(event.target.files ?? [], file => file.name); setFiles(current => [...new Set([...current, ...names])]); if (names.length) setNotice("Files selected for review. Their contents are not uploaded or analyzed."); event.target.value = ""; }
  function handleSubmit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (canSubmit) onStart(query.trim() || "Review my selected material", files); }
  function handleSource(source: "drive" | "pitchbook" | "export") { setIsSourcePickerOpen(false); if (source === "export") { fileInput.current?.click(); return; } setNotice(source === "drive" ? "Google Drive authorization is not available in this preview. Upload a file or open the cabinet." : "PitchBook account connection is not available in this preview. You can select a PitchBook export instead."); }
  return <section className={styles.landing}><div className={styles.hero}><section className={styles.intro} aria-labelledby="landing-title"><div className={styles.eyebrow}><span className={styles.signalDot} />EARLY IDEAS. STRONG SIGNALS.</div><InkTitle /><p className={styles.subheadline}>The next big thing is still in the files.</p><form className={styles.composer} onSubmit={handleSubmit}><label className={styles.srOnly} htmlFor="signal-query">What are you looking for?</label><textarea ref={textareaRef} id="signal-query" value={query} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229) { event.preventDefault(); if (canSubmit) event.currentTarget.form?.requestSubmit(); } }} onChange={event => setQuery(event.target.value)} placeholder="Who’s turning breakthroughs into businesses?" rows={3} maxLength={4000} />{files.length > 0 && <div className={styles.files}>{files.map(name => <span className={styles.file} key={name}><Icon name="attach" /><span>{name}</span><button type="button" aria-label={`Remove ${name}`} onClick={() => setFiles(current => current.filter(file => file !== name))}><Icon name="close" /></button></span>)}</div>}<div className={styles.composerControls}><div className={styles.sourceActions}><button type="button" className={styles.attach} onClick={() => fileInput.current?.click()} aria-label="Select a document or data export"><Icon name="attach" /></button></div><div className={styles.rightActions}><button type="button" className={styles.connect} aria-expanded={isSourcePickerOpen} aria-controls="source-picker" onClick={() => setIsSourcePickerOpen(current => !current)}><Icon name="connect" />Connect source</button><button type="submit" className={styles.submit} disabled={!canSubmit} aria-label="Find signals"><Icon name="arrow" /><span className={styles.srOnly}>Send</span></button></div></div><input ref={fileInput} type="file" multiple hidden onChange={handleFiles} />{isSourcePickerOpen && <div className={styles.sourcePicker} id="source-picker"><div className={styles.pickerTitle}>BRING YOUR OWN CONTEXT</div><button type="button" onClick={() => handleSource("drive")}><span>Google Drive</span><small>Folder / data room · unavailable</small></button><button type="button" onClick={() => handleSource("export")}><span>PitchBook export</span><small>Select a local file · preview</small></button><button type="button" onClick={() => handleSource("pitchbook")}><span>PitchBook account</span><small>Connection unavailable</small></button></div>}</form>{notice && <p className={styles.notice} role="status">{notice}</p>}<div className={styles.scope}><span className={styles.scopeMark}>↳</span>{files.length ? `${files.length} local file${files.length === 1 ? "" : "s"} selected · selected for review` : "A thesis, a shortlist, a document. Start anywhere."}</div><div className={styles.starters} aria-label="Example searches"><span>TRY A THREAD</span><button type="button" onClick={() => setQuery("Find emerging teams in robotics.")}>Robotics<span>↗</span></button><button type="button" onClick={() => setQuery("Find researchers commercializing breakthroughs in energy storage.")}>Energy storage<span>↗</span></button><button type="button" onClick={() => setQuery("Who is moving from research to deployment in biotech?")}>Biotech<span>↗</span></button></div></section><ArchiveIllustration /></div><footer className={styles.footer}><span>LESS NOISE. MORE CONVICTION.</span><p>Research. Builders. Momentum. <em>Connected.</em></p><span>FULL SIGNAL / FIELD NOTES NO. 001</span></footer></section>;
}

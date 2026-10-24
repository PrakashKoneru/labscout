import type { SourceId } from "./sources/types.ts";

export type Look =
  | { type: "phase"; id: string; label: string; index: number; total: number }
  | { type: "source"; id: string; label: string; state: "looking" | "done" };

export type LookSink = (look: Look) => void;

export const SOURCE_LABELS: Record<SourceId, string> = {
  github: "GitHub",
  arxiv: "arXiv",
  semanticscholar: "Semantic Scholar",
  nsf: "NSF awards",
  patentsview: "patents",
  sbir: "SBIR",
  huggingface: "Hugging Face",
  packages: "package registries",
  zenodo: "Zenodo",
  crossref: "Crossref",
  orcid: "ORCID",
  europepmc: "Europe PMC",
  cordis: "CORDIS",
  wikidata: "Wikidata",
  dissertations: "dissertations",
  nih: "NIH RePORTER",
  nycorp: "New York corporations",
  edgar: "SEC filings",
  usaspending: "federal spending",
  clinicaltrials: "ClinicalTrials.gov",
  yc: "Y Combinator",
  bluesky: "Bluesky",
  hackernews: "Hacker News",
};

export function sourceLabel(id: string): string {
  return id in SOURCE_LABELS ? SOURCE_LABELS[id as SourceId] : id;
}

export function searchPhases(flags: { signals: boolean; follow: boolean }): { id: string; label: string }[] {
  return [
    { id: "thesis", label: "Reading the thesis" },
    { id: "papers", label: "Searching papers" },
    { id: "roster", label: "Checking authors and enrollment" },
    ...(flags.signals ? [{ id: "signals", label: "Checking founder-signal sources" }] : []),
    ...(flags.follow ? [{ id: "follow", label: "Following the first pass" }] : []),
    { id: "briefs", label: "Writing briefs" },
    { id: "shortlist", label: "Filing the shortlist" },
  ];
}

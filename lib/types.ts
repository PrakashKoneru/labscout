export type Work = {
  id: string;
  title: string;
  year: number;
  doi: string | null;
  url: string | null;
  venue: string | null;
  citedBy: number;
  position: "first" | "middle" | "last";
  isCorresponding: boolean;
};

export type Education = {
  institution: string;
  degree: string | null;
  startYear: number | null;
  endYear: number | null;
};

export type Candidate = {
  authorId: string;
  name: string;
  orcid: string | null;
  institutions: string[];
  works: Work[];
  worksCount: number | null;
  citedByCount: number | null;
  firstPubYear: number | null;
  recentWorksCount: number | null; // works in the last 2 years (OpenAlex counts_by_year)
  reasons: string[];               // human-readable score breakdown
  mentions: NewsSignal[];          // akta.pro press mentions (top candidates only)
  education: Education[];
  isCurrentStudent: boolean | null;
  score: number;
  brief: string | null;
};

export type NewsSignal = {
  title: string;
  url: string;
  publisher: string | null;
  publishedDate: string | null;
  sentiment: string | null;
  summary: string | null;
  companies: string[];
};

export type SearchResponse = {
  query: string;
  keywords: string;
  totalWorks: number;
  candidates: Candidate[];
  market: NewsSignal[];                                  // akta.pro news signals for the thesis
  roundtable: { path: string; version: string | null; bank: string | null } | null; // saved shortlist
  integrations: { nicrron: boolean; prism: boolean; akta: boolean; roundtable: boolean };
};

// arXiv — research quality (stage 1): recent preprints by the author.
// STUB: returns no signals until implemented.
import type { SourceModule } from "./types.ts";

export const source: SourceModule = {
  id: "arxiv",
  enabled: () => true,
  async enrich() { return []; },
};

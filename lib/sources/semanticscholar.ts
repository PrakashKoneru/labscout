// Semantic Scholar — research momentum (stage 1): citation velocity, influential citations.
// STUB: returns no signals until implemented.
import type { SourceModule } from "./types.ts";

export const source: SourceModule = {
  id: "semanticscholar",
  enabled: () => true,
  async enrich() { return []; },
};

// NSF Awards — spinout intent (stage 4) + repeat grants (stage 6): I-Corps, SBIR/STTR, awards where the person is PI/co-PI.
// STUB: returns no signals until implemented.
import type { SourceModule } from "./types.ts";

export const source: SourceModule = {
  id: "nsf",
  enabled: () => true,
  async enrich() { return []; },
};

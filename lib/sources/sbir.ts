// SBIR.gov — commercialization funding (stage 4): SBIR/STTR awards naming the person or their small business.
// STUB: returns no signals until implemented.
import type { SourceModule } from "./types.ts";

export const source: SourceModule = {
  id: "sbir",
  enabled: () => true,
  async enrich() { return []; },
};

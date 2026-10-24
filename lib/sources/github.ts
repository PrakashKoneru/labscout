// GitHub — builder signal (stage 2): repos, stars, forks, outside adoption.
// STUB: returns no signals until implemented.
import type { SourceModule } from "./types.ts";

export const source: SourceModule = {
  id: "github",
  enabled: () => true,
  async enrich() { return []; },
};

// USPTO PatentsView — IP movement (stage 4): patents where the person is an inventor, assignee university vs company.
// STUB: returns no signals until implemented.
import type { SourceModule } from "./types.ts";

export const source: SourceModule = {
  id: "patentsview",
  enabled: () => true,
  async enrich() { return []; },
};

// Registry of all founder-signal sources. Wiring into the search pipeline lives in lib/search.ts.
import type { SourceModule } from "./types.ts";
import { source as github } from "./github.ts";
import { source as arxiv } from "./arxiv.ts";
import { source as semanticscholar } from "./semanticscholar.ts";
import { source as nsf } from "./nsf.ts";
import { source as patentsview } from "./patentsview.ts";
import { source as sbir } from "./sbir.ts";

export const SOURCES: SourceModule[] = [github, arxiv, semanticscholar, nsf, patentsview, sbir];
export type { Signal, SourceModule, SourceContext, SourceId } from "./types.ts";

import searchHandler from "../../../../api/search.ts";
import { invokeLabscout } from "@/server/labscout-routes";
import { streamSearch } from "@/server/search-stream";

export const maxDuration = 60;

export function POST(request: Request) {
  if (request.headers.get("accept")?.includes("application/x-ndjson")) return streamSearch(request);
  return invokeLabscout(searchHandler, request);
}

import thesisHandler from "../../../../api/thesis.ts";
import { invokeLabscout } from "@/server/labscout-routes";

export const maxDuration = 60;

export function POST(request: Request) {
  return invokeLabscout(thesisHandler, request);
}

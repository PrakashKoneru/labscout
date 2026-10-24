import statusHandler from "../../../../api/status.ts";
import { invokeLabscout } from "@/server/labscout-routes";

export function GET(request: Request) {
  return invokeLabscout(statusHandler, request);
}

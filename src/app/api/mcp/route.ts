import mcpHandler from "../../../../api/mcp.ts";
import { invokeLabscout } from "@/server/labscout-routes";

export const maxDuration = 60;

export function POST(request: Request) {
  return invokeLabscout(mcpHandler, request);
}

export function OPTIONS(request: Request) {
  return invokeLabscout(mcpHandler, request);
}

import type { IncomingMessage, ServerResponse } from "node:http";
import { handleRequest } from "../server/src/index.js";

export default function handler(request: IncomingMessage, response: ServerResponse) {
  return handleRequest(request, response);
}

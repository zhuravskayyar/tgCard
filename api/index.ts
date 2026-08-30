import type { IncomingMessage, ServerResponse } from "node:http";

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  const { handleRequest } = await import("../server/src/index.js");
  return handleRequest(request, response);
}

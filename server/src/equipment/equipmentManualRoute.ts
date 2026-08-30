import type { IncomingMessage, OutgoingHttpHeaders, ServerResponse } from "node:http";
import { sendJson } from "../http/json.js";
import { EquipmentManualUnavailableError, type EquipmentManualService } from "./equipmentManualService.js";

interface EquipmentManualRouteDependencies {
  manual: Pick<EquipmentManualService, "get">;
  responseHeaders?: OutgoingHttpHeaders;
}

export async function handleEquipmentManual(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: EquipmentManualRouteDependencies,
) {
  const headers = dependencies.responseHeaders ?? {};
  if (request.method !== "GET") {
    sendJson(response, 405, { error: { code: "method_not_allowed", message: "Method not allowed" } }, headers);
    return;
  }

  try {
    sendJson(response, 200, await dependencies.manual.get(), headers);
  } catch (error) {
    if (error instanceof EquipmentManualUnavailableError) {
      sendJson(response, 503, { error: { code: "equipment_manual_unavailable", message: error.message } }, headers);
      return;
    }
    console.error("Unexpected equipment manual request failure", error);
    sendJson(response, 500, { error: { code: "internal_error", message: "Unexpected server failure" } }, headers);
  }
}

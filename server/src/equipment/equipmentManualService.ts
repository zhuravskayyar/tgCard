import {
  EQUIPMENT_MANUAL_SOURCE_URL,
  parseEquipmentManualHtml,
  type EquipmentManual,
} from "@cardastika/game-core";

const DEFAULT_CACHE_TTL_MS = 15 * 60 * 1000;

export class EquipmentManualUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EquipmentManualUnavailableError";
  }
}

type EquipmentManualParser = (html: string, sourceUrl?: string) => EquipmentManual;
type EquipmentManualFetcher = (input: string, init?: RequestInit) => Promise<Response>;

export class EquipmentManualService {
  private cached: { expiresAt: number; manual: EquipmentManual } | null = null;

  constructor(
    private readonly fetcher: EquipmentManualFetcher = fetch,
    private readonly parser: EquipmentManualParser = parseEquipmentManualHtml,
    private readonly now: () => number = Date.now,
    private readonly cacheTtlMs = DEFAULT_CACHE_TTL_MS,
  ) {}

  async get(signal?: AbortSignal) {
    if (this.cached && this.cached.expiresAt > this.now()) return this.cached.manual;

    let response: Response;
    try {
      response = await this.fetcher(EQUIPMENT_MANUAL_SOURCE_URL, {
        headers: { Accept: "text/html", "User-Agent": "Cardastika-equipment-manual-parser/1.0" },
        signal,
      });
    } catch (error) {
      throw new EquipmentManualUnavailableError("Equipment manual source is unavailable");
    }

    if (!response.ok) throw new EquipmentManualUnavailableError(`Equipment manual source returned HTTP ${response.status}`);

    try {
      const manual = this.parser(await response.text(), EQUIPMENT_MANUAL_SOURCE_URL);
      this.cached = { expiresAt: this.now() + this.cacheTtlMs, manual };
      return manual;
    } catch (error) {
      throw new EquipmentManualUnavailableError("Equipment manual could not be parsed");
    }
  }

  clearCache() {
    this.cached = null;
  }
}

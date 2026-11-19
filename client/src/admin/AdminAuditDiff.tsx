import type { AdminAuditLogItem } from "@cardastika/shared";
import { auditFieldLabels } from "./adminFormat";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function display(value: unknown) {
  if (value === undefined || value === null) return "—";
  if (typeof value === "number") return value.toLocaleString("uk-UA");
  if (Array.isArray(value)) return `${value.length} шт.`;
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/** Human-readable "field: old → new" view of an audit entry, with raw JSON as a fallback. */
export function AdminAuditDiff({ log }: { log: AdminAuditLogItem }) {
  const before = asRecord(log.before);
  const after = asRecord(log.after);
  const metadata = asRecord(log.metadata);
  const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));
  const extras = Object.entries(metadata).filter(([key]) => !keys.includes(key) && key !== "currency");
  return (
    <div>
      <ul className="admin-diff">
        {keys.map((key) => (
          <li key={key}>
            <span>{auditFieldLabels[key] ?? key}:</span>
            {key in before ? <del>{display(before[key])}</del> : null}
            {key in before && key in after ? "→" : null}
            {key in after ? <ins>{display(after[key])}</ins> : null}
          </li>
        ))}
        {extras.map(([key, value]) => <li key={`meta-${key}`}><span>{auditFieldLabels[key] ?? key}:</span>{display(value)}</li>)}
        {keys.length === 0 && extras.length === 0 ? <li><span>Без деталей</span></li> : null}
      </ul>
      <details className="admin-raw">
        <summary>JSON</summary>
        <pre>{JSON.stringify({ before: log.before, after: log.after, metadata: log.metadata }, null, 2)}</pre>
      </details>
    </div>
  );
}

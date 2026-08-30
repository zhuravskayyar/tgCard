import { Pool } from "pg";

export function createDatabasePool(connectionString: string) {
  return new Pool({
    connectionString,
    connectionTimeoutMillis: 5_000,
  });
}

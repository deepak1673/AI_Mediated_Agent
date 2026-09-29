import { Pool } from "pg";

// Raw connection pool used for querying warehouse/crm/erp/maintenance schemas via
// compiled, parameterized query plans. Prisma is reserved for the `platform` schema
// (registry, catalog, governance, HITL, audit) — this pool never touches that schema
// with anything but read access to the other four.
export const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // A generated or malformed plan must not be able to hog the database.
  statement_timeout: Number(process.env.STATEMENT_TIMEOUT_MS ?? 15000),
});

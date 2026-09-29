// Structured query plan + deterministic compiler. Agents (and, for now, the seed script)
// never produce raw SQL — they produce this JSON shape, which is validated against the
// Data Catalog and compiled into parameterized SQL here. This is the "Node API Runtime"
// from doc §102/§126: the compiler is the one place SQL text is ever assembled.

// Table/column refs must be plain lowercase snake_case (they map directly onto real,
// unquoted Postgres identifiers). Output aliases may be camelCase (they become JSON
// keys) — those are validated separately and always double-quoted in the generated SQL
// so Postgres doesn't silently fold them to lowercase.
const IDENTIFIER_RE = /^[a-z_][a-z0-9_]*$/;
const ALIAS_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

function assertAlias(value: string, kind: string): void {
  if (!ALIAS_RE.test(value)) {
    throw new Error(`Invalid ${kind} identifier in query plan: "${value}"`);
  }
}

export interface SelectField {
  column: string; // "table_alias.column"
  as: string;
  agg?: "sum" | "count" | "avg" | "min" | "max";
}

export interface JoinSpec {
  table: string; // "schema.table"
  alias: string;
  on: { left: string; right: string }; // "alias.column" on both sides
}

export type FilterOp = "eq" | "gte" | "lte" | "in";

export interface FilterSpec {
  column: string; // "alias.column"
  op: FilterOp;
  param: string; // request parameter name this binds to
  required: boolean;
}

export interface QueryPlan {
  table: string; // "schema.table"
  alias: string;
  joins?: JoinSpec[];
  select: SelectField[];
  filters?: FilterSpec[];
  groupBy?: string[]; // "alias.column", must match non-aggregated select fields
  orderBy?: { column: string; direction: "asc" | "desc" }[];
  limit?: number;
}

function assertIdentifier(value: string, kind: string): void {
  const parts = value.split(".");
  if (parts.length > 2 || !parts.every((p) => IDENTIFIER_RE.test(p))) {
    throw new Error(`Invalid ${kind} identifier in query plan: "${value}"`);
  }
}

function assertTable(qualified: string): void {
  const parts = qualified.split(".");
  if (parts.length !== 2 || !parts.every((p) => IDENTIFIER_RE.test(p))) {
    throw new Error(`Invalid table identifier in query plan: "${qualified}"`);
  }
}

export interface CompiledQuery {
  sql: string;
  values: unknown[];
}

/**
 * Compiles a QueryPlan + request params into parameterized SQL.
 * Every identifier (table/column/alias) in the plan is validated against a strict
 * whitelist regex before being interpolated as SQL text — identifiers can never come
 * from the request itself, only from the stored, previously-validated plan. Every
 * user-supplied value goes through pg's `$n` parameter binding, never string interpolation.
 */
export function compileQueryPlan(plan: QueryPlan, params: Record<string, string | undefined>): CompiledQuery {
  assertTable(plan.table);
  assertIdentifier(plan.alias, "alias");

  const values: unknown[] = [];
  const nextParam = () => `$${values.length + 1}`;

  const selectParts = plan.select.map((f) => {
    assertIdentifier(f.column, "select column");
    assertAlias(f.as, "select alias");
    const expr = f.agg ? `${f.agg}(${f.column})` : f.column;
    return `${expr} AS "${f.as}"`;
  });

  let sql = `SELECT ${selectParts.join(", ")} FROM ${plan.table} ${plan.alias}`;

  for (const join of plan.joins ?? []) {
    assertTable(join.table);
    assertIdentifier(join.alias, "join alias");
    assertIdentifier(join.on.left, "join column");
    assertIdentifier(join.on.right, "join column");
    sql += ` JOIN ${join.table} ${join.alias} ON ${join.on.left} = ${join.on.right}`;
  }

  const whereParts: string[] = [];
  for (const filter of plan.filters ?? []) {
    assertIdentifier(filter.column, "filter column");
    // Own properties only: a parameter named e.g. "constructor" must not resolve to an inherited function.
    const raw = Object.hasOwn(params, filter.param) ? params[filter.param] : undefined;
    if (raw === undefined || raw === "") {
      if (filter.required) {
        throw new MissingParameterError(filter.param);
      }
      continue;
    }
    switch (filter.op) {
      case "eq":
        whereParts.push(`${filter.column} = ${nextParam()}`);
        values.push(raw);
        break;
      case "gte":
        whereParts.push(`${filter.column} >= ${nextParam()}`);
        values.push(raw);
        break;
      case "lte":
        whereParts.push(`${filter.column} <= ${nextParam()}`);
        values.push(raw);
        break;
      case "in": {
        const list = raw.split(",").map((v) => v.trim());
        const placeholders = list.map((v) => {
          values.push(v);
          return nextParam();
        });
        whereParts.push(`${filter.column} IN (${placeholders.join(", ")})`);
        break;
      }
    }
  }
  if (whereParts.length > 0) {
    sql += ` WHERE ${whereParts.join(" AND ")}`;
  }

  if (plan.groupBy && plan.groupBy.length > 0) {
    plan.groupBy.forEach((c) => assertIdentifier(c, "group by column"));
    sql += ` GROUP BY ${plan.groupBy.join(", ")}`;
  }

  if (plan.orderBy && plan.orderBy.length > 0) {
    const outputAliases = new Set(plan.select.map((f) => f.as));
    const parts = plan.orderBy.map((o) => {
      const dir = o.direction === "desc" ? "DESC" : "ASC";
      // Ordering by a select output alias (e.g. an aggregate) is allowed; emitted double-quoted.
      if (outputAliases.has(o.column)) {
        assertAlias(o.column, "order by alias");
        return `"${o.column}" ${dir}`;
      }
      assertIdentifier(o.column, "order by column");
      return `${o.column} ${dir}`;
    });
    sql += ` ORDER BY ${parts.join(", ")}`;
  }

  sql += ` LIMIT ${Math.min(plan.limit ?? 500, 2000)}`;

  return { sql, values };
}

/** Every "alias.column" a plan touches (select, joins, filters, group by, non-alias order by). */
export function referencedColumns(plan: QueryPlan): string[] {
  const refs = new Set<string>();
  const outputAliases = new Set(plan.select.map((s) => s.as));
  plan.select.forEach((s) => refs.add(s.column));
  plan.joins?.forEach((j) => [j.on.left, j.on.right].forEach((c) => refs.add(c)));
  plan.filters?.forEach((f) => refs.add(f.column));
  plan.groupBy?.forEach((c) => refs.add(c));
  plan.orderBy?.forEach((o) => {
    if (!outputAliases.has(o.column)) refs.add(o.column);
  });
  return [...refs];
}

export class MissingParameterError extends Error {
  constructor(public param: string) {
    super(`Missing required parameter: ${param}`);
  }
}

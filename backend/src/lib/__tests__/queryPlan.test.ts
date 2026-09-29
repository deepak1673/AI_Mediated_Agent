import { describe, expect, it } from "vitest";
import { compileQueryPlan, MissingParameterError, type QueryPlan } from "../queryPlan.js";

const revenuePlan: QueryPlan = {
  table: "warehouse.fact_orders",
  alias: "fo",
  joins: [
    {
      table: "warehouse.dim_customer",
      alias: "dc",
      on: { left: "fo.customer_key", right: "dc.customer_key" },
    },
  ],
  select: [
    { column: "fo.order_date", as: "month" },
    { column: "fo.amount", as: "revenue", agg: "sum" },
  ],
  filters: [
    { column: "dc.country", op: "eq", param: "country", required: false },
    { column: "dc.customer_type", op: "eq", param: "customerType", required: false },
    { column: "fo.order_date", op: "gte", param: "startDate", required: true },
  ],
  groupBy: ["fo.order_date"],
  orderBy: [{ column: "fo.order_date", direction: "asc" }],
};

describe("compileQueryPlan", () => {
  it("compiles joins, filters, group by, and order by into parameterized SQL", () => {
    const { sql, values } = compileQueryPlan(revenuePlan, {
      country: "India",
      customerType: "Enterprise",
      startDate: "2025-01-01",
    });
    expect(sql).toContain("JOIN warehouse.dim_customer dc ON fo.customer_key = dc.customer_key");
    expect(sql).toContain("WHERE dc.country = $1 AND dc.customer_type = $2 AND fo.order_date >= $3");
    expect(sql).toContain("GROUP BY fo.order_date");
    expect(sql).toContain("ORDER BY fo.order_date ASC");
    expect(values).toEqual(["India", "Enterprise", "2025-01-01"]);
  });

  it("omits optional filters that are not supplied", () => {
    const { sql, values } = compileQueryPlan(revenuePlan, { startDate: "2025-01-01" });
    expect(sql).toContain("WHERE fo.order_date >= $1");
    expect(values).toEqual(["2025-01-01"]);
  });

  it("throws MissingParameterError when a required filter is absent", () => {
    expect(() => compileQueryPlan(revenuePlan, {})).toThrow(MissingParameterError);
  });

  it("rejects identifiers that are not simple table/column names", () => {
    const malicious: QueryPlan = {
      table: "warehouse.fact_orders; DROP TABLE warehouse.fact_orders;--",
      alias: "fo",
      select: [{ column: "fo.amount", as: "revenue" }],
    };
    expect(() => compileQueryPlan(malicious, {})).toThrow(/Invalid table identifier/);
  });

  it("rejects a malicious column name", () => {
    const malicious: QueryPlan = {
      table: "warehouse.fact_orders",
      alias: "fo",
      select: [{ column: "fo.amount) FROM pg_shadow--", as: "revenue" }],
    };
    expect(() => compileQueryPlan(malicious, {})).toThrow(/Invalid select column identifier/);
  });

  it("caps the limit at 2000 regardless of what the plan requests", () => {
    const plan: QueryPlan = {
      table: "warehouse.fact_orders",
      alias: "fo",
      select: [{ column: "fo.amount", as: "revenue" }],
      limit: 999999,
    };
    const { sql } = compileQueryPlan(plan, {});
    expect(sql).toContain("LIMIT 2000");
  });
  it("allows ordering by a select output alias and quotes it", () => {
    const plan: QueryPlan = {
      table: "warehouse.fact_orders",
      alias: "fo",
      select: [
        { column: "fo.status", as: "status" },
        { column: "fo.amount", as: "totalRevenue", agg: "sum" },
      ],
      groupBy: ["fo.status"],
      orderBy: [{ column: "totalRevenue", direction: "desc" }],
    };
    const { sql } = compileQueryPlan(plan, {});
    expect(sql).toContain('ORDER BY "totalRevenue" DESC');
  });

  it("still rejects an order-by that is neither a column ref nor a select alias", () => {
    const plan: QueryPlan = {
      table: "warehouse.fact_orders",
      alias: "fo",
      select: [{ column: "fo.status", as: "status" }],
      orderBy: [{ column: "1; DROP TABLE x", direction: "asc" }],
    };
    expect(() => compileQueryPlan(plan, {})).toThrow(/Invalid order by column/);
  });
});

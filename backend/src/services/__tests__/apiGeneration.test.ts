// Integration tests for the deterministic gate between "an agent proposed a plan" and "it is registered".
// Read-only: uses the seeded Data Catalog and EXPLAINs SQL, and writes nothing. Needs the dev Postgres.
import "dotenv/config";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/prisma.js";
import { pgPool } from "../../lib/pg.js";
import { PlanValidationError, validatePlan, type AgentPlan } from "../apiGeneration.js";

const basePlan = (): AgentPlan => ({
  name: "Revenue by Country",
  description: "Total order amount per customer country",
  slug: "revenue-by-country-test",
  metric: "revenue",
  dimensions: ["country"],
  table: "warehouse.fact_orders",
  table_alias: "fo",
  joins: [{ table: "warehouse.dim_customer", alias: "dc", left: "fo.customer_key", right: "dc.customer_key" }],
  select: [
    { column: "dc.country", alias: "country", agg: "none" },
    { column: "fo.amount", alias: "totalRevenue", agg: "sum" },
  ],
  filters: [{ column: "dc.country", op: "eq", param: "country", required: false }],
  group_by: ["dc.country"],
  order_by: [{ column: "totalRevenue", direction: "desc" }],
  limit: 100,
  parameters: [{ name: "country", type: "string", required: false, description: "Filter by country" }],
});

async function problemsFor(mutate: (p: AgentPlan) => void): Promise<string[]> {
  const plan = basePlan();
  mutate(plan);
  try {
    await validatePlan(plan);
  } catch (e) {
    if (e instanceof PlanValidationError) return e.problems;
    throw e;
  }
  return [];
}

afterAll(async () => {
  await prisma.$disconnect();
  await pgPool.end();
});

describe("validatePlan", () => {
  it("accepts a well-formed plan and derives the classification from the columns used", async () => {
    const v = await validatePlan(basePlan());
    expect(v.classification).toBe("FINANCIAL"); // fo.amount is FINANCIAL; the model does not get to choose
    expect(v.queryPlan.groupBy).toEqual(["dc.country"]);
    expect(v.queryPlan.select[1]).toMatchObject({ as: "totalRevenue", agg: "sum" });
  });

  it("classifies non-sensitive plans as non-financial (only the columns used count)", async () => {
    const v = await validatePlan({
      ...basePlan(),
      joins: [],
      select: [{ column: "fo.quantity", alias: "quantity", agg: "none" }],
      filters: [],
      group_by: [],
      order_by: [],
      parameters: [],
    });
    expect(v.classification).toBe("INTERNAL");
  });

  it("rejects an invented column", async () => {
    const problems = await problemsFor((p) => p.select.push({ column: "dc.supplier_key", alias: "x", agg: "none" }));
    expect(problems.join(" ")).toMatch(/unknown column dc\.supplier_key/);
  });

  it("rejects an unknown table", async () => {
    const problems = await problemsFor((p) => (p.table = "warehouse.dim_ghost"));
    expect(problems.join(" ")).toMatch(/Unknown table warehouse\.dim_ghost/);
  });

  it("rejects source-system tables (only warehouse tables may be queried)", async () => {
    const problems = await problemsFor((p) => {
      p.table = "erp.orders";
      p.joins = [];
      p.select = [{ column: "fo.order_id", alias: "orderId", agg: "none" }];
      p.filters = [];
      p.group_by = [];
      p.order_by = [];
      p.parameters = [];
    });
    expect(problems.join(" ")).toMatch(/not in the warehouse|Only warehouse tables/);
  });

  it("requires plain columns to be grouped when aggregating", async () => {
    const problems = await problemsFor((p) => (p.group_by = []));
    expect(problems.join(" ")).toMatch(/must be in group_by/);
  });

  it("rejects a filter bound to an undeclared parameter", async () => {
    const problems = await problemsFor((p) => (p.parameters = []));
    expect(problems.join(" ")).toMatch(/undeclared parameter country/);
  });

  it("rejects bad slugs and parameter names", async () => {
    expect((await problemsFor((p) => (p.slug = "Bad Slug!"))).join(" ")).toMatch(/Invalid slug/);
    const bad = await problemsFor((p) => {
      p.parameters = [{ name: "1; DROP TABLE x", type: "string", required: false, description: "x" }];
      p.filters = [];
    });
    expect(bad.join(" ")).toMatch(/Invalid parameter name/);
  });

  it("rejects duplicate table aliases", async () => {
    const problems = await problemsFor((p) => (p.joins[0].alias = "fo"));
    expect(problems.join(" ")).toMatch(/Duplicate alias/);
  });

  it("allows ordering by an aggregate output alias", async () => {
    const problems = await problemsFor((p) => (p.order_by = [{ column: "totalRevenue", direction: "desc" }]));
    expect(problems).toEqual([]);
  });

  it("caps the row limit", async () => {
    const v = await validatePlan({ ...basePlan(), limit: 999999 });
    expect(v.queryPlan.limit).toBe(2000);
  });
});

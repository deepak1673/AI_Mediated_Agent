// The approval-scope rules behind the C1 fix. Uses the dev database: it writes a few temporary approval
// rows for a demo user and removes them afterwards.
import "dotenv/config";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { prisma } from "../../lib/prisma.js";
import { pgPool } from "../../lib/pg.js";
import { coveredByDataApproval } from "../apiRuntime.js";
import { PlanValidationError, validatePlan, type AgentPlan } from "../apiGeneration.js";
import type { QueryPlan } from "../../lib/queryPlan.js";

const TAG = "vitest-approval-scope";

// Every test uses its own throwaway users, so results never depend on approvals already in the database
// (for example ones left by an e2e run).
const created: string[] = [];
async function tempUser() {
  const u = await prisma.user.create({
    data: { email: `vitest-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`, name: "Vitest User", team: "Analytics", role: "ANALYST" },
  });
  created.push(u.id);
  return u;
}

const ordersByCountry: QueryPlan = {
  table: "warehouse.fact_orders",
  alias: "fo",
  joins: [{ table: "warehouse.dim_customer", alias: "dc", on: { left: "fo.customer_key", right: "dc.customer_key" } }],
  select: [
    { column: "dc.country", as: "country" },
    { column: "fo.amount", as: "total", agg: "sum" },
  ],
  groupBy: ["dc.country"],
};

// Same plan, but it also reads a PII column that was never part of the approval.
const withEmail: QueryPlan = {
  ...ordersByCountry,
  select: [...ordersByCountry.select, { column: "dc.email", as: "email" }],
  groupBy: ["dc.country", "dc.email"],
};

async function approve(userId: string, assets: { table: string; classification: string; columns: string[] }[]) {
  await prisma.hitlRequest.create({
    data: {
      workflowRunId: TAG,
      hitlType: "HITL_DATA_ACCESS",
      requesterId: userId,
      approverRole: "DWH_ADMIN",
      reason: "test",
      status: "APPROVED",
      decidedAt: new Date(),
      requestedResource: {
        assetKey: `${TAG}-${Math.random()}`,
        path: assets.map((a) => a.table).join(", "),
        classification: "FINANCIAL",
        assets,
      },
    },
  });
}

afterEach(async () => {
  await prisma.hitlRequest.deleteMany({ where: { workflowRunId: TAG } });
});
afterAll(async () => {
  await prisma.hitlRequest.deleteMany({ where: { workflowRunId: TAG } });
  await prisma.user.deleteMany({ where: { id: { in: created } } });
  await prisma.$disconnect();
  await pgPool.end();
});

describe("coveredByDataApproval", () => {
  it("covers an API whose sensitive columns are exactly the approved ones", async () => {
    const user = await tempUser();
    await approve(user.id, [{ table: "warehouse.fact_orders", classification: "FINANCIAL", columns: ["amount", "customer_key"] }]);
    expect(await coveredByDataApproval({ queryPlan: ordersByCountry }, user.id)).toBe(true);
  });

  it("does NOT let an approved FINANCIAL request unlock an API that also reads a PII column (C1)", async () => {
    const user = await tempUser();
    await approve(user.id, [{ table: "warehouse.fact_orders", classification: "FINANCIAL", columns: ["amount", "customer_key"] }]);
    expect(await coveredByDataApproval({ queryPlan: withEmail }, user.id)).toBe(false);
  });

  it("does not treat approval of other columns of the same table as coverage", async () => {
    const user = await tempUser();
    await approve(user.id, [{ table: "warehouse.fact_orders", classification: "FINANCIAL", columns: ["quantity"] }]);
    expect(await coveredByDataApproval({ queryPlan: ordersByCountry }, user.id)).toBe(false);
  });

  it("does not cover a different user, a pending request, or a legacy approval without columns", async () => {
    const a = await tempUser();
    const b = await tempUser();
    await approve(a.id, [{ table: "warehouse.fact_orders", classification: "FINANCIAL", columns: ["amount", "customer_key"] }]);
    expect(await coveredByDataApproval({ queryPlan: ordersByCountry }, b.id)).toBe(false);

    await prisma.hitlRequest.deleteMany({ where: { workflowRunId: TAG } });
    await prisma.hitlRequest.create({
      data: {
        workflowRunId: TAG,
        hitlType: "HITL_DATA_ACCESS",
        requesterId: a.id,
        approverRole: "DWH_ADMIN",
        reason: "t",
        status: "PENDING",
        requestedResource: { assets: [{ table: "warehouse.fact_orders", classification: "FINANCIAL", columns: ["amount", "customer_key"] }] },
      },
    });
    expect(await coveredByDataApproval({ queryPlan: ordersByCountry }, a.id)).toBe(false);

    await prisma.hitlRequest.deleteMany({ where: { workflowRunId: TAG } });
    await approve(a.id, [{ table: "warehouse.fact_orders", classification: "FINANCIAL", columns: [] }]);
    expect(await coveredByDataApproval({ queryPlan: ordersByCountry }, a.id)).toBe(false);
  });

  it("gives no coverage to an API that reads nothing sensitive (nothing to attribute)", async () => {
    const user = await tempUser();
    await approve(user.id, [{ table: "warehouse.fact_orders", classification: "FINANCIAL", columns: ["amount"] }]);
    const harmless: QueryPlan = { table: "warehouse.dim_product", alias: "dp", select: [{ column: "dp.category", as: "category" }] };
    expect(await coveredByDataApproval({ queryPlan: harmless }, user.id)).toBe(false);
  });
});

describe("validatePlan with cleared columns", () => {
  const plan = (): AgentPlan => ({
    name: "n",
    description: "d",
    slug: "cleared-test",
    metric: "m",
    dimensions: [],
    table: "warehouse.fact_orders",
    table_alias: "fo",
    joins: [{ table: "warehouse.dim_customer", alias: "dc", left: "fo.customer_key", right: "dc.customer_key" }],
    select: [
      { column: "dc.country", alias: "country", agg: "none" },
      { column: "fo.amount", alias: "total", agg: "sum" },
    ],
    filters: [],
    group_by: ["dc.country"],
    order_by: [],
    limit: 50,
    parameters: [],
  });
  const cleared = [
    { id: "1", schema_name: "warehouse", table_name: "fact_orders", columns: ["amount", "customer_key"] },
    { id: "2", schema_name: "warehouse", table_name: "dim_customer", columns: ["country", "customer_key"] },
  ];

  it("accepts a plan that stays inside the cleared columns", async () => {
    expect((await validatePlan(plan(), cleared)).classification).toBe("FINANCIAL");
  });

  it("rejects a plan that reaches for an uncleared PII column even though it exists in the catalog", async () => {
    const p = plan();
    p.select.push({ column: "dc.email", alias: "email", agg: "none" });
    p.group_by.push("dc.email");
    const err = await validatePlan(p, cleared).catch((e) => e);
    expect(err).toBeInstanceOf(PlanValidationError);
    expect((err as PlanValidationError).problems.join(" ")).toMatch(/dc\.email was not cleared/);
  });

  it("rejects joins on unrelated columns", async () => {
    const p = plan();
    p.joins[0] = { table: "warehouse.dim_customer", alias: "dc", left: "fo.quantity", right: "dc.customer_key" };
    const err = await validatePlan(p).catch((e) => e);
    expect((err as PlanValidationError).problems.join(" ")).toMatch(/does not join on matching key columns/);
  });
});

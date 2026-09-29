import { describe, expect, it } from "vitest";
import { withLock } from "../keyedMutex.js";
import { perUserRateLimit } from "../rateLimit.js";
import { compileQueryPlan, referencedColumns, type QueryPlan } from "../queryPlan.js";

describe("withLock", () => {
  it("runs work for the same key one at a time, in order", async () => {
    const order: string[] = [];
    const task = (name: string, ms: number) =>
      withLock("k", async () => {
        order.push(`${name}:start`);
        await new Promise((r) => setTimeout(r, ms));
        order.push(`${name}:end`);
      });
    await Promise.all([task("a", 30), task("b", 5), task("c", 1)]);
    expect(order).toEqual(["a:start", "a:end", "b:start", "b:end", "c:start", "c:end"]);
  });

  it("does not block different keys and survives a failing task", async () => {
    await expect(
      withLock("x", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(await withLock("x", async () => "still works")).toBe("still works");
    const t0 = Date.now();
    await Promise.all([
      withLock("p", () => new Promise((r) => setTimeout(r, 40))),
      withLock("q", () => new Promise((r) => setTimeout(r, 40))),
    ]);
    expect(Date.now() - t0).toBeLessThan(75);
  });
});

describe("perUserRateLimit", () => {
  const run = (limiter: ReturnType<typeof perUserRateLimit>, userId: string) => {
    let status = 200;
    let nexted = false;
    const res: any = {
      setHeader() {},
      status(c: number) {
        status = c;
        return this;
      },
      json() {
        return this;
      },
    };
    limiter({ user: { id: userId } } as any, res, () => {
      nexted = true;
    });
    return { status, nexted };
  };

  it("allows up to the limit, then answers 429 per user", () => {
    const limiter = perUserRateLimit(3);
    expect([1, 2, 3].map(() => run(limiter, "u1").nexted)).toEqual([true, true, true]);
    expect(run(limiter, "u1")).toEqual({ status: 429, nexted: false });
    expect(run(limiter, "u2").nexted).toBe(true); // another user is unaffected
  });

  it("recovers after the window", async () => {
    const limiter = perUserRateLimit(1, 30);
    expect(run(limiter, "u").nexted).toBe(true);
    expect(run(limiter, "u").status).toBe(429);
    await new Promise((r) => setTimeout(r, 40));
    expect(run(limiter, "u").nexted).toBe(true);
  });
});

describe("query plan parameter handling", () => {
  const plan: QueryPlan = {
    table: "warehouse.dim_customer",
    alias: "dc",
    select: [{ column: "dc.country", as: "country" }],
    filters: [{ column: "dc.country", op: "eq", param: "toString", required: false }],
  };

  it("ignores inherited object properties as parameter values", () => {
    const { sql, values } = compileQueryPlan(plan, {}); // a plain {} inherits toString / constructor
    expect(values).toEqual([]);
    expect(sql).not.toContain("WHERE");
  });

  it("still binds a real parameter with that name", () => {
    const { sql, values } = compileQueryPlan(plan, { toString: "India" });
    expect(values).toEqual(["India"]);
    expect(sql).toContain("dc.country = $1");
  });

  it("lists every column a plan touches", () => {
    const refs = referencedColumns({
      table: "warehouse.fact_orders",
      alias: "fo",
      joins: [{ table: "warehouse.dim_customer", alias: "dc", on: { left: "fo.customer_key", right: "dc.customer_key" } }],
      select: [
        { column: "dc.country", as: "country" },
        { column: "fo.amount", as: "total", agg: "sum" },
      ],
      filters: [{ column: "dc.segment", op: "eq", param: "segment", required: false }],
      groupBy: ["dc.country"],
      orderBy: [{ column: "total", direction: "desc" }],
    });
    expect(refs.sort()).toEqual(["dc.country", "dc.customer_key", "dc.segment", "fo.amount", "fo.customer_key"]);
  });
});

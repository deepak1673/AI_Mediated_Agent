import "dotenv/config";
import { prisma } from "../lib/prisma.js";
import type { QueryPlan } from "../lib/queryPlan.js";

// Intentionally problematic APIs for the Lifecycle Agent to find (doc §19/§105): one unused, one
// broken (depends on a table that does not exist), one deprecated. Backdated so the time-based
// checks are meaningful.
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

const ordersPlan: QueryPlan = {
  table: "warehouse.fact_orders",
  alias: "fo",
  select: [
    { column: "fo.order_id", as: "orderId" },
    { column: "fo.order_date", as: "orderDate" },
    { column: "fo.amount", as: "amount" },
  ],
  limit: 100,
};

const customerPlan: QueryPlan = {
  table: "warehouse.dim_customer",
  alias: "dc",
  select: [
    { column: "dc.customer_id", as: "customerId" },
    { column: "dc.customer_name", as: "name" },
    { column: "dc.country", as: "country" },
  ],
  limit: 100,
};

const brokenPlan: QueryPlan = {
  table: "warehouse.dim_supplier", // does not exist in the warehouse
  alias: "ds",
  select: [
    { column: "ds.supplier_id", as: "supplierId" },
    { column: "ds.supplier_name", as: "name" },
  ],
  limit: 100,
};

const APIS = [
  {
    name: "Legacy Sales Export",
    description: "Old flat export of order lines, kept for a retired finance report.",
    path: "/api/generated/legacy-sales-export",
    version: "v1",
    status: "ACTIVE",
    metric: "order_lines",
    classification: "FINANCIAL",
    ownerTeam: "Finance",
    queryPlan: ordersPlan,
    usageCount: 0,
    createdAt: daysAgo(95),
    lastUsedAt: null as Date | null,
  },
  {
    name: "Supplier Scorecard",
    description: "Supplier performance summary. Depends on a supplier dimension table.",
    path: "/api/generated/supplier-scorecard",
    version: "v1",
    status: "ACTIVE",
    metric: "supplier_score",
    classification: "INTERNAL",
    ownerTeam: "Operations",
    queryPlan: brokenPlan,
    usageCount: 12,
    createdAt: daysAgo(40),
    lastUsedAt: daysAgo(3),
  },
  {
    name: "Customer Summary v1",
    description: "Deprecated: replaced by the Customers API.",
    path: "/api/generated/customer-summary-v1",
    version: "v1",
    status: "DEPRECATED",
    metric: "customer_count",
    classification: "INTERNAL",
    ownerTeam: "Analytics",
    queryPlan: customerPlan,
    usageCount: 42,
    createdAt: daysAgo(200),
    lastUsedAt: daysAgo(18),
  },
];

async function main() {
  for (const a of APIS) {
    const data = {
      name: a.name, description: a.description, version: a.version, status: a.status, metric: a.metric,
      dimensions: [], filterKeys: [], classification: a.classification, ownerTeam: a.ownerTeam,
      queryPlan: a.queryPlan as object, parameters: [], responseSchema: { type: "array" },
      usageCount: a.usageCount, createdAt: a.createdAt, lastUsedAt: a.lastUsedAt,
    };
    await prisma.apiRegistryEntry.upsert({ where: { path: a.path }, update: data, create: { path: a.path, ...data } });
  }
  console.log(`Seeded ${APIS.length} lifecycle test APIs`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

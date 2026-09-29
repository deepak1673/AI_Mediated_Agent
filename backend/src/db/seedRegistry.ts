import "dotenv/config";
import { prisma } from "../lib/prisma.js";
import type { QueryPlan } from "../lib/queryPlan.js";

interface ApiDef {
  name: string;
  description: string;
  path: string;
  metric: string;
  dimensions: string[];
  filterKeys: string[];
  classification: string;
  ownerTeam: string;
  queryPlan: QueryPlan;
  parameters: { name: string; type: string; required: boolean; description: string }[];
  responseSchema: Record<string, unknown>;
}

// The 7 seeded "existing" APIs (doc §18/§104). Each projects only the columns its
// classification allows — e.g. `customers` deliberately excludes email/phone even
// though the underlying dim_customer table is classified PII (field-level restriction,
// doc §20). Deliberately NOT seeded (become Stage 4 API-generation test cases):
// customer lifetime value, regional profitability, maintenance history, customer preferences.
const APIS: ApiDef[] = [
  {
    name: "Customers",
    description: "List customers with non-PII attributes.",
    path: "/api/generated/customers",
    metric: "customer_count",
    dimensions: ["country", "customer_type", "segment"],
    filterKeys: ["country", "customerType", "segment"],
    classification: "INTERNAL",
    ownerTeam: "Analytics",
    queryPlan: {
      table: "warehouse.dim_customer",
      alias: "dc",
      select: [
        { column: "dc.customer_id", as: "customerId" },
        { column: "dc.customer_name", as: "name" },
        { column: "dc.customer_type", as: "customerType" },
        { column: "dc.country", as: "country" },
        { column: "dc.segment", as: "segment" },
        { column: "dc.signup_date", as: "signupDate" },
      ],
      filters: [
        { column: "dc.country", op: "eq", param: "country", required: false },
        { column: "dc.customer_type", op: "eq", param: "customerType", required: false },
        { column: "dc.segment", op: "eq", param: "segment", required: false },
      ],
      orderBy: [{ column: "dc.customer_name", direction: "asc" }],
      limit: 200,
    },
    parameters: [
      { name: "country", type: "string", required: false, description: "Filter by country" },
      { name: "customerType", type: "string", required: false, description: "Enterprise | SMB | Individual" },
      { name: "segment", type: "string", required: false, description: "Filter by segment" },
    ],
    responseSchema: { type: "array", items: { customerId: "string", name: "string", customerType: "string", country: "string", segment: "string", signupDate: "string" } },
  },
  {
    name: "Orders",
    description: "Order lines with customer and product context.",
    path: "/api/generated/orders",
    metric: "order_count",
    dimensions: ["country", "customer_type", "status"],
    filterKeys: ["country", "customerType", "status", "startDate", "endDate"],
    classification: "FINANCIAL",
    ownerTeam: "Analytics",
    queryPlan: {
      table: "warehouse.fact_orders",
      alias: "fo",
      joins: [
        { table: "warehouse.dim_customer", alias: "dc", on: { left: "fo.customer_key", right: "dc.customer_key" } },
        { table: "warehouse.dim_product", alias: "dp", on: { left: "fo.product_key", right: "dp.product_key" } },
      ],
      select: [
        { column: "fo.order_id", as: "orderId" },
        { column: "dc.customer_name", as: "customerName" },
        { column: "dp.product_name", as: "productName" },
        { column: "fo.order_date", as: "orderDate" },
        { column: "fo.quantity", as: "quantity" },
        { column: "fo.amount", as: "amount" },
        { column: "fo.status", as: "status" },
      ],
      filters: [
        { column: "dc.country", op: "eq", param: "country", required: false },
        { column: "dc.customer_type", op: "eq", param: "customerType", required: false },
        { column: "fo.status", op: "eq", param: "status", required: false },
        { column: "fo.order_date", op: "gte", param: "startDate", required: false },
        { column: "fo.order_date", op: "lte", param: "endDate", required: false },
      ],
      orderBy: [{ column: "fo.order_date", direction: "desc" }],
      limit: 200,
    },
    parameters: [
      { name: "country", type: "string", required: false, description: "Filter by customer country" },
      { name: "customerType", type: "string", required: false, description: "Enterprise | SMB | Individual" },
      { name: "status", type: "string", required: false, description: "Order status" },
      { name: "startDate", type: "date", required: false, description: "Order date >=" },
      { name: "endDate", type: "date", required: false, description: "Order date <=" },
    ],
    responseSchema: { type: "array", items: { orderId: "string", customerName: "string", productName: "string", orderDate: "string", quantity: "number", amount: "number", status: "string" } },
  },
  {
    name: "Revenue",
    description: "Monthly revenue, optionally filtered by country/customer type.",
    path: "/api/generated/revenue",
    metric: "revenue",
    dimensions: ["month", "country", "customer_type"],
    filterKeys: ["country", "customerType", "startDate", "endDate"],
    classification: "FINANCIAL",
    ownerTeam: "Finance",
    queryPlan: {
      table: "warehouse.fact_orders",
      alias: "fo",
      joins: [{ table: "warehouse.dim_customer", alias: "dc", on: { left: "fo.customer_key", right: "dc.customer_key" } }],
      select: [
        { column: "fo.order_date", as: "orderDate" },
        { column: "fo.amount", as: "revenue", agg: "sum" },
      ],
      filters: [
        { column: "dc.country", op: "eq", param: "country", required: false },
        { column: "dc.customer_type", op: "eq", param: "customerType", required: false },
        { column: "fo.order_date", op: "gte", param: "startDate", required: false },
        { column: "fo.order_date", op: "lte", param: "endDate", required: false },
      ],
      groupBy: ["fo.order_date"],
      orderBy: [{ column: "fo.order_date", direction: "asc" }],
      limit: 500,
    },
    parameters: [
      { name: "country", type: "string", required: false, description: "Filter by customer country" },
      { name: "customerType", type: "string", required: false, description: "Enterprise | SMB | Individual" },
      { name: "startDate", type: "date", required: false, description: "Order date >=" },
      { name: "endDate", type: "date", required: false, description: "Order date <=" },
    ],
    responseSchema: { type: "array", items: { orderDate: "string", revenue: "number" } },
  },
  {
    name: "Order Summary",
    description: "Order counts and total amount grouped by status.",
    path: "/api/generated/order-summary",
    metric: "order_summary",
    dimensions: ["status"],
    filterKeys: ["startDate", "endDate"],
    classification: "FINANCIAL",
    ownerTeam: "Analytics",
    queryPlan: {
      table: "warehouse.fact_orders",
      alias: "fo",
      select: [
        { column: "fo.status", as: "status" },
        { column: "fo.order_id", as: "orderCount", agg: "count" },
        { column: "fo.amount", as: "totalAmount", agg: "sum" },
      ],
      filters: [
        { column: "fo.order_date", op: "gte", param: "startDate", required: false },
        { column: "fo.order_date", op: "lte", param: "endDate", required: false },
      ],
      groupBy: ["fo.status"],
      orderBy: [{ column: "fo.status", direction: "asc" }],
    },
    parameters: [
      { name: "startDate", type: "date", required: false, description: "Order date >=" },
      { name: "endDate", type: "date", required: false, description: "Order date <=" },
    ],
    responseSchema: { type: "array", items: { status: "string", orderCount: "number", totalAmount: "number" } },
  },
  {
    name: "Products",
    description: "Product catalog list.",
    path: "/api/generated/products",
    metric: "product_count",
    dimensions: ["category"],
    filterKeys: ["category"],
    classification: "PUBLIC",
    ownerTeam: "Data Platform",
    queryPlan: {
      table: "warehouse.dim_product",
      alias: "dp",
      select: [
        { column: "dp.product_id", as: "productId" },
        { column: "dp.product_name", as: "name" },
        { column: "dp.category", as: "category" },
      ],
      filters: [{ column: "dp.category", op: "eq", param: "category", required: false }],
      orderBy: [{ column: "dp.product_name", direction: "asc" }],
      limit: 200,
    },
    parameters: [{ name: "category", type: "string", required: false, description: "Filter by category" }],
    responseSchema: { type: "array", items: { productId: "string", name: "string", category: "string" } },
  },
  {
    name: "Inventory",
    description: "Latest inventory snapshot per product per warehouse.",
    path: "/api/generated/inventory",
    metric: "inventory_level",
    dimensions: ["warehouse_id", "category"],
    filterKeys: ["warehouseId"],
    classification: "INTERNAL",
    ownerTeam: "Operations",
    queryPlan: {
      table: "warehouse.fact_inventory",
      alias: "fi",
      joins: [{ table: "warehouse.dim_product", alias: "dp", on: { left: "fi.product_key", right: "dp.product_key" } }],
      select: [
        { column: "dp.product_name", as: "productName" },
        { column: "dp.category", as: "category" },
        { column: "fi.warehouse_id", as: "warehouseId" },
        { column: "fi.quantity", as: "quantity" },
      ],
      filters: [{ column: "fi.warehouse_id", op: "eq", param: "warehouseId", required: false }],
      orderBy: [{ column: "dp.product_name", direction: "asc" }],
      limit: 500,
    },
    parameters: [{ name: "warehouseId", type: "string", required: false, description: "Filter by warehouse" }],
    responseSchema: { type: "array", items: { productName: "string", category: "string", warehouseId: "string", quantity: "number" } },
  },
  {
    name: "Payments",
    description: "Payment records with status.",
    path: "/api/generated/payments",
    metric: "payment_count",
    dimensions: ["payment_status"],
    filterKeys: ["status", "startDate", "endDate"],
    classification: "FINANCIAL",
    ownerTeam: "Finance",
    queryPlan: {
      table: "warehouse.fact_payments",
      alias: "fp",
      select: [
        { column: "fp.payment_id", as: "paymentId" },
        { column: "fp.order_id", as: "orderId" },
        { column: "fp.payment_date", as: "paymentDate" },
        { column: "fp.amount", as: "amount" },
        { column: "fp.payment_status", as: "status" },
      ],
      filters: [
        { column: "fp.payment_status", op: "eq", param: "status", required: false },
        { column: "fp.payment_date", op: "gte", param: "startDate", required: false },
        { column: "fp.payment_date", op: "lte", param: "endDate", required: false },
      ],
      orderBy: [{ column: "fp.payment_date", direction: "desc" }],
      limit: 200,
    },
    parameters: [
      { name: "status", type: "string", required: false, description: "Payment status" },
      { name: "startDate", type: "date", required: false, description: "Payment date >=" },
      { name: "endDate", type: "date", required: false, description: "Payment date <=" },
    ],
    responseSchema: { type: "array", items: { paymentId: "string", orderId: "string", paymentDate: "string", amount: "number", status: "string" } },
  },
];

// Deterministic governance policies (doc §20). DWH_ADMIN is the approver role for all
// HITL cases (doc §46 demo user profiles). Every classification present in the catalog
// has a default policy so nothing falls through to the fail-closed HARD_DENY by accident.
const POLICIES: Omit<import("@prisma/client").Prisma.PolicyCreateInput, "id">[] = [
  { name: "Public — allow all", resourceType: "api", resourceMatch: { classification: "PUBLIC" }, action: "read", decision: "ALLOW", reason: "Public data has no access restriction." },
  { name: "Internal — allow all staff", resourceType: "api", resourceMatch: { classification: "INTERNAL" }, action: "read", decision: "ALLOW", reason: "Internal data is available to all authenticated staff." },
  { name: "Financial — requires approval by default", resourceType: "api", resourceMatch: { classification: "FINANCIAL" }, action: "read", decision: "HITL_REQUIRED", hitlType: "HITL_API_ACCESS", reason: "Financial data requires DWH Admin approval unless you're Finance or Data Platform." },
  { name: "Financial — Finance team direct access", resourceType: "api", resourceMatch: { classification: "FINANCIAL" }, team: "Finance", action: "read", decision: "ALLOW", reason: "Finance team has standing access to financial APIs." },
  { name: "Financial — Data Platform direct access", resourceType: "api", resourceMatch: { classification: "FINANCIAL" }, team: "Data Platform", action: "read", decision: "ALLOW", reason: "Data Platform team (including DWH Admin) has standing access to financial APIs." },
  { name: "PII — requires approval by default", resourceType: "api", resourceMatch: { classification: "PII" }, action: "read", decision: "HITL_REQUIRED", hitlType: "HITL_API_ACCESS", reason: "PII access requires DWH Admin approval." },
  { name: "PII — Data Platform direct access", resourceType: "api", resourceMatch: { classification: "PII" }, team: "Data Platform", action: "read", decision: "ALLOW", reason: "Data Platform team has standing access to PII for platform operations." },
  { name: "Confidential — requires approval", resourceType: "api", resourceMatch: { classification: "CONFIDENTIAL" }, action: "read", decision: "HITL_REQUIRED", hitlType: "HITL_DATA_ACCESS", reason: "Confidential data requires DWH Admin approval." },
  { name: "Restricted — hard deny", resourceType: "api", resourceMatch: { classification: "RESTRICTED" }, action: "read", decision: "HARD_DENY", reason: "Restricted data is never directly accessible through the API layer." },
  // Data-asset-level mirrors, used by Data Discovery/API Planning in later stages.
  { name: "Data asset — public", resourceType: "data_asset", resourceMatch: { classification: "PUBLIC" }, action: "read", decision: "ALLOW", reason: "Public data has no access restriction." },
  { name: "Data asset — internal", resourceType: "data_asset", resourceMatch: { classification: "INTERNAL" }, action: "read", decision: "ALLOW", reason: "Internal data is available to all authenticated staff." },
  { name: "Data asset — financial requires approval", resourceType: "data_asset", resourceMatch: { classification: "FINANCIAL" }, action: "read", decision: "HITL_REQUIRED", hitlType: "HITL_DATA_ACCESS", reason: "Financial data requires approval by default." },
  { name: "Data asset — financial Finance team", resourceType: "data_asset", resourceMatch: { classification: "FINANCIAL" }, team: "Finance", action: "read", decision: "ALLOW", reason: "Finance team has standing access." },
  { name: "Data asset — PII requires approval", resourceType: "data_asset", resourceMatch: { classification: "PII" }, action: "read", decision: "HITL_REQUIRED", hitlType: "HITL_DATA_ACCESS", reason: "PII access requires approval." },
  { name: "Data asset — PII Data Platform", resourceType: "data_asset", resourceMatch: { classification: "PII" }, team: "Data Platform", action: "read", decision: "ALLOW", reason: "Data Platform team has standing access." },
  { name: "Data asset — confidential requires approval", resourceType: "data_asset", resourceMatch: { classification: "CONFIDENTIAL" }, action: "read", decision: "HITL_REQUIRED", hitlType: "HITL_DATA_ACCESS", reason: "Confidential data requires approval." },
  { name: "Data asset — restricted hard deny", resourceType: "data_asset", resourceMatch: { classification: "RESTRICTED" }, action: "read", decision: "HARD_DENY", reason: "Restricted data assets are never directly queryable." },
];

async function main() {
  for (const api of APIS) {
    await prisma.apiRegistryEntry.upsert({
      where: { path: api.path },
      update: {
        name: api.name,
        description: api.description,
        metric: api.metric,
        dimensions: api.dimensions,
        filterKeys: api.filterKeys,
        classification: api.classification,
        ownerTeam: api.ownerTeam,
        queryPlan: api.queryPlan as unknown as object,
        parameters: api.parameters,
        responseSchema: api.responseSchema as unknown as object,
      },
      create: {
        name: api.name,
        description: api.description,
        path: api.path,
        metric: api.metric,
        dimensions: api.dimensions,
        filterKeys: api.filterKeys,
        classification: api.classification,
        ownerTeam: api.ownerTeam,
        queryPlan: api.queryPlan as unknown as object,
        parameters: api.parameters,
        responseSchema: api.responseSchema as unknown as object,
      },
    });
  }
  console.log(`Seeded ${APIS.length} API registry entries.`);

  // Policies aren't natural-keyed in the schema, so make this idempotent by clearing first.
  await prisma.policy.deleteMany({});
  await prisma.policy.createMany({ data: POLICIES as any });
  console.log(`Seeded ${POLICIES.length} governance policies.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

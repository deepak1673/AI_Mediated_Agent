import "dotenv/config";
import { prisma } from "../lib/prisma.js";

interface ColumnDef {
  columnName: string;
  dataType: string;
  description?: string;
  classification: string;
  synonyms?: string[];
}

interface AssetDef {
  schemaName: string;
  tableName: string;
  description: string;
  owner: string;
  classification: string;
  inWarehouse: boolean;
  sourceSystem?: string;
  columns: ColumnDef[];
}

// The Data Catalog: what agents reason over instead of raw information_schema (doc §16).
// classification here is asset/column-level metadata for discovery + display; the
// governance decision that's actually enforced lives on the ApiRegistryEntry (field-level,
// based on which columns a given API projects — see seedRegistry.ts).
const ASSETS: AssetDef[] = [
  {
    schemaName: "warehouse",
    tableName: "dim_customer",
    description: "Curated customer dimension.",
    owner: "Data Platform",
    classification: "PII",
    inWarehouse: true,
    sourceSystem: "crm.customers",
    columns: [
      { columnName: "customer_key", dataType: "integer", classification: "INTERNAL" },
      { columnName: "customer_id", dataType: "text", classification: "INTERNAL", synonyms: ["customer number"] },
      { columnName: "customer_name", dataType: "text", classification: "INTERNAL", synonyms: ["name"] },
      { columnName: "customer_type", dataType: "text", classification: "INTERNAL", synonyms: ["enterprise", "smb", "individual"] },
      { columnName: "country", dataType: "text", classification: "INTERNAL", synonyms: ["region", "location"] },
      { columnName: "segment", dataType: "text", classification: "INTERNAL" },
      { columnName: "signup_date", dataType: "date", classification: "INTERNAL" },
      { columnName: "email", dataType: "text", classification: "PII" },
      { columnName: "phone", dataType: "text", classification: "PII" },
    ],
  },
  {
    schemaName: "warehouse",
    tableName: "dim_product",
    description: "Product catalog dimension.",
    owner: "Data Platform",
    classification: "PUBLIC",
    inWarehouse: true,
    columns: [
      { columnName: "product_key", dataType: "integer", classification: "PUBLIC" },
      { columnName: "product_id", dataType: "text", classification: "PUBLIC" },
      { columnName: "product_name", dataType: "text", classification: "PUBLIC" },
      { columnName: "category", dataType: "text", classification: "PUBLIC", synonyms: ["product category"] },
    ],
  },
  {
    schemaName: "warehouse",
    tableName: "fact_orders",
    description: "Order fact table — one row per order line.",
    owner: "Analytics",
    classification: "FINANCIAL",
    inWarehouse: true,
    sourceSystem: "erp.orders",
    columns: [
      { columnName: "order_key", dataType: "integer", classification: "INTERNAL" },
      { columnName: "order_id", dataType: "text", classification: "INTERNAL" },
      { columnName: "customer_key", dataType: "integer", classification: "INTERNAL" },
      { columnName: "product_key", dataType: "integer", classification: "INTERNAL" },
      { columnName: "order_date", dataType: "date", classification: "INTERNAL", synonyms: ["date", "month", "time"] },
      { columnName: "quantity", dataType: "integer", classification: "INTERNAL" },
      { columnName: "amount", dataType: "numeric", classification: "FINANCIAL", synonyms: ["revenue", "order value", "sales"] },
      { columnName: "status", dataType: "text", classification: "INTERNAL" },
    ],
  },
  {
    schemaName: "warehouse",
    tableName: "fact_payments",
    description: "Payment fact table.",
    owner: "Finance",
    classification: "FINANCIAL",
    inWarehouse: true,
    sourceSystem: "erp.payments",
    columns: [
      { columnName: "payment_key", dataType: "integer", classification: "INTERNAL" },
      { columnName: "payment_id", dataType: "text", classification: "INTERNAL" },
      { columnName: "order_id", dataType: "text", classification: "INTERNAL" },
      { columnName: "payment_date", dataType: "date", classification: "INTERNAL" },
      { columnName: "amount", dataType: "numeric", classification: "FINANCIAL" },
      { columnName: "payment_status", dataType: "text", classification: "INTERNAL" },
    ],
  },
  {
    schemaName: "warehouse",
    tableName: "fact_inventory",
    description: "Daily inventory snapshot per product per warehouse.",
    owner: "Operations",
    classification: "INTERNAL",
    inWarehouse: true,
    columns: [
      { columnName: "id", dataType: "integer", classification: "INTERNAL" },
      { columnName: "product_key", dataType: "integer", classification: "INTERNAL" },
      { columnName: "warehouse_id", dataType: "text", classification: "INTERNAL" },
      { columnName: "snapshot_date", dataType: "date", classification: "INTERNAL" },
      { columnName: "quantity", dataType: "integer", classification: "INTERNAL", synonyms: ["stock", "stock level"] },
    ],
  },
  {
    schemaName: "crm",
    tableName: "customers",
    description: "CRM source of truth for customer identity.",
    owner: "CRM Team",
    classification: "PII",
    inWarehouse: false,
    columns: [
      { columnName: "customer_id", dataType: "text", classification: "INTERNAL" },
      { columnName: "name", dataType: "text", classification: "INTERNAL" },
      { columnName: "email", dataType: "text", classification: "PII" },
      { columnName: "phone", dataType: "text", classification: "PII" },
      { columnName: "country", dataType: "text", classification: "INTERNAL" },
      { columnName: "customer_type", dataType: "text", classification: "INTERNAL" },
      { columnName: "segment", dataType: "text", classification: "INTERNAL" },
      { columnName: "signup_date", dataType: "date", classification: "INTERNAL" },
    ],
  },
  {
    schemaName: "crm",
    tableName: "customer_preferences",
    description: "Marketing/contact preferences per customer. Intentionally not in the warehouse.",
    owner: "CRM Team",
    classification: "CONFIDENTIAL",
    inWarehouse: false,
    columns: [
      { columnName: "customer_id", dataType: "text", classification: "INTERNAL" },
      { columnName: "channel", dataType: "text", classification: "CONFIDENTIAL" },
      { columnName: "marketing_opt_in", dataType: "boolean", classification: "CONFIDENTIAL" },
      { columnName: "preferred_contact_time", dataType: "text", classification: "CONFIDENTIAL" },
    ],
  },
  {
    schemaName: "crm",
    tableName: "customer_interactions",
    description: "Support/contact interaction history.",
    owner: "CRM Team",
    classification: "INTERNAL",
    inWarehouse: false,
    columns: [
      { columnName: "customer_id", dataType: "text", classification: "INTERNAL" },
      { columnName: "interaction_type", dataType: "text", classification: "INTERNAL" },
      { columnName: "interaction_date", dataType: "date", classification: "INTERNAL" },
      { columnName: "notes", dataType: "text", classification: "INTERNAL" },
    ],
  },
  {
    schemaName: "erp",
    tableName: "orders",
    description: "ERP source of truth for orders.",
    owner: "ERP Team",
    classification: "FINANCIAL",
    inWarehouse: false,
    columns: [
      { columnName: "order_id", dataType: "text", classification: "INTERNAL" },
      { columnName: "customer_id", dataType: "text", classification: "INTERNAL" },
      { columnName: "product_id", dataType: "text", classification: "INTERNAL" },
      { columnName: "order_date", dataType: "date", classification: "INTERNAL" },
      { columnName: "quantity", dataType: "integer", classification: "INTERNAL" },
      { columnName: "amount", dataType: "numeric", classification: "FINANCIAL" },
      { columnName: "status", dataType: "text", classification: "INTERNAL" },
    ],
  },
  {
    schemaName: "erp",
    tableName: "payments",
    description: "ERP source of truth for payments.",
    owner: "ERP Team",
    classification: "FINANCIAL",
    inWarehouse: false,
    columns: [
      { columnName: "payment_id", dataType: "text", classification: "INTERNAL" },
      { columnName: "order_id", dataType: "text", classification: "INTERNAL" },
      { columnName: "payment_date", dataType: "date", classification: "INTERNAL" },
      { columnName: "amount", dataType: "numeric", classification: "FINANCIAL" },
      { columnName: "payment_status", dataType: "text", classification: "INTERNAL" },
    ],
  },
  {
    schemaName: "erp",
    tableName: "suppliers",
    description: "Supplier master data.",
    owner: "Procurement",
    classification: "INTERNAL",
    inWarehouse: false,
    columns: [
      { columnName: "supplier_id", dataType: "text", classification: "INTERNAL" },
      { columnName: "name", dataType: "text", classification: "INTERNAL" },
      { columnName: "country", dataType: "text", classification: "INTERNAL" },
    ],
  },
  {
    schemaName: "erp",
    tableName: "purchase_orders",
    description: "Purchase orders to suppliers.",
    owner: "Procurement",
    classification: "INTERNAL",
    inWarehouse: false,
    columns: [
      { columnName: "po_id", dataType: "text", classification: "INTERNAL" },
      { columnName: "supplier_id", dataType: "text", classification: "INTERNAL" },
      { columnName: "product_id", dataType: "text", classification: "INTERNAL" },
      { columnName: "quantity", dataType: "integer", classification: "INTERNAL" },
      { columnName: "order_date", dataType: "date", classification: "INTERNAL" },
    ],
  },
  {
    schemaName: "maintenance",
    tableName: "equipment",
    description: "Physical equipment register.",
    owner: "Operations",
    classification: "INTERNAL",
    inWarehouse: false,
    columns: [
      { columnName: "equipment_id", dataType: "text", classification: "INTERNAL" },
      { columnName: "name", dataType: "text", classification: "INTERNAL" },
      { columnName: "location", dataType: "text", classification: "INTERNAL" },
      { columnName: "install_date", dataType: "date", classification: "INTERNAL" },
    ],
  },
  {
    schemaName: "maintenance",
    tableName: "maintenance_events",
    description: "Maintenance/repair event history per equipment. Not yet in the warehouse — demonstrates the ETL/HITL path.",
    owner: "Operations",
    classification: "INTERNAL",
    inWarehouse: false,
    columns: [
      { columnName: "event_id", dataType: "text", classification: "INTERNAL" },
      { columnName: "equipment_id", dataType: "text", classification: "INTERNAL" },
      { columnName: "event_date", dataType: "date", classification: "INTERNAL" },
      { columnName: "event_type", dataType: "text", classification: "INTERNAL", synonyms: ["maintenance history", "repair history"] },
      { columnName: "technician_id", dataType: "text", classification: "INTERNAL" },
      { columnName: "notes", dataType: "text", classification: "INTERNAL" },
    ],
  },
  {
    schemaName: "maintenance",
    tableName: "technician_logs",
    description: "Technician work logs.",
    owner: "Operations",
    classification: "INTERNAL",
    inWarehouse: false,
    columns: [
      { columnName: "log_id", dataType: "text", classification: "INTERNAL" },
      { columnName: "technician_id", dataType: "text", classification: "INTERNAL" },
      { columnName: "log_date", dataType: "date", classification: "INTERNAL" },
      { columnName: "hours", dataType: "numeric", classification: "INTERNAL" },
      { columnName: "notes", dataType: "text", classification: "INTERNAL" },
    ],
  },
];

async function main() {
  for (const asset of ASSETS) {
    const created = await prisma.dataAsset.upsert({
      where: { schemaName_tableName: { schemaName: asset.schemaName, tableName: asset.tableName } },
      update: {
        description: asset.description,
        owner: asset.owner,
        classification: asset.classification,
        inWarehouse: asset.inWarehouse,
        sourceSystem: asset.sourceSystem,
      },
      create: {
        schemaName: asset.schemaName,
        tableName: asset.tableName,
        description: asset.description,
        owner: asset.owner,
        classification: asset.classification,
        inWarehouse: asset.inWarehouse,
        sourceSystem: asset.sourceSystem,
      },
    });

    for (const col of asset.columns) {
      await prisma.dataColumn.upsert({
        where: { assetId_columnName: { assetId: created.id, columnName: col.columnName } },
        update: {
          dataType: col.dataType,
          description: col.description,
          classification: col.classification,
          synonyms: col.synonyms ?? [],
        },
        create: {
          assetId: created.id,
          columnName: col.columnName,
          dataType: col.dataType,
          description: col.description,
          classification: col.classification,
          synonyms: col.synonyms ?? [],
        },
      });
    }
  }
  console.log(`Seeded ${ASSETS.length} catalog assets.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

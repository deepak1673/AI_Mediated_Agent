import "dotenv/config";
import { prisma } from "../lib/prisma.js";

// Known source → warehouse pipelines (doc §11/§101). maintenance.technician_logs is deliberately
// left WITHOUT a pipeline so the "no pipeline exists → stop and notify" path can be demonstrated.
const PIPELINES = [
  { name: "CRM customer preferences → warehouse", sourceSchema: "crm", sourceTable: "customer_preferences", description: "Marketing/contact preferences per customer." },
  { name: "CRM customer interactions → warehouse", sourceSchema: "crm", sourceTable: "customer_interactions", description: "Support/contact interaction history." },
  { name: "ERP suppliers → warehouse", sourceSchema: "erp", sourceTable: "suppliers", description: "Supplier master data." },
  { name: "ERP purchase orders → warehouse", sourceSchema: "erp", sourceTable: "purchase_orders", description: "Purchase orders placed with suppliers." },
  { name: "Maintenance equipment → warehouse", sourceSchema: "maintenance", sourceTable: "equipment", description: "Equipment master data." },
  { name: "Maintenance events → warehouse", sourceSchema: "maintenance", sourceTable: "maintenance_events", description: "Equipment maintenance event history." },
];

async function main() {
  for (const p of PIPELINES) {
    await prisma.etlPipeline.upsert({
      where: { sourceSchema_sourceTable: { sourceSchema: p.sourceSchema, sourceTable: p.sourceTable } },
      update: { name: p.name, description: p.description },
      create: { ...p, targetTable: p.sourceTable },
    });
  }
  console.log(`Seeded ${PIPELINES.length} ETL pipelines`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

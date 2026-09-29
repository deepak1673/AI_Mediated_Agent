import "dotenv/config";
import { execSync } from "node:child_process";
import { prisma } from "../lib/prisma.js";
import { pgPool } from "../lib/pg.js";

// Returns the platform to a clean demo state: removes everything the demo flows create (generated APIs,
// requests, approvals, ETL runs and loaded warehouse tables, reports, audit history) and restores the
// seeded APIs. Users, policies, the data catalog for seeded assets and the seeded warehouse are untouched.
async function main() {
  // Generated APIs are exactly the ones the platform registered itself (audited at registration time).
  const registered = await prisma.auditLog.findMany({ where: { action: "API_REGISTERED" }, select: { metadata: true } });
  const generatedIds = registered.map((r) => (r.metadata as { apiId?: string } | null)?.apiId).filter((x): x is string => !!x);
  const removedApis = await prisma.apiRegistryEntry.deleteMany({ where: { id: { in: generatedIds } } });

  // ETL: drop tables the mock ETL created and their catalog entries, then forget the runs.
  const pipelines = await prisma.etlPipeline.findMany();
  for (const p of pipelines) {
    if (!/^[a-z_][a-z0-9_]*$/.test(p.targetTable)) continue;
    await pgPool.query(`DROP TABLE IF EXISTS warehouse.${p.targetTable}`);
    const asset = await prisma.dataAsset.findUnique({
      where: { schemaName_tableName: { schemaName: "warehouse", tableName: p.targetTable } },
    });
    if (asset && asset.sourceSystem === `${p.sourceSchema}.${p.sourceTable}`) {
      await prisma.dataColumn.deleteMany({ where: { assetId: asset.id } });
      await prisma.dataAsset.delete({ where: { id: asset.id } });
    }
  }
  await prisma.etlRun.deleteMany();
  await prisma.hitlRequest.deleteMany();
  await prisma.workflowRun.deleteMany();
  await prisma.report.deleteMany();
  await prisma.auditLog.deleteMany();

  // Seeded (non-lifecycle-test) APIs: healthy and unused again.
  const lifecyclePaths = ["/api/generated/legacy-sales-export", "/api/generated/supplier-scorecard", "/api/generated/customer-summary-v1"];
  await prisma.apiRegistryEntry.updateMany({
    where: { path: { notIn: lifecyclePaths } },
    data: { status: "ACTIVE", usageCount: 0, lastUsedAt: null },
  });
  execSync("npm run seed:lifecycle", { stdio: "ignore" }); // restores the 3 lifecycle test APIs and their state

  console.log(`Demo reset: removed ${removedApis.count} generated API(s), all requests/approvals/ETL runs/reports/audit history.`);
  await prisma.$disconnect();
  await pgPool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

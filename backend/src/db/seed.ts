import { prisma } from "../lib/prisma.js";

// NovaMart demo identities (doc §46 / §87). Distinct roles/teams so governance and
// HITL scenarios (different users, different access) are demonstrable out of the box.
const DEMO_USERS = [
  { email: "priya.analyst@novamart.demo", name: "Priya Sharma", team: "Analytics", role: "ANALYST" },
  { email: "arjun.finance@novamart.demo", name: "Arjun Mehta", team: "Finance", role: "FINANCE_ANALYST" },
  { email: "dev.kumar@novamart.demo", name: "Dev Kumar", team: "Engineering", role: "DEVELOPER" },
  { email: "lena.dataeng@novamart.demo", name: "Lena Fischer", team: "Data Platform", role: "DATA_ENGINEER" },
  { email: "sam.admin@novamart.demo", name: "Sam Okafor", team: "Data Platform", role: "DWH_ADMIN" },
];

async function main() {
  for (const u of DEMO_USERS) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: u,
      create: u,
    });
  }
  console.log(`Seeded ${DEMO_USERS.length} demo users.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

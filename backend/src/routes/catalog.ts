import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireUser } from "../middleware/requireUser.js";

export const catalogRouter = Router();

catalogRouter.get("/catalog/assets", requireUser, async (req, res) => {
  const schemaName = typeof req.query.schema === "string" ? req.query.schema : undefined;
  const assets = await prisma.dataAsset.findMany({
    where: schemaName ? { schemaName } : undefined,
    orderBy: [{ schemaName: "asc" }, { tableName: "asc" }],
    include: { _count: { select: { columns: true } } },
  });
  res.json({ assets });
});

catalogRouter.get("/catalog/assets/:id", requireUser, async (req, res) => {
  const asset = await prisma.dataAsset.findUnique({
    where: { id: String(req.params.id) },
    include: { columns: { orderBy: { columnName: "asc" } } },
  });
  if (!asset) return res.status(404).json({ error: "NOT_FOUND" });

  const relatedApis = await prisma.apiRegistryEntry.findMany({
    where: {
      OR: [
        { queryPlan: { path: ["table"], equals: `${asset.schemaName}.${asset.tableName}` } },
      ],
    },
    select: { id: true, name: true, path: true },
  });

  res.json({ asset, relatedApis });
});

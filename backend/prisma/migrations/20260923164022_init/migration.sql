-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "team" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceMatch" JSONB NOT NULL,
    "role" TEXT,
    "team" TEXT,
    "action" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "hitlType" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_registry" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'GET',
    "path" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT 'v1',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "metric" TEXT NOT NULL,
    "dimensions" JSONB NOT NULL,
    "filterKeys" JSONB NOT NULL,
    "classification" TEXT NOT NULL,
    "ownerTeam" TEXT NOT NULL,
    "queryPlan" JSONB NOT NULL,
    "parameters" JSONB NOT NULL,
    "responseSchema" JSONB NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_registry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_assets" (
    "id" TEXT NOT NULL,
    "schemaName" TEXT NOT NULL,
    "tableName" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "classification" TEXT NOT NULL,
    "inWarehouse" BOOLEAN NOT NULL DEFAULT true,
    "sourceSystem" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "data_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_columns" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "columnName" TEXT NOT NULL,
    "dataType" TEXT NOT NULL,
    "description" TEXT,
    "classification" TEXT NOT NULL,
    "synonyms" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "data_columns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hitl_requests" (
    "id" TEXT NOT NULL,
    "workflowRunId" TEXT NOT NULL,
    "hitlType" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "approverRole" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "requestedResource" JSONB NOT NULL,
    "requestedScope" JSONB,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "approverId" TEXT,
    "approvalScope" JSONB,
    "rejectionReason" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hitl_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "requestId" TEXT,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "resource" TEXT,
    "decision" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_runs" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "requestText" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "threadId" TEXT,
    "resultSummary" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" TEXT NOT NULL,
    "reportType" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "agent" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "findings" JSONB NOT NULL,
    "severity" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "api_registry_path_key" ON "api_registry"("path");

-- CreateIndex
CREATE UNIQUE INDEX "data_assets_schemaName_tableName_key" ON "data_assets"("schemaName", "tableName");

-- CreateIndex
CREATE UNIQUE INDEX "data_columns_assetId_columnName_key" ON "data_columns"("assetId", "columnName");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_runs_threadId_key" ON "workflow_runs"("threadId");

-- AddForeignKey
ALTER TABLE "data_columns" ADD CONSTRAINT "data_columns_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "data_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

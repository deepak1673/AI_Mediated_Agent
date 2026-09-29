-- CreateTable
CREATE TABLE "etl_pipelines" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "sourceSchema" TEXT NOT NULL,
    "sourceTable" TEXT NOT NULL,
    "targetTable" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "etl_pipelines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "etl_runs" (
    "id" TEXT NOT NULL,
    "pipelineId" TEXT NOT NULL,
    "hitlRequestId" TEXT,
    "requesterId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "events" JSONB NOT NULL DEFAULT '[]',
    "rowsLoaded" INTEGER,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "etl_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "etl_pipelines_sourceSchema_sourceTable_key" ON "etl_pipelines"("sourceSchema", "sourceTable");

-- AddForeignKey
ALTER TABLE "etl_runs" ADD CONSTRAINT "etl_runs_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "etl_pipelines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

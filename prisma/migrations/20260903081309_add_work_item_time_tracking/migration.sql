-- AlterTable
ALTER TABLE "work_items"
  ADD COLUMN "original_estimate_seconds" INTEGER,
  ADD COLUMN "remaining_estimate_seconds" INTEGER,
  ADD COLUMN "time_spent_seconds" INTEGER;

-- CreateTable
CREATE TABLE "work_logs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "work_item_id" UUID NOT NULL,
    "author_name" VARCHAR(255),
    "author_email" VARCHAR(255),
    "time_spent_seconds" INTEGER NOT NULL,
    "started_at" TIMESTAMPTZ NOT NULL,
    "external_system" VARCHAR(20) NOT NULL DEFAULT 'jira',
    "external_id" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "work_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "work_logs_external_system_external_id_key" ON "work_logs"("external_system", "external_id");

-- CreateIndex
CREATE INDEX "work_logs_tenant_id_author_email_started_at_idx" ON "work_logs"("tenant_id", "author_email", "started_at");

-- CreateIndex
CREATE INDEX "work_logs_work_item_id_idx" ON "work_logs"("work_item_id");

-- AddForeignKey
ALTER TABLE "work_logs" ADD CONSTRAINT "work_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_logs" ADD CONSTRAINT "work_logs_work_item_id_fkey" FOREIGN KEY ("work_item_id") REFERENCES "work_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

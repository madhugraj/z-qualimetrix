-- AlterTable
ALTER TABLE "work_items" ADD COLUMN     "external_assignee_id" TEXT,
ADD COLUMN     "external_assignee_name" TEXT;

-- AlterTable
ALTER TABLE "work_logs" ADD COLUMN     "author_account_id" TEXT;

-- CreateIndex
CREATE INDEX "work_items_external_assignee_id_idx" ON "work_items"("external_assignee_id");

-- CreateIndex
CREATE INDEX "work_logs_tenant_id_author_account_id_idx" ON "work_logs"("tenant_id", "author_account_id");

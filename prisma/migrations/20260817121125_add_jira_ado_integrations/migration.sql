-- DropForeignKey
ALTER TABLE "ai_usage_events" DROP CONSTRAINT "ai_usage_events_tenant_id_fkey";

-- DropForeignKey
ALTER TABLE "ai_usage_events" DROP CONSTRAINT "ai_usage_events_user_id_fkey";

-- AlterTable
ALTER TABLE "ai_model_catalog" ADD COLUMN     "tenant_id" UUID;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "jira_project_id" VARCHAR(50);

-- AlterTable
ALTER TABLE "sprints" ADD COLUMN     "external_metadata" JSONB DEFAULT '{}',
ADD COLUMN     "external_system" VARCHAR(20) NOT NULL DEFAULT 'manual',
ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "last_seen_at_source_at" TIMESTAMPTZ;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "password_hash" VARCHAR(60);

-- AlterTable
ALTER TABLE "work_items" ADD COLUMN     "external_metadata" JSONB DEFAULT '{}',
ADD COLUMN     "external_system" VARCHAR(20) NOT NULL DEFAULT 'manual',
ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "last_seen_at_source_at" TIMESTAMPTZ;

-- CreateTable
CREATE TABLE "integrations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "provider" VARCHAR(20) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'connected',
    "encrypted_access_token" TEXT NOT NULL,
    "encrypted_refresh_token" TEXT,
    "token_expires_at" TIMESTAMPTZ,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "external_metadata" JSONB NOT NULL DEFAULT '{}',
    "connected_account_label" VARCHAR(255),
    "sync_frequency_minutes" INTEGER NOT NULL DEFAULT 5,
    "last_synced_at" TIMESTAMPTZ,
    "last_sync_started_at" TIMESTAMPTZ,
    "last_sync_error" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "integrations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "integrations_tenant_id_idx" ON "integrations"("tenant_id");

-- CreateIndex
CREATE INDEX "integrations_is_active_idx" ON "integrations"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "integrations_tenant_id_provider_key" ON "integrations"("tenant_id", "provider");

-- CreateIndex
CREATE INDEX "ai_model_catalog_tenant_id_model_id_idx" ON "ai_model_catalog"("tenant_id", "model_id");

-- CreateIndex
CREATE INDEX "sprints_external_system_idx" ON "sprints"("external_system");

-- CreateIndex
CREATE UNIQUE INDEX "sprints_product_id_external_system_external_id_key" ON "sprints"("product_id", "external_system", "external_id");

-- CreateIndex
CREATE INDEX "users_tenant_id_idx" ON "users"("tenant_id");

-- CreateIndex
CREATE INDEX "work_items_external_system_idx" ON "work_items"("external_system");

-- CreateIndex
CREATE UNIQUE INDEX "work_items_product_id_external_system_external_id_key" ON "work_items"("product_id", "external_system", "external_id");

-- AddForeignKey
ALTER TABLE "ai_usage_events" ADD CONSTRAINT "ai_usage_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage_events" ADD CONSTRAINT "ai_usage_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_model_catalog" ADD CONSTRAINT "ai_model_catalog_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


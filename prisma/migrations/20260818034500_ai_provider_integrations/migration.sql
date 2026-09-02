-- AlterTable
ALTER TABLE "ai_usage_events" ADD COLUMN     "bucket_start" TIMESTAMPTZ,
ADD COLUMN     "group_key" VARCHAR(255),
ADD COLUMN     "provider" VARCHAR(20) NOT NULL DEFAULT 'claude_code';

-- CreateTable
CREATE TABLE "ai_provider_key_mappings" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "provider" VARCHAR(20) NOT NULL,
    "external_key_id" VARCHAR(255) NOT NULL,
    "user_id" UUID NOT NULL,
    "label" VARCHAR(255),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_provider_key_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_provider_key_mappings_tenant_id_idx" ON "ai_provider_key_mappings"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "ai_provider_key_mappings_tenant_id_provider_external_key_id_key" ON "ai_provider_key_mappings"("tenant_id", "provider", "external_key_id");

-- CreateIndex
CREATE INDEX "ai_model_catalog_tenant_id_model_id_idx" ON "ai_model_catalog"("tenant_id", "model_id");

-- CreateIndex
CREATE INDEX "idx_ai_usage_events_provider" ON "ai_usage_events"("provider");

-- AddForeignKey
ALTER TABLE "ai_provider_key_mappings" ADD CONSTRAINT "ai_provider_key_mappings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_provider_key_mappings" ADD CONSTRAINT "ai_provider_key_mappings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Idempotent-resync dedup key for pull-based vendor sync adapters (OpenAI,
-- Vertex). Only constrains rows that have a bucket_start (Claude Code's
-- existing per-request push rows leave it null and are unaffected). Prisma's
-- schema DSL can't express a partial index, so it's hand-written here,
-- following the same pattern as ai_model_catalog's partial unique indexes.
CREATE UNIQUE INDEX "ai_usage_event_bucket_dedup_key" ON "ai_usage_events"("tenant_id", "provider", "model_id", "bucket_start", "group_key") WHERE "bucket_start" IS NOT NULL;


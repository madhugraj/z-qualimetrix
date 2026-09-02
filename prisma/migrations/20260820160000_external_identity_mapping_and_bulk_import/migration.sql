-- CreateTable
CREATE TABLE "external_identity_mappings" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "provider" VARCHAR(30) NOT NULL,
    "external_id_type" VARCHAR(30) NOT NULL,
    "external_id" VARCHAR(255) NOT NULL,
    "user_id" UUID NOT NULL,
    "label" VARCHAR(255),
    "source" VARCHAR(20) NOT NULL DEFAULT 'manual',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "external_identity_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bulk_import_batches" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "provider" VARCHAR(30) NOT NULL,
    "filename" VARCHAR(255) NOT NULL,
    "format" VARCHAR(10) NOT NULL,
    "column_mapping" JSONB NOT NULL,
    "total_rows" INTEGER NOT NULL,
    "imported_rows" INTEGER NOT NULL,
    "skipped_rows" INTEGER NOT NULL,
    "error_summary" JSONB,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bulk_import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "external_identity_mappings_tenant_id_provider_external_id__key" ON "external_identity_mappings"("tenant_id", "provider", "external_id_type", "external_id");

-- CreateIndex
CREATE INDEX "external_identity_mappings_tenant_id_idx" ON "external_identity_mappings"("tenant_id");

-- CreateIndex
CREATE INDEX "bulk_import_batches_tenant_id_idx" ON "bulk_import_batches"("tenant_id");

-- AddForeignKey
ALTER TABLE "external_identity_mappings" ADD CONSTRAINT "external_identity_mappings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_identity_mappings" ADD CONSTRAINT "external_identity_mappings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bulk_import_batches" ADD CONSTRAINT "bulk_import_batches_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bulk_import_batches" ADD CONSTRAINT "bulk_import_batches_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: consolidate the two existing identity-mapping tables into the new
-- generalized one. Straight column rename/merge, not a lossy transform — both
-- old tables are kept in place (not dropped) until their call sites are cut
-- over and verified; dropping them is a deliberate small follow-up migration.
INSERT INTO "external_identity_mappings" ("id", "tenant_id", "provider", "external_id_type", "external_id", "user_id", "label", "source", "created_at")
SELECT "id", "tenant_id", "provider", 'api_key_id', "external_key_id", "user_id", "label", 'manual', "created_at"
FROM "ai_provider_key_mappings"
ON CONFLICT ("tenant_id", "provider", "external_id_type", "external_id") DO NOTHING;

INSERT INTO "external_identity_mappings" ("id", "tenant_id", "provider", "external_id_type", "external_id", "user_id", "label", "source", "created_at")
SELECT "id", "tenant_id", 'github', 'github_login', "github_login", "user_id", NULL, "source", "created_at"
FROM "github_user_mappings"
ON CONFLICT ("tenant_id", "provider", "external_id_type", "external_id") DO NOTHING;

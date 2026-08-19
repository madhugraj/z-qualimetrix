-- The partial-unique-index migration (20260817130007) dropped the plain
-- tenant_id+model_id lookup index along with the old global unique
-- constraint it was superseding, but schema.prisma still declares
-- @@index([tenantId, modelId]) for general (non-uniqueness) lookups
-- alongside the two partial unique indexes. Restoring it here so the
-- migration history matches schema.prisma exactly.
CREATE INDEX "ai_model_catalog_tenant_id_model_id_idx" ON "ai_model_catalog"("tenant_id", "model_id");

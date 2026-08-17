-- AiModelCatalog needs per-tenant price overrides (a tenant_id IS NOT NULL row
-- overrides the global tenant_id IS NULL default for the same model_id).
-- Prisma's automatic diff never emits this: it inherited a plain global
-- UNIQUE(model_id) from the earlier reconciliation migration and, since that
-- constraint isn't declared as @unique/@@unique in schema.prisma at all
-- anymore, its diff tool doesn't propose dropping an index it doesn't
-- recognize as migration-owned. Postgres also treats NULL <> NULL, so the
-- uniqueness we actually want can't be a single composite index — it has to
-- be two partial ones, which Prisma's schema DSL can't express either way.
-- Hand-written, as flagged in schema.prisma's comment above the model.

ALTER TABLE "ai_model_catalog" DROP CONSTRAINT "ai_model_catalog_model_id_key";

-- Superseded by the partial unique index below (same columns, tenant_id IS NOT NULL case).
DROP INDEX "ai_model_catalog_tenant_id_model_id_idx";

CREATE UNIQUE INDEX "ai_model_catalog_tenant_model_key" ON "ai_model_catalog"("tenant_id", "model_id") WHERE "tenant_id" IS NOT NULL;
CREATE UNIQUE INDEX "ai_model_catalog_global_model_key" ON "ai_model_catalog"("model_id") WHERE "tenant_id" IS NULL;

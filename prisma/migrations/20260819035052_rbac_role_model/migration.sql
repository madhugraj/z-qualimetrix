-- AlterTable
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'unassigned';

-- CreateTable
CREATE TABLE "integration_delegations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "grantee_id" UUID NOT NULL,
    "granted_by" UUID NOT NULL,
    "capability" VARCHAR(50) NOT NULL DEFAULT 'manage_product_mapping',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ,

    CONSTRAINT "integration_delegations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "integration_delegations_tenant_id_idx" ON "integration_delegations"("tenant_id");

-- CreateIndex
CREATE INDEX "integration_delegations_product_id_idx" ON "integration_delegations"("product_id");

-- CreateIndex
CREATE INDEX "integration_delegations_grantee_id_idx" ON "integration_delegations"("grantee_id");

-- AddForeignKey
ALTER TABLE "integration_delegations" ADD CONSTRAINT "integration_delegations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_delegations" ADD CONSTRAINT "integration_delegations_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_delegations" ADD CONSTRAINT "integration_delegations_grantee_id_fkey" FOREIGN KEY ("grantee_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_delegations" ADD CONSTRAINT "integration_delegations_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


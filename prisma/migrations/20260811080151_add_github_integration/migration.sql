-- CreateTable
CREATE TABLE "github_integrations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "encrypted_token" TEXT NOT NULL,
    "token_type" VARCHAR(50) NOT NULL,
    "github_username" VARCHAR(255),
    "last_validated" TIMESTAMPTZ,
    "last_used" TIMESTAMPTZ,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "github_integrations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "github_integrations_tenant_id_idx" ON "github_integrations"("tenant_id");

-- CreateIndex
CREATE INDEX "github_integrations_is_active_idx" ON "github_integrations"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "github_integrations_tenant_id_key" ON "github_integrations"("tenant_id");

-- AddForeignKey
ALTER TABLE "github_integrations" ADD CONSTRAINT "github_integrations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "github_integrations" ADD CONSTRAINT "github_integrations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

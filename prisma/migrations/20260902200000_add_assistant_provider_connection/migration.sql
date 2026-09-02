-- CreateTable
CREATE TABLE "assistant_provider_connections" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "provider" VARCHAR(20) NOT NULL,
    "encrypted_api_key" TEXT NOT NULL,
    "model_id" VARCHAR(100),
    "last_validated" TIMESTAMPTZ,
    "last_used" TIMESTAMPTZ,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "assistant_provider_connections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "assistant_provider_connections_is_active_idx" ON "assistant_provider_connections"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "assistant_provider_connections_tenant_id_key" ON "assistant_provider_connections"("tenant_id");

-- AddForeignKey
ALTER TABLE "assistant_provider_connections" ADD CONSTRAINT "assistant_provider_connections_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assistant_provider_connections" ADD CONSTRAINT "assistant_provider_connections_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

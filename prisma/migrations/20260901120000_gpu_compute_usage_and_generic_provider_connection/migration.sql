-- Make AiProviderConnection's Anthropic-specific columns nullable so
-- non-Anthropic vendors (GCP, and later AWS/Azure/GPU clouds) don't have to
-- stuff meaningless placeholders into them just to satisfy NOT NULL.
ALTER TABLE "ai_provider_connections" ALTER COLUMN "acquisition_channel" DROP NOT NULL;
ALTER TABLE "ai_provider_connections" ALTER COLUMN "plan_type" DROP NOT NULL;
ALTER TABLE "ai_provider_connections" ALTER COLUMN "organization_name" DROP NOT NULL;
ALTER TABLE "ai_provider_connections" ALTER COLUMN "collection_mode" DROP NOT NULL;

-- The specific billing account/subscription a connection reads (GCP billing
-- account id, AWS payer account id, Azure subscription id) — a tenant may
-- connect more than one.
ALTER TABLE "ai_provider_connections" ADD COLUMN "external_billing_account_id" VARCHAR(255);

-- CreateTable
CREATE TABLE "gpu_compute_usage_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "provider" VARCHAR(30) NOT NULL,
    "external_account_id" VARCHAR(255) NOT NULL,
    "external_event_id" VARCHAR(255) NOT NULL,
    "date" TIMESTAMPTZ NOT NULL,
    "instance_type" VARCHAR(100),
    "gpu_type" VARCHAR(50),
    "region" VARCHAR(100),
    "squad" VARCHAR(100),
    "gpu_hours" DOUBLE PRECISION,
    "utilization_pct" DOUBLE PRECISION,
    "cost_usd" DOUBLE PRECISION NOT NULL,
    "pricing_model" VARCHAR(30),
    "cost_source" VARCHAR(30) NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "gpu_compute_usage_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "gpu_compute_usage_events_connection_id_external_event_id_key" ON "gpu_compute_usage_events"("connection_id", "external_event_id");

-- CreateIndex
CREATE INDEX "gpu_compute_usage_events_tenant_id_date_idx" ON "gpu_compute_usage_events"("tenant_id", "date");

-- CreateIndex
CREATE INDEX "gpu_compute_usage_events_provider_idx" ON "gpu_compute_usage_events"("provider");

-- AddForeignKey
ALTER TABLE "gpu_compute_usage_events" ADD CONSTRAINT "gpu_compute_usage_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gpu_compute_usage_events" ADD CONSTRAINT "gpu_compute_usage_events_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "ai_provider_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

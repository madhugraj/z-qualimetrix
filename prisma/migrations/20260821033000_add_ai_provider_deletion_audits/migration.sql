-- A non-personal receipt for PM-authorized permanent provider-data deletion.
-- The deleted connection is represented only by a one-way fingerprint so the
-- audit cannot recreate the organization/user data that was erased.

CREATE TABLE "ai_provider_deletion_audits" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "requested_by" UUID,
  "vendor" VARCHAR(50) NOT NULL,
  "product" VARCHAR(50) NOT NULL,
  "connection_fingerprint" VARCHAR(64) NOT NULL,
  "reason" VARCHAR(500) NOT NULL,
  "record_counts" JSONB NOT NULL,
  "status" VARCHAR(30) NOT NULL DEFAULT 'completed',
  "requested_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_provider_deletion_audits_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ai_provider_deletion_audits_tenant_id_completed_at_idx"
  ON "ai_provider_deletion_audits"("tenant_id", "completed_at");
CREATE INDEX "ai_provider_deletion_audits_connection_fingerprint_idx"
  ON "ai_provider_deletion_audits"("connection_fingerprint");

ALTER TABLE "ai_provider_deletion_audits"
  ADD CONSTRAINT "ai_provider_deletion_audits_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_provider_deletion_audits"
  ADD CONSTRAINT "ai_provider_deletion_audits_requested_by_fkey"
  FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

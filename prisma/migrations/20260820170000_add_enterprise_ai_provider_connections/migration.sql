-- Tenant-owned, multi-organization AI provider connections.
-- Provider identities are observations and intentionally do not create login users.

ALTER TABLE "ai_usage_events" DROP CONSTRAINT "ai_usage_events_user_id_fkey";

ALTER TABLE "ai_usage_events"
  ALTER COLUMN "user_id" DROP NOT NULL,
  ADD COLUMN "provider_connection_id" UUID,
  ADD COLUMN "provider_identity_id" UUID,
  ADD COLUMN "source" VARCHAR(50) NOT NULL DEFAULT 'event',
  ADD COLUMN "external_event_id" VARCHAR(255),
  ADD COLUMN "session_id" VARCHAR(255),
  ADD COLUMN "request_count" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "provider_cost_usd" DECIMAL(18,8),
  ADD COLUMN "estimated_cost_usd" DECIMAL(18,8),
  ADD COLUMN "cost_source" VARCHAR(30),
  ADD COLUMN "metadata" JSONB DEFAULT '{}';

CREATE TABLE "ai_provider_connections" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "vendor" VARCHAR(50) NOT NULL,
  "product" VARCHAR(50) NOT NULL DEFAULT 'claude_code',
  "acquisition_channel" VARCHAR(50) NOT NULL,
  "plan_type" VARCHAR(50) NOT NULL,
  "organization_name" VARCHAR(255) NOT NULL,
  "external_account_id" VARCHAR(255) NOT NULL,
  "domain" VARCHAR(255),
  "collection_mode" VARCHAR(50) NOT NULL,
  "auth_type" VARCHAR(50) NOT NULL DEFAULT 'none',
  "encrypted_credential" TEXT,
  "credential_label" VARCHAR(255),
  "telemetry_token_hash" VARCHAR(64),
  "telemetry_token_created_at" TIMESTAMPTZ,
  "status" VARCHAR(40) NOT NULL DEFAULT 'awaiting_configuration',
  "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "capabilities" JSONB NOT NULL DEFAULT '{}',
  "config" JSONB NOT NULL DEFAULT '{}',
  "sync_cursor" JSONB NOT NULL DEFAULT '{}',
  "sync_frequency_minutes" INTEGER NOT NULL DEFAULT 60,
  "last_validated_at" TIMESTAMPTZ,
  "last_telemetry_at" TIMESTAMPTZ,
  "last_synced_at" TIMESTAMPTZ,
  "last_sync_started_at" TIMESTAMPTZ,
  "last_sync_error" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_by" UUID NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "ai_provider_connections_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_provider_identities" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "connection_id" UUID NOT NULL,
  "external_user_id" VARCHAR(255) NOT NULL,
  "email" VARCHAR(255),
  "display_name" VARCHAR(255),
  "user_id" UUID,
  "first_seen_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_seen_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  CONSTRAINT "ai_provider_identities_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_provider_raw_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "connection_id" UUID NOT NULL,
  "identity_id" UUID,
  "source" VARCHAR(50) NOT NULL,
  "external_event_id" VARCHAR(255) NOT NULL,
  "occurred_at" TIMESTAMPTZ NOT NULL,
  "received_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "session_id" VARCHAR(255),
  "schema_version" VARCHAR(20) NOT NULL DEFAULT '1',
  "payload" JSONB NOT NULL,
  "processed_at" TIMESTAMPTZ,
  "processing_error" TEXT,
  CONSTRAINT "ai_provider_raw_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_provider_daily_activities" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "connection_id" UUID NOT NULL,
  "identity_id" UUID NOT NULL,
  "date" DATE NOT NULL,
  "product" VARCHAR(50) NOT NULL DEFAULT 'claude_code',
  "source" VARCHAR(50) NOT NULL,
  "session_count" INTEGER NOT NULL DEFAULT 0,
  "request_count" INTEGER NOT NULL DEFAULT 0,
  "commits" INTEGER NOT NULL DEFAULT 0,
  "pull_requests" INTEGER NOT NULL DEFAULT 0,
  "lines_added" INTEGER NOT NULL DEFAULT 0,
  "lines_removed" INTEGER NOT NULL DEFAULT 0,
  "suggestions_accepted" INTEGER NOT NULL DEFAULT 0,
  "suggestions_rejected" INTEGER NOT NULL DEFAULT 0,
  "tool_metrics" JSONB NOT NULL DEFAULT '{}',
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "ai_provider_daily_activities_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ai_provider_connections_telemetry_token_hash_key" ON "ai_provider_connections"("telemetry_token_hash");
CREATE UNIQUE INDEX "ai_provider_connections_tenant_vendor_channel_account_key" ON "ai_provider_connections"("tenant_id", "vendor", "acquisition_channel", "external_account_id");
CREATE INDEX "ai_provider_connections_tenant_id_vendor_idx" ON "ai_provider_connections"("tenant_id", "vendor");
CREATE INDEX "ai_provider_connections_is_active_status_idx" ON "ai_provider_connections"("is_active", "status");

CREATE UNIQUE INDEX "ai_provider_identities_connection_id_external_user_id_key" ON "ai_provider_identities"("connection_id", "external_user_id");
CREATE INDEX "ai_provider_identities_tenant_id_email_idx" ON "ai_provider_identities"("tenant_id", "email");
CREATE INDEX "ai_provider_identities_user_id_idx" ON "ai_provider_identities"("user_id");

CREATE UNIQUE INDEX "ai_provider_raw_events_connection_id_source_external_event_id_key" ON "ai_provider_raw_events"("connection_id", "source", "external_event_id");
CREATE INDEX "ai_provider_raw_events_tenant_id_occurred_at_idx" ON "ai_provider_raw_events"("tenant_id", "occurred_at");
CREATE INDEX "ai_provider_raw_events_identity_id_idx" ON "ai_provider_raw_events"("identity_id");

CREATE UNIQUE INDEX "ai_provider_daily_activities_connection_id_identity_id_date_product_source_key" ON "ai_provider_daily_activities"("connection_id", "identity_id", "date", "product", "source");
CREATE INDEX "ai_provider_daily_activities_tenant_id_date_idx" ON "ai_provider_daily_activities"("tenant_id", "date");

CREATE INDEX "idx_ai_usage_events_provider_connection_id" ON "ai_usage_events"("provider_connection_id");
CREATE INDEX "idx_ai_usage_events_provider_identity_id" ON "ai_usage_events"("provider_identity_id");
CREATE UNIQUE INDEX "ai_usage_event_external_dedup_key" ON "ai_usage_events"("provider_connection_id", "source", "external_event_id") WHERE "external_event_id" IS NOT NULL;

ALTER TABLE "ai_usage_events" ADD CONSTRAINT "ai_usage_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
ALTER TABLE "ai_provider_connections" ADD CONSTRAINT "ai_provider_connections_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_provider_connections" ADD CONSTRAINT "ai_provider_connections_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ai_provider_identities" ADD CONSTRAINT "ai_provider_identities_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_provider_identities" ADD CONSTRAINT "ai_provider_identities_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "ai_provider_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_provider_identities" ADD CONSTRAINT "ai_provider_identities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ai_provider_raw_events" ADD CONSTRAINT "ai_provider_raw_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_provider_raw_events" ADD CONSTRAINT "ai_provider_raw_events_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "ai_provider_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_provider_raw_events" ADD CONSTRAINT "ai_provider_raw_events_identity_id_fkey" FOREIGN KEY ("identity_id") REFERENCES "ai_provider_identities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ai_provider_daily_activities" ADD CONSTRAINT "ai_provider_daily_activities_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_provider_daily_activities" ADD CONSTRAINT "ai_provider_daily_activities_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "ai_provider_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_provider_daily_activities" ADD CONSTRAINT "ai_provider_daily_activities_identity_id_fkey" FOREIGN KEY ("identity_id") REFERENCES "ai_provider_identities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_usage_events" ADD CONSTRAINT "ai_usage_events_provider_connection_id_fkey" FOREIGN KEY ("provider_connection_id") REFERENCES "ai_provider_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_usage_events" ADD CONSTRAINT "ai_usage_events_provider_identity_id_fkey" FOREIGN KEY ("provider_identity_id") REFERENCES "ai_provider_identities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

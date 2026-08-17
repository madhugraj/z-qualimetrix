-- CreateTable
CREATE TABLE "ai_usage_events" (
    "id" UUID NOT NULL,
    "timestamp" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sprint" VARCHAR(50) NOT NULL,
    "user_id" UUID NOT NULL,
    "model_id" VARCHAR(100) NOT NULL,
    "activity" VARCHAR(50) NOT NULL,
    "tokens_in" INTEGER NOT NULL,
    "tokens_out" INTEGER NOT NULL,
    "cached_in" INTEGER NOT NULL DEFAULT 0,
    "latency_ms" INTEGER NOT NULL,
    "accepted" BOOLEAN NOT NULL DEFAULT false,
    "reworked" BOOLEAN NOT NULL DEFAULT false,
    "tenant_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_model_catalog" (
    "id" UUID NOT NULL,
    "model_id" VARCHAR(100) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "vendor" VARCHAR(100) NOT NULL,
    "purpose" TEXT NOT NULL,
    "price_in" DECIMAL(10,4) NOT NULL,
    "price_out" DECIMAL(10,4) NOT NULL,
    "cache_discount" DECIMAL(3,2) NOT NULL DEFAULT 0.9,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_model_catalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_usage_analytics" (
    "id" UUID NOT NULL,
    "visibility" VARCHAR(20) NOT NULL,
    "user_id" UUID NOT NULL,
    "sprints" INTEGER NOT NULL DEFAULT 7,
    "generated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totals" JSONB NOT NULL DEFAULT '{}',
    "kpis" JSONB NOT NULL DEFAULT '[]',
    "models" JSONB NOT NULL DEFAULT '[]',
    "spendTrend" JSONB NOT NULL DEFAULT '[]',
    "tokenTrend" JSONB NOT NULL DEFAULT '[]',
    "activityMix" JSONB NOT NULL DEFAULT '[]',
    "people" JSONB NOT NULL DEFAULT '[]',
    "benchmarks" JSONB NOT NULL DEFAULT '{}',
    "insights" JSONB NOT NULL DEFAULT '[]',
    "can_see_cost" BOOLEAN NOT NULL DEFAULT true,
    "can_see_people" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ai_usage_analytics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_usage_events_timestamp_idx" ON "ai_usage_events"("timestamp");

-- CreateIndex
CREATE INDEX "ai_usage_events_user_id_idx" ON "ai_usage_events"("user_id");

-- CreateIndex
CREATE INDEX "ai_usage_events_model_id_idx" ON "ai_usage_events"("model_id");

-- CreateIndex
CREATE INDEX "ai_usage_events_sprint_idx" ON "ai_usage_events"("sprint");

-- CreateIndex
CREATE INDEX "ai_usage_events_tenant_id_idx" ON "ai_usage_events"("tenant_id");

-- CreateIndex
CREATE INDEX "ai_usage_events_activity_idx" ON "ai_usage_events"("activity");

-- CreateIndex
CREATE UNIQUE INDEX "ai_model_catalog_model_id_key" ON "ai_model_catalog"("model_id");

-- CreateIndex
CREATE INDEX "ai_model_catalog_model_id_idx" ON "ai_model_catalog"("model_id");

-- CreateIndex
CREATE INDEX "ai_model_catalog_is_active_idx" ON "ai_model_catalog"("is_active");

-- CreateIndex
CREATE INDEX "ai_usage_analytics_user_id_idx" ON "ai_usage_analytics"("user_id");

-- CreateIndex
CREATE INDEX "ai_usage_analytics_visibility_idx" ON "ai_usage_analytics"("visibility");

-- CreateIndex
CREATE INDEX "ai_usage_analytics_generated_at_idx" ON "ai_usage_analytics"("generated_at");

-- CreateIndex
CREATE UNIQUE INDEX "product_repositories_product_id_github_repo_key" ON "product_repositories"("product_id", "github_repo");

-- AddForeignKey
ALTER TABLE "ai_usage_events" ADD CONSTRAINT "ai_usage_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage_events" ADD CONSTRAINT "ai_usage_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

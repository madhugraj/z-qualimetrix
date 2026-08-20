-- DropForeignKey
ALTER TABLE "public"."ai_usage_events" DROP CONSTRAINT "ai_usage_events_tenant_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."ai_usage_events" DROP CONSTRAINT "ai_usage_events_user_id_fkey";

-- AlterTable
ALTER TABLE "public"."ai_model_catalog" ALTER COLUMN "id" SET DEFAULT gen_random_uuid(),
ALTER COLUMN "purpose" DROP NOT NULL,
ALTER COLUMN "cache_discount" DROP NOT NULL,
ALTER COLUMN "is_active" DROP NOT NULL,
ALTER COLUMN "updated_at" DROP NOT NULL,
ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "created_at" DROP NOT NULL;

-- AlterTable
ALTER TABLE "public"."ai_usage_analytics" DROP COLUMN "activityMix",
DROP COLUMN "spendTrend",
DROP COLUMN "tokenTrend",
ADD COLUMN     "activity_mix" JSONB DEFAULT '[]',
ADD COLUMN     "spend_trend" JSONB DEFAULT '[]',
ADD COLUMN     "token_trend" JSONB DEFAULT '[]',
ALTER COLUMN "id" SET DEFAULT gen_random_uuid(),
ALTER COLUMN "sprints" DROP NOT NULL,
ALTER COLUMN "generated_at" DROP NOT NULL,
ALTER COLUMN "totals" DROP NOT NULL,
ALTER COLUMN "kpis" DROP NOT NULL,
ALTER COLUMN "models" DROP NOT NULL,
ALTER COLUMN "people" DROP NOT NULL,
ALTER COLUMN "benchmarks" DROP NOT NULL,
ALTER COLUMN "insights" DROP NOT NULL,
ALTER COLUMN "can_see_cost" DROP NOT NULL,
ALTER COLUMN "can_see_people" DROP NOT NULL;

-- AlterTable
ALTER TABLE "public"."ai_usage_events" ALTER COLUMN "id" SET DEFAULT gen_random_uuid(),
ALTER COLUMN "timestamp" DROP NOT NULL,
ALTER COLUMN "sprint" DROP NOT NULL,
ALTER COLUMN "activity" DROP NOT NULL,
ALTER COLUMN "cached_in" DROP NOT NULL,
ALTER COLUMN "latency_ms" DROP NOT NULL,
ALTER COLUMN "accepted" DROP NOT NULL,
ALTER COLUMN "reworked" DROP NOT NULL,
ALTER COLUMN "created_at" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "public"."ai_usage_events" ADD CONSTRAINT "ai_usage_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "public"."ai_usage_events" ADD CONSTRAINT "ai_usage_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- RenameIndex
ALTER INDEX "public"."ai_model_catalog_is_active_idx" RENAME TO "idx_ai_model_catalog_is_active";

-- RenameIndex
ALTER INDEX "public"."ai_model_catalog_model_id_idx" RENAME TO "idx_ai_model_catalog_model_id";

-- RenameIndex
ALTER INDEX "public"."ai_usage_analytics_generated_at_idx" RENAME TO "idx_ai_usage_analytics_generated_at";

-- RenameIndex
ALTER INDEX "public"."ai_usage_analytics_user_id_idx" RENAME TO "idx_ai_usage_analytics_user_id";

-- RenameIndex
ALTER INDEX "public"."ai_usage_analytics_visibility_idx" RENAME TO "idx_ai_usage_analytics_visibility";

-- RenameIndex
ALTER INDEX "public"."ai_usage_events_activity_idx" RENAME TO "idx_ai_usage_events_activity";

-- RenameIndex
ALTER INDEX "public"."ai_usage_events_model_id_idx" RENAME TO "idx_ai_usage_events_model_id";

-- RenameIndex
ALTER INDEX "public"."ai_usage_events_sprint_idx" RENAME TO "idx_ai_usage_events_sprint";

-- RenameIndex
ALTER INDEX "public"."ai_usage_events_tenant_id_idx" RENAME TO "idx_ai_usage_events_tenant_id";

-- RenameIndex
ALTER INDEX "public"."ai_usage_events_timestamp_idx" RENAME TO "idx_ai_usage_events_timestamp";

-- RenameIndex
ALTER INDEX "public"."ai_usage_events_user_id_idx" RENAME TO "idx_ai_usage_events_user_id";


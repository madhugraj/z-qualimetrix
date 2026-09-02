-- AlterTable
ALTER TABLE "ai_model_catalog" ADD COLUMN     "billing_model" VARCHAR(20) NOT NULL DEFAULT 'per_token',
ADD COLUMN     "billing_params" JSONB NOT NULL DEFAULT '{}';


-- AlterTable
ALTER TABLE "users"
  ADD COLUMN "squad" VARCHAR(100),
  ADD COLUMN "ai_ingest_token_hash" VARCHAR(64),
  ADD COLUMN "ai_ingest_token_created_at" TIMESTAMPTZ;

-- CreateIndex
CREATE UNIQUE INDEX "users_ai_ingest_token_hash_key" ON "users"("ai_ingest_token_hash");

-- Backfill: preserve the two hardcoded demo members' existing squads
UPDATE "users" SET "squad" = 'Squad Nova' WHERE "id" = '1f9c1029-80ed-48ef-8892-c9aa06092640';
UPDATE "users" SET "squad" = 'Squad Kite' WHERE "id" = '275905eb-e6e3-4115-9fb9-606b1d59101c';

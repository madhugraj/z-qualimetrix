-- AlterTable
ALTER TABLE "work_items"
  ADD COLUMN "labels" TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN "external_status_name" VARCHAR(100),
  ADD COLUMN "status_changed_at" TIMESTAMPTZ,
  ADD COLUMN "reopen_count" INTEGER NOT NULL DEFAULT 0;

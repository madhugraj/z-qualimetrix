-- AlterTable
ALTER TABLE "work_items"
  ADD COLUMN "embedding" DOUBLE PRECISION[] NOT NULL DEFAULT '{}';

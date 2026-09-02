-- CreateTable
CREATE TABLE "work_item_links" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "source_item_id" UUID NOT NULL,
    "target_item_id" UUID NOT NULL,
    "link_type" VARCHAR(50) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "work_item_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "work_item_links_source_item_id_target_item_id_link_type_key" ON "work_item_links"("source_item_id", "target_item_id", "link_type");

-- CreateIndex
CREATE INDEX "work_item_links_tenant_id_idx" ON "work_item_links"("tenant_id");

-- CreateIndex
CREATE INDEX "work_item_links_source_item_id_idx" ON "work_item_links"("source_item_id");

-- CreateIndex
CREATE INDEX "work_item_links_target_item_id_idx" ON "work_item_links"("target_item_id");

-- AddForeignKey
ALTER TABLE "work_item_links" ADD CONSTRAINT "work_item_links_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_item_links" ADD CONSTRAINT "work_item_links_source_item_id_fkey" FOREIGN KEY ("source_item_id") REFERENCES "work_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_item_links" ADD CONSTRAINT "work_item_links_target_item_id_fkey" FOREIGN KEY ("target_item_id") REFERENCES "work_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

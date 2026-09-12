-- CreateTable
CREATE TABLE "confluence_spaces" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "external_system" VARCHAR(20) NOT NULL DEFAULT 'confluence',
    "external_id" VARCHAR(100) NOT NULL,
    "key" VARCHAR(100) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "space_type" VARCHAR(50),
    "is_selected" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_seen_at_source_at" TIMESTAMPTZ,
    "external_metadata" JSONB DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "confluence_spaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "confluence_pages" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "space_id" UUID NOT NULL,
    "external_system" VARCHAR(20) NOT NULL DEFAULT 'confluence',
    "external_id" VARCHAR(100) NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "body_text" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "web_url" VARCHAR(1000),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_seen_at_source_at" TIMESTAMPTZ,
    "external_metadata" JSONB DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "confluence_pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "confluence_page_chunks" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "page_id" UUID NOT NULL,
    "chunk_index" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "embedding" DOUBLE PRECISION[] DEFAULT ARRAY[]::DOUBLE PRECISION[],
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "confluence_page_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_item_document_links" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "work_item_id" UUID NOT NULL,
    "page_id" UUID NOT NULL,
    "link_type" VARCHAR(50) NOT NULL DEFAULT 'related',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_item_document_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "confluence_spaces_tenant_id_idx" ON "confluence_spaces"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "confluence_spaces_tenant_id_external_system_external_id_key" ON "confluence_spaces"("tenant_id", "external_system", "external_id");

-- CreateIndex
CREATE INDEX "confluence_pages_tenant_id_idx" ON "confluence_pages"("tenant_id");

-- CreateIndex
CREATE INDEX "confluence_pages_space_id_idx" ON "confluence_pages"("space_id");

-- CreateIndex
CREATE UNIQUE INDEX "confluence_pages_space_id_external_system_external_id_key" ON "confluence_pages"("space_id", "external_system", "external_id");

-- CreateIndex
CREATE INDEX "confluence_page_chunks_tenant_id_idx" ON "confluence_page_chunks"("tenant_id");

-- CreateIndex
CREATE INDEX "confluence_page_chunks_page_id_idx" ON "confluence_page_chunks"("page_id");

-- CreateIndex
CREATE UNIQUE INDEX "confluence_page_chunks_page_id_chunk_index_key" ON "confluence_page_chunks"("page_id", "chunk_index");

-- CreateIndex
CREATE INDEX "work_item_document_links_tenant_id_idx" ON "work_item_document_links"("tenant_id");

-- CreateIndex
CREATE INDEX "work_item_document_links_work_item_id_idx" ON "work_item_document_links"("work_item_id");

-- CreateIndex
CREATE INDEX "work_item_document_links_page_id_idx" ON "work_item_document_links"("page_id");

-- CreateIndex
CREATE UNIQUE INDEX "work_item_document_links_work_item_id_page_id_key" ON "work_item_document_links"("work_item_id", "page_id");

-- AddForeignKey
ALTER TABLE "confluence_spaces" ADD CONSTRAINT "confluence_spaces_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "confluence_pages" ADD CONSTRAINT "confluence_pages_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "confluence_pages" ADD CONSTRAINT "confluence_pages_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "confluence_spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "confluence_page_chunks" ADD CONSTRAINT "confluence_page_chunks_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "confluence_page_chunks" ADD CONSTRAINT "confluence_page_chunks_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "confluence_pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_item_document_links" ADD CONSTRAINT "work_item_document_links_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_item_document_links" ADD CONSTRAINT "work_item_document_links_work_item_id_fkey" FOREIGN KEY ("work_item_id") REFERENCES "work_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_item_document_links" ADD CONSTRAINT "work_item_document_links_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "confluence_pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_item_document_links" ADD CONSTRAINT "work_item_document_links_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

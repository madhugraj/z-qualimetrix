-- CreateTable
CREATE TABLE "work_item_activities" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "work_item_id" UUID NOT NULL,
    "user_id" UUID,
    "event_type" VARCHAR(30) NOT NULL,
    "from_status" VARCHAR(100),
    "to_status" VARCHAR(100),
    "occurred_at" TIMESTAMPTZ NOT NULL,
    "source" VARCHAR(20) NOT NULL,
    "external_id" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_item_activities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "work_item_activities_tenant_id_user_id_occurred_at_idx" ON "work_item_activities"("tenant_id", "user_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "work_item_activities_work_item_id_external_id_key" ON "work_item_activities"("work_item_id", "external_id");

-- AddForeignKey
ALTER TABLE "work_item_activities" ADD CONSTRAINT "work_item_activities_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_item_activities" ADD CONSTRAINT "work_item_activities_work_item_id_fkey" FOREIGN KEY ("work_item_id") REFERENCES "work_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_item_activities" ADD CONSTRAINT "work_item_activities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

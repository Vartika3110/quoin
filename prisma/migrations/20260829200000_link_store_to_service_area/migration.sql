-- AlterTable
ALTER TABLE "stores" ADD COLUMN     "serviceAreaId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "stores_serviceAreaId_key" ON "stores"("serviceAreaId");

-- AddForeignKey
ALTER TABLE "stores" ADD CONSTRAINT "stores_serviceAreaId_fkey" FOREIGN KEY ("serviceAreaId") REFERENCES "service_areas"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- CreateTable
CREATE TABLE "service_areas" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "city" TEXT NOT NULL DEFAULT 'New Delhi',
    "state" TEXT NOT NULL DEFAULT 'Delhi',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_areas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_pincodes" (
    "id" TEXT NOT NULL,
    "pincode" TEXT NOT NULL,
    "areaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_pincodes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "service_areas_name_key" ON "service_areas"("name");

-- CreateIndex
CREATE UNIQUE INDEX "service_areas_slug_key" ON "service_areas"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "service_pincodes_pincode_key" ON "service_pincodes"("pincode");

-- CreateIndex
CREATE INDEX "service_pincodes_areaId_idx" ON "service_pincodes"("areaId");

-- AddForeignKey
ALTER TABLE "service_pincodes" ADD CONSTRAINT "service_pincodes_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "service_areas"("id") ON DELETE CASCADE ON UPDATE CASCADE;


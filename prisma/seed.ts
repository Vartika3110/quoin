import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

/**
 * Dark stores for local development.
 *
 * Coordinates are real so that serviceability behaves realistically: the
 * Vasant Vihar address in the storefront header sits inside the South
 * Delhi store radius, and somewhere like Gurugram falls outside it.
 */
const STORES = [
  {
    code: "DEL-VV",
    name: "Quoin South Delhi",
    lat: 28.5601,
    lng: 77.1591,
    serviceRadiusKm: 6,
    baseEtaMinutes: 18,
  },
  {
    code: "DEL-OKH",
    name: "Quoin Okhla",
    lat: 28.5355,
    lng: 77.2731,
    serviceRadiusKm: 7,
    baseEtaMinutes: 22,
  },
  {
    code: "GGN-SEC44",
    name: "Quoin Gurugram",
    lat: 28.4463,
    lng: 77.0724,
    serviceRadiusKm: 8,
    baseEtaMinutes: 25,
  },
];

/**
 * Serviceable localities.
 *
 * The area a customer types a pincode to find, not the delivery promise —
 * `Store.serviceRadiusKm` still decides that, and an address inside
 * 110063 can sit outside every store radius.
 *
 * Only each locality's primary pincode is listed. Extension codes
 * (Paschim Vihar Extn., the Pitampura side of 110088) are deliberately
 * absent: seeding a code Quoin cannot actually reach tells a customer
 * their order will arrive when it will not. Add them once operations
 * confirms coverage.
 */
const SERVICE_AREAS = [
  { name: "Janakpuri", slug: "janakpuri", pincodes: ["110058"] },
  { name: "Paschim Vihar", slug: "paschim-vihar", pincodes: ["110063"] },
  { name: "Pitampura", slug: "pitampura", pincodes: ["110034"] },
  { name: "Rajendra Nagar", slug: "rajendra-nagar", pincodes: ["110060"] },
];

async function main() {
  for (const store of STORES) {
    await db.store.upsert({
      where: { code: store.code },
      update: store,
      create: store,
    });
  }
  console.info(`Seeded ${STORES.length} stores.`);

  for (const { pincodes, ...area } of SERVICE_AREAS) {
    const row = await db.serviceArea.upsert({
      where: { slug: area.slug },
      update: { name: area.name, isActive: true },
      create: area,
    });

    for (const pincode of pincodes) {
      /* Keyed on the pincode, so moving one between areas is an update
         rather than a unique-constraint failure on the next seed. */
      await db.servicePincode.upsert({
        where: { pincode },
        update: { areaId: row.id },
        create: { pincode, areaId: row.id },
      });
    }
  }
  console.info(`Seeded ${SERVICE_AREAS.length} service areas.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());

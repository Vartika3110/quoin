/* Must be first: populates process.env before Prisma is constructed. */
import "../src/lib/load-env-file";

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

/**
 * Dark stores for local development.
 *
 * Coordinates are real so that serviceability behaves realistically: the
 * Vasant Vihar address in the storefront header sits inside the South
 * Delhi store radius, and somewhere like Gurugram falls outside it.
 */
/**
 * Dark stores, one per serviceable locality.
 *
 * Coordinates are the centre of each locality, not a shop doorway — good
 * enough for the radius check to behave sensibly and wrong by a few
 * hundred metres. Replace them with the real addresses before the
 * "1.1 km away" line is shown to a paying customer.
 */
const STORES = [
  {
    code: "DEL-JNK",
    name: "Quoin Janakpuri",
    area: "janakpuri",
    lat: 28.6219,
    lng: 77.0878,
    serviceRadiusKm: 5,
    baseEtaMinutes: 18,
  },
  {
    code: "DEL-PVR",
    name: "Quoin Paschim Vihar",
    area: "paschim-vihar",
    lat: 28.6692,
    lng: 77.1025,
    serviceRadiusKm: 5,
    baseEtaMinutes: 18,
  },
  {
    code: "DEL-PTP",
    name: "Quoin Pitampura",
    area: "pitampura",
    lat: 28.6942,
    lng: 77.1314,
    serviceRadiusKm: 5,
    baseEtaMinutes: 20,
  },
  {
    code: "DEL-RJN",
    name: "Quoin Rajendra Nagar",
    area: "rajendra-nagar",
    lat: 28.6438,
    lng: 77.1795,
    serviceRadiusKm: 5,
    baseEtaMinutes: 20,
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
  /* The earlier placeholders — Vasant Vihar, Okhla, Gurugram — were
     invented before the real localities were known, and the header was
     promising eighteen minutes to an address Quoin does not serve.
     Deactivated rather than deleted: serviceability only considers active
     stores, and a wrong row is easier to inspect than a missing one. */
  const live = STORES.map((s) => s.code);
  const retired = await db.store.updateMany({
    where: { code: { notIn: live }, isActive: true },
    data: { isActive: false },
  });
  if (retired.count) {
    console.info(`Retired ${retired.count} placeholder store(s).`);
  }

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

  for (const { area, ...store } of STORES) {
    const serviceArea = await db.serviceArea.findUnique({ where: { slug: area } });
    await db.store.upsert({
      where: { code: store.code },
      update: { ...store, isActive: true, serviceAreaId: serviceArea?.id ?? null },
      create: { ...store, serviceAreaId: serviceArea?.id ?? null },
    });
  }
  console.info(`Seeded ${STORES.length} stores, one per serviceable area.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());

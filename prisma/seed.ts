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

async function main() {
  for (const store of STORES) {
    await db.store.upsert({
      where: { code: store.code },
      update: store,
      create: store,
    });
  }
  console.info(`Seeded ${STORES.length} stores.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());

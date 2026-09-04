import { ServiceCard } from "@/components/storefront/ServiceCard";
import type { Service } from "@/lib/data/services";

/**
 * Services on the home page.
 *
 * Four of the eight, in a rail on a phone. Eight cards here would be a
 * second page of its own between the catalogue and the Project Hub; the
 * section's "See all" carries the rest.
 */
export function ServicesRow({ services }: { services: Service[] }) {
  return (
    <div className="rail gap-3 px-5 scroll-pl-5 lg:grid lg:grid-cols-4 lg:overflow-visible lg:px-0 lg:scroll-pl-0">
      {services.map((service) => (
        <ServiceCard
          key={service.slug}
          service={service}
          className="w-72 shrink-0 lg:w-auto"
        />
      ))}
    </div>
  );
}

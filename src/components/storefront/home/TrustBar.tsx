import { CheckCircle, Headset, Shield, Truck } from "@/components/icons";

/**
 * Four claims, each one Quoin can actually stand behind.
 *
 * Deliberately not "100% genuine products" or "lowest price guaranteed".
 * Those are the two badges every marketplace prints and neither is a
 * commitment anyone here has made; printing them anyway is what makes a
 * trust row read as decoration. What is left is true: the catalogue is
 * imported from manufacturer price lists, every product card carries its
 * own delivery promise rather than the header's, support is staffed by
 * people who have built, and checkout does not hold card details.
 */
const CLAIMS = [
  {
    Icon: CheckCircle,
    title: "Brand-verified catalogue",
    detail: "Priced from manufacturer lists, not resold listings",
  },
  {
    Icon: Truck,
    title: "A promise per item",
    detail: "Every product shows its own real delivery time",
  },
  {
    Icon: Headset,
    title: "Advice before you order",
    detail: "Free video consultation with a working expert",
  },
  {
    Icon: Shield,
    title: "Secure checkout",
    detail: "No card details are stored by Quoin",
  },
];

export function TrustBar() {
  return (
    <ul className="grid grid-cols-2 gap-px overflow-hidden rounded-card border border-line-soft bg-line-soft lg:grid-cols-4">
      {CLAIMS.map(({ Icon, title, detail }) => (
        <li key={title} className="flex flex-col gap-2 bg-surface p-4">
          <Icon className="size-5 text-accent" />
          <div>
            <p className="text-caption font-semibold leading-tight text-ink">
              {title}
            </p>
            <p className="mt-1 text-micro leading-snug text-muted">{detail}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

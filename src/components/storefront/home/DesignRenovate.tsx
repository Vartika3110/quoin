import Link from "next/link";
import { ArrowRight, Calendar, Check, Hammer, Home, Play, Ruler, Sparkle } from "@/components/icons";
import { Photo } from "@/components/ui/Photo";
import { cn } from "@/components/ui/cn";
import type { IdeaView } from "@/lib/types/studio";

/**
 * Design & Renovate — the end-to-end offer, as one band.
 *
 * Everything else on the home page sells a part: a material, a trade, a
 * room to look at. This is the whole job, and it is the only dark block in
 * the scroll, which is on purpose: a page of cream cards needs one place
 * where the eye is told "this is the big one".
 *
 * What it says is limited to what the services data supports. The four
 * steps are the order the interior-design service actually runs in (a site
 * visit, then a specification matched to catalogue products, then the
 * trades, then a check), and nothing here quotes a price, a duration or a
 * number of homes finished — `services.ts` explains why none of those can
 * be stated yet.
 *
 * The collage is rooms from Studio, and a render is labelled as one.
 * Studio's proposition is rooms somebody finished, so a generated picture
 * inside a renovation promo, unmarked, would read as work Quoin has done.
 */
const STEPS = [
  { Icon: Calendar, title: "Consult", detail: "Site visit\nand brief" },
  { Icon: Ruler, title: "Design", detail: "Layout and\nfinishes" },
  { Icon: Hammer, title: "Build", detail: "Materials\nand trades" },
  { Icon: Home, title: "Handover", detail: "Final check,\nthen keys" },
] as const;

const SCOPE = [
  "Full-home renovation",
  "Modular kitchen",
  "Wardrobes & storage",
  "Bathrooms",
  "Living & bedrooms",
  "False ceiling & lighting",
];

function CollageTile({
  room,
  className,
  ratio,
  sizes,
}: {
  room: IdeaView;
  className?: string;
  ratio: string;
  sizes: string;
}) {
  return (
    <Link
      href={`/studio/pin/${room.slug}`}
      className={cn("group relative block overflow-hidden rounded-card", className)}
    >
      <Photo
        src={room.imageUrl}
        alt=""
        ratio={ratio}
        sizes={sizes}
        blurDataURL={room.blurDataUrl}
        className="absolute inset-0 size-full"
        imageClassName="transition-transform duration-500 ease-out-quart group-hover:scale-[1.04]"
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-deep/90 to-transparent" />
      <div className="absolute left-2.5 top-2.5 flex flex-col items-start gap-1">
        {room.video && (
          <span className="flex items-center gap-1 whitespace-nowrap rounded-full bg-photo-cta/85 px-2 py-1 text-micro font-medium text-on-photo-cta backdrop-blur-sm">
            <Play className="size-3" />
            Walk-through
          </span>
        )}
        {room.imageIsGenerated && (
          <span className="whitespace-nowrap rounded-full bg-photo-cta/85 px-2 py-1 text-micro font-medium text-on-photo-cta backdrop-blur-sm">
            Visualisation
          </span>
        )}
      </div>
      <p className="absolute inset-x-2.5 bottom-2.5 line-clamp-2 text-micro font-semibold leading-tight text-on-deep">
        {room.title}
      </p>
    </Link>
  );
}

export function DesignRenovate({ rooms }: { rooms: IdeaView[] }) {
  /* Three rooms for the collage, and none at all if there are not three —
     a band with one picture in a two-column grid looks like a layout
     error. The copy and the steps stand on their own without it. */
  const [tall, topRight, bottomRight] = rooms;
  const collage = tall && topRight && bottomRight ? { tall, topRight, bottomRight } : null;

  return (
    <div className="px-5 lg:px-0">
      <section
        aria-labelledby="design-renovate"
        className="relative isolate overflow-hidden rounded-card bg-deep text-on-deep shadow-lg"
      >
        {/* Depth without a picture: a warm bloom from the corner and a
            fine ruled line, like drawing paper. Decorative, so out of the
            accessibility tree and out of the way of every tap. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-20 -top-24 -z-10 size-72 rounded-full bg-on-deep-accent/25 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(currentColor 1px, transparent 1px)",
            backgroundSize: "100% 28px",
          }}
        />

        <div
          className={cn(
            "grid grid-cols-[minmax(0,1fr)] gap-6 p-5 sm:p-7",
            collage && "lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-10 lg:p-10",
          )}
        >
          <div className="flex min-w-0 flex-col">
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-on-deep-accent/40 bg-on-deep-accent/15 px-3 py-1.5 text-eyebrow uppercase text-on-deep">
              <Sparkle className="size-3 text-on-deep-accent" />
              Design &amp; Renovate
            </span>
            <h2
              id="design-renovate"
              className="mt-4 font-display text-title-lg font-semibold leading-[1.1] sm:text-[2rem] lg:text-[2.5rem]"
            >
              Your whole home,
              <br />
              designed and built.
            </h2>
            <p className="mt-1.5 font-display text-title text-on-deep-accent">
              start to finish
            </p>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-on-deep/80">
              One team for the plan, the materials and the work — from the
              first site visit to the final check.
            </p>

            {/* What is covered. A rail on a phone; wraps from `lg`. */}
            <ul className="no-scrollbar -mx-5 mt-5 flex gap-2 overflow-x-auto px-5 sm:-mx-7 sm:px-7 lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0">
              {SCOPE.map((item) => (
                <li
                  key={item}
                  className="flex shrink-0 items-center gap-1.5 rounded-full border border-on-deep/20 bg-on-deep/5 px-3 py-1.5 text-micro font-medium text-on-deep"
                >
                  <Check className="size-3 text-on-deep-accent" />
                  {item}
                </li>
              ))}
            </ul>

            {/* The journey. Four across at every width, with the line
                running behind the marks. `top-[2.5625rem]` is half the
                mark's height (1.3125rem) plus the list's top padding (1.25rem): if either
                changes, the line stops passing through the circles. */}
            <ol className="relative mt-6 grid grid-cols-4 gap-1 border-t border-on-deep/15 pt-5">
              <span
                aria-hidden="true"
                className="absolute inset-x-[12.5%] top-[2.5625rem] border-t border-dashed border-on-deep-accent/50"
              />
              {STEPS.map(({ Icon, title, detail }, i) => (
                <li key={title} className="relative flex flex-col items-center text-center">
                  <span className="grid size-[2.625rem] place-items-center rounded-full border border-on-deep-accent/70 bg-deep">
                    <Icon className="size-[1.0625rem] text-on-deep-accent" />
                  </span>
                  <span className="mt-2 text-eyebrow text-on-deep-accent">0{i + 1}</span>
                  <span className="text-sm font-semibold leading-tight">{title}</span>
                  <span className="mt-0.5 whitespace-pre-line text-micro leading-tight text-on-deep/70">
                    {detail}
                  </span>
                </li>
              ))}
            </ol>

            <div className="mt-6 flex flex-wrap gap-2.5">
              <Link
                href="/services/interior-design/book"
                className="flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-bg px-4 py-3.5 text-sm font-semibold text-ink transition-opacity hover:opacity-90 sm:flex-none sm:px-6"
              >
                Book a design consult
                <ArrowRight className="size-3.5" />
              </Link>
              <Link
                href="/studio"
                className="flex flex-1 items-center justify-center whitespace-nowrap rounded-full border border-on-deep/40 px-5 py-3.5 text-sm sm:flex-none font-semibold text-on-deep transition-colors hover:bg-on-deep/10"
              >
                See rooms
              </Link>
            </div>
          </div>

          {collage && (
            <div className="grid min-h-[13.5rem] grid-cols-[1.15fr_1fr] grid-rows-2 gap-2 lg:min-h-[24rem]">
              <CollageTile
                room={collage.tall}
                ratio="3 / 4"
                sizes="(min-width: 1024px) 28vw, 55vw"
                className="row-span-2"
              />
              <CollageTile
                room={collage.topRight}
                ratio="4 / 3"
                sizes="(min-width: 1024px) 20vw, 45vw"
              />
              <CollageTile
                room={collage.bottomRight}
                ratio="4 / 3"
                sizes="(min-width: 1024px) 20vw, 45vw"
              />
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

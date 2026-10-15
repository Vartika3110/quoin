import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Chat,
  CheckCircle,
  Key,
  PencilRuler,
  Spanner,
  Sparkles,
} from "@/components/icons";

/**
 * Design & Renovate — the half of Quoin that is not a shelf.
 *
 * Built to the design reference, measured rather than approximated: the
 * first version of this section was a light two-column card with one
 * photograph, which carried the right words in the wrong clothes. The
 * reference draws a dark espresso panel with a sand glow behind it, a
 * three-tile mosaic of rooms, a scrolling row of scopes, and four
 * circled steps on a dashed line. Every figure below — the 24px radius,
 * the 42px circles, the `rgba(216,178,139,…)` sand, the 16px tiles —
 * is read off it.
 *
 * ## Why it is dark in both themes
 *
 * `bg-deep` is `#2a160a`, which is exactly the espresso the reference
 * uses, and it is already this app's token for "a dark band that breaks
 * up the page". The card does not invert in the dark theme: it is the
 * one surface on the home page that is meant to read as a different
 * material, and a dark band on a dark page still does that when the
 * page is near-black and the band is brown.
 *
 * The sand — `#d8b28b` at various alphas — is the reference's accent
 * inside this panel and is written here rather than tokenised, because
 * it belongs to this one fixed-dark surface and nowhere else.
 *
 * ## What it claims
 *
 * Every line is something Quoin can do today: the roster carries
 * interior designers, masons, electricians, plumbers, painters and
 * carpenters, the catalogue carries the materials, and `/consult` takes
 * the brief. No timeline, no price, no count of homes finished.
 *
 * The reference's big tile is a video with a "Walk-through" pill over
 * it. There is no clip — `StudioIdea` carries none with `media: VIDEO`
 * — so the tile is the still and the pill is absent. A play button over
 * a photograph is a broken control, not a design detail. When there is
 * footage, the pill goes back.
 *
 * The three rooms are Studio renders and the section says so once, in
 * the corner of the mosaic, for the reason the hero's rendered slides
 * carry the same tag: a panel headed "designed and built" over
 * unlabelled renders is a portfolio claim, and there is no portfolio
 * yet.
 */

/** The reference's accent inside this panel. See the note above. */
const SAND = "#d8b28b";

const SCOPES = [
  "Full-home renovation",
  "Modular kitchen",
  "Wardrobes & storage",
  "Bathrooms",
  "Living & bedrooms",
  "False ceiling & lighting",
];

const STEPS = [
  { n: "01", title: "Consult", detail: "Brief and site visit", Icon: Chat },
  { n: "02", title: "Design", detail: "Layouts and the look agreed", Icon: PencilRuler },
  { n: "03", title: "Build", detail: "Materials and crews", Icon: Spanner },
  { n: "04", title: "Handover", detail: "Snag list, then keys", Icon: Key },
];

/** The mosaic: one tall tile, then two stacked beside it. */
const ROOMS = [
  { image: "/studio/timber-panelled-garden-bedroom.webp", caption: "Skyline bedroom, golden hour" },
  { image: "/studio/two-tone-walnut-graphite-kitchen.webp", caption: "Kitchen" },
  { image: "/studio/statuario-bath-floating-vanity.webp", caption: "Bathroom" },
];

export function DesignBuild() {
  return (
    /* `mx-5 lg:mx-0` for the reason the hero carries it: every section
       on this page insets its own contents by the phone gutter, and a
       full-bleed card beside inset ones reads as a mistake rather than
       as emphasis. 24px radius, from the reference. */
    <div className="relative mx-5 overflow-hidden rounded-[24px] bg-deep text-on-deep lg:mx-0">
      {/* The ruled texture — a 1px line every 8px at 3.5% white. It is
          what stops a panel this large reading as a flat block, and it
          is barely visible by design. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-100"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.035) 1px, rgba(0,0,0,0) 1px)",
          backgroundSize: "100% 8px",
        }}
      />
      {/* The sand glow, top-right in the reference. */}
      <span
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-16 size-64 rounded-full"
        style={{
          backgroundImage: `radial-gradient(circle, ${SAND}4d 0%, rgba(216,178,139,0) 68%)`,
        }}
      />

      <div className="relative p-5 lg:grid lg:grid-cols-2 lg:gap-10 lg:p-10">
        <div>
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-micro font-semibold uppercase tracking-[0.12em]"
            style={{
              backgroundColor: `${SAND}29`,
              border: `1px solid ${SAND}59`,
              color: SAND,
            }}
          >
            <Sparkles className="size-3.5" />
            Design &amp; Renovate
          </span>

          <h2 className="mt-4 font-display text-title font-bold leading-[1.15] lg:text-display-sm">
            Your whole home,
            <br />
            designed and built.
          </h2>

          <p className="mt-3 max-w-prose text-body-sm" style={{ color: "#d9c9b4" }}>
            One team for the plan, the materials and the work, from the first
            brief to the final handover.
          </p>

          {/* The mosaic. One tall tile and two stacked, 16px corners, 8px
              apart — the reference's arrangement exactly. On a phone it
              is the same shape at a smaller size rather than a stack:
              three rooms in a column would be half a screen of pictures
              before the steps. */}
          <div className="mt-5 grid grid-cols-[1.35fr_1fr] gap-2">
            <Tile room={ROOMS[0]} tall />
            <div className="grid grid-rows-2 gap-2">
              <Tile room={ROOMS[1]} />
              <Tile room={ROOMS[2]} />
            </div>
          </div>
        </div>

        <div className="mt-6 lg:mt-0">
          {/* Scopes. A scrolling row on a phone, as drawn, rather than a
              wrapped block: six pills wrap to three rows at 375px and
              push the steps below the fold. Not links — there is one
              destination behind this panel and it is the consult. */}
          <ul className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0 [&::-webkit-scrollbar]:hidden">
            {SCOPES.map((scope) => (
              <li
                key={scope}
                className="flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-micro font-semibold"
                style={{
                  backgroundColor: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.22)",
                  color: "#f3e9db",
                }}
              >
                <CheckCircle className="size-3.5" style={{ color: SAND }} />
                {scope}
              </li>
            ))}
          </ul>

          {/* The four steps, on a dashed line that runs behind the
              circles. The line is drawn first and inset by half a circle
              at each end, so it joins the circles rather than poking out
              past the first and last. */}
          <ol className="relative mt-7 grid grid-cols-4 gap-2">
            <span
              aria-hidden
              className="absolute left-[12.5%] right-[12.5%] top-5 hidden border-t border-dashed sm:block"
              style={{ borderColor: `${SAND}59` }}
            />
            {STEPS.map(({ n, title, detail, Icon }) => (
              <li key={n} className="relative flex flex-col items-center text-center">
                <span
                  className="grid size-10 place-items-center rounded-full bg-deep lg:size-[42px]"
                  style={{ border: `1px solid ${SAND}b3`, color: SAND }}
                >
                  <Icon className="size-4.5" />
                </span>
                <span className="nums mt-2 text-micro font-semibold" style={{ color: SAND }}>
                  {n}
                </span>
                <span className="mt-0.5 text-caption font-bold">{title}</span>
                <span className="mt-0.5 text-micro leading-snug" style={{ color: "#bfae98" }}>
                  {detail}
                </span>
              </li>
            ))}
          </ol>

          <div className="mt-7 flex items-center gap-3">
            {/* Cream on espresso, and it stretches: the reference gives
                the primary the rest of the row after "See rooms" has
                taken what it needs. */}
            <Link
              href="/consult"
              className="flex flex-1 items-center justify-center gap-1.5 rounded-full px-5 py-3.5 text-body-sm font-bold transition-opacity hover:opacity-90"
              style={{ backgroundColor: "#f7f1e6", color: "#2a160a" }}
            >
              Book a design consult
              <ArrowRight className="size-4" />
            </Link>
            <Link
              href="/studio"
              className="shrink-0 rounded-full px-4 py-3.5 text-body-sm font-bold transition-colors hover:bg-white/10"
              style={{ border: "1px solid rgba(255,255,255,0.4)" }}
            >
              See rooms
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function Tile({
  room,
  tall = false,
}: {
  room: { image: string; caption: string };
  tall?: boolean;
}) {
  return (
    <div
      className={
        "relative overflow-hidden rounded-2xl " + (tall ? "aspect-[4/5]" : "size-full")
      }
    >
      <Image
        src={room.image}
        alt=""
        fill
        sizes="(min-width: 1024px) 25vw, 45vw"
        loading="lazy"
        className="object-cover"
      />
      {/* A foot of shade under the caption only — a scrim over the whole
          tile would flatten three pictures the panel is there to show. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/70 to-transparent"
      />
      <span className="absolute bottom-2 left-2.5 right-2 text-micro font-bold leading-tight text-white">
        {room.caption}
      </span>
      {tall && (
        <span className="absolute right-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-[0.625rem] font-medium text-white">
          Visualisation
        </span>
      )}
    </div>
  );
}

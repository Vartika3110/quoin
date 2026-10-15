import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "@/components/icons";

/**
 * Design & Renovate — the half of Quoin that is not a shelf.
 *
 * Built to the design reference at the owner's instruction, and it is
 * the one block on this page that sells a *service* rather than
 * listing stock. The catalogue answers "what does it cost"; Studio
 * answers "what should it look like"; this answers the question
 * underneath both, which is "who is going to do it".
 *
 * **It is a pitch, and this page deleted five of those**, so the shape
 * is deliberately the small one: a picture, four steps and two doors,
 * on about a screen and a half of phone. The promos that went were
 * full-screen blocks for features reachable from the tab bar — Project
 * Hub, Parcha, Pro — and their sin was repeating a door the reader
 * already had. Design and build has no door anywhere: it is not in the
 * header, not in the tab bar, not a category, and `/consult` is the
 * only route to it. A page that never mentions it is a page that hides
 * half the business.
 *
 * ## What it claims
 *
 * Every line is something Quoin can actually do today. The roster
 * carries interior designers, masons, electricians, plumbers, painters
 * and carpenters; the catalogue carries the materials; `/consult` takes
 * the brief. The four steps describe that sequence and stop there.
 *
 * What it deliberately does **not** say is anything the reference says
 * and this business cannot yet stand behind — no fixed timeline, no
 * "3D plan" (nobody has promised a render), no price, and no claim
 * about how many homes have been finished. The chips name scopes, not
 * packages, because a package implies a price list that does not exist.
 *
 * The photograph is a Studio render and carries the same
 * "Visualisation" tag the hero's rendered slides carry. A section
 * headed "designed and built" sitting over an unlabelled render is a
 * portfolio claim, and this one has no portfolio behind it yet. When
 * there are photographs of finished Quoin projects, they replace this
 * and the tag comes off with it.
 */

/** What the service covers. Scopes, not packages — see above. */
const SCOPES = [
  "Full-home renovation",
  "Modular kitchen",
  "Wardrobes & storage",
  "Bathrooms",
  "Living & bedrooms",
  "False ceiling & lighting",
];

/** The sequence, as it actually runs. Four is the whole of it. */
const STEPS = [
  { n: "01", title: "Consult", detail: "A brief, then a site visit" },
  { n: "02", title: "Design", detail: "Layouts, and the look agreed" },
  { n: "03", title: "Build", detail: "Materials delivered, crews on site" },
  { n: "04", title: "Handover", detail: "Snag list, then keys" },
];

export function DesignBuild() {
  return (
    /* `mx-5 lg:mx-0` for the reason the hero carries it: every section
       on this page insets its own contents by the phone gutter, and a
       full-bleed card beside inset ones reads as a mistake rather than
       as emphasis. */
    <div className="mx-5 overflow-hidden rounded-card border border-line-soft bg-surface lg:mx-0">
      <div className="lg:grid lg:grid-cols-2">
        {/* The picture. A fixed aspect on a phone, where it is a band
            above the words; from `lg` it stretches to whatever height
            the column beside it turns out to be, which is why the
            wrapper is `relative` and the image fills it. */}
        <div className="relative aspect-[16/10] lg:aspect-auto">
          <Image
            src="/studio/double-height-dark-stone-living.webp"
            alt=""
            fill
            sizes="(min-width: 1024px) 50vw, 100vw"
            loading="lazy"
            className="object-cover"
          />
          <span className="absolute bottom-3 right-3 rounded-full bg-ink/70 px-2.5 py-1 text-micro font-medium text-bg">
            Visualisation
          </span>
        </div>

        <div className="p-5 lg:p-10">
          <p className="text-micro font-semibold uppercase tracking-[0.14em] text-accent">
            Design &amp; Renovate
          </p>

          <h2 className="mt-2 font-display text-title font-semibold leading-tight text-ink lg:text-display-sm">
            Your whole home,
            <br />
            designed and built.
          </h2>

          <p className="mt-3 max-w-prose text-body-sm text-muted lg:text-body">
            One team for the plan, the materials and the work — from the first
            brief to the day you get the keys.
          </p>

          {/* Scopes. Not links, and styled so they do not ask to be
              clicked: there is one destination behind this section and
              it is the consult below. Six pills that all went to the
              same page would be six ways to find that out. */}
          <ul className="mt-4 flex flex-wrap gap-1.5">
            {SCOPES.map((scope) => (
              <li
                key={scope}
                className="rounded-full border border-line-hair px-2.5 py-1 text-micro text-muted lg:text-caption"
              >
                {scope}
              </li>
            ))}
          </ul>

          {/* Two across on a phone rather than four: four columns at
              375px is a two-word title over a four-word line, which
              wraps to three rows and reads as a table. */}
          <ol className="mt-6 grid grid-cols-2 gap-x-4 gap-y-5 lg:grid-cols-4">
            {STEPS.map((step) => (
              <li key={step.n}>
                <span className="nums block text-caption font-semibold text-accent">
                  {step.n}
                </span>
                <span className="mt-1 block text-body-sm font-semibold text-ink">
                  {step.title}
                </span>
                <span className="mt-0.5 block text-caption leading-snug text-muted">
                  {step.detail}
                </span>
              </li>
            ))}
          </ol>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            {/* The same inverted pill the hero's call to action uses, for
                the same reason: `Button`'s dark variant is a fixed dark
                in both themes and disappears on this page's dark
                ground. See the note in `Hero`. */}
            <Link
              href="/consult"
              className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-body-sm font-semibold text-bg transition-opacity hover:opacity-90"
            >
              Book a design consult
              <ArrowRight className="size-4" />
            </Link>
            <Link
              href="/studio"
              className="inline-flex items-center gap-1.5 rounded-full border border-line px-5 py-3 text-body-sm font-semibold text-ink transition-colors hover:bg-hover"
            >
              See rooms
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

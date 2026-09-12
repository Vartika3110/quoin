import { Calendar, Check, Clock, Headset, Info, Phone, Ruler, Shield, Video } from "@/components/icons";
import {
  CONSULT_MODE_INFO,
  CONSULT_MODES,
  type ConsultMode,
} from "@/lib/types/consult";

/**
 * The consultation page, minus the form.
 *
 * Everything here is static and server-rendered. The form is the only part
 * that needs to be a client component, and keeping these out of it means
 * the page's copy is not shipped twice — once as HTML and once inside a
 * hydration payload.
 */

export const MODE_ICON: Record<ConsultMode, typeof Video> = {
  video: Video,
  site_visit: Ruler,
};

/* ------------------------------------------------------------------- hero */

export function ConsultHero() {
  return (
    <div
      className="relative overflow-hidden rounded-card px-6 py-7 lg:px-10 lg:py-9"
      /* Token-built gradient rather than a hand-picked hex trio: the tile
         tints exist for exactly this warm-cream-to-tan range but, like the
         other flat tints, are not registered in the Tailwind theme, so
         `bg-gradient-to-br` cannot reach them by class name — the same
         reason `EntryCards` and `QuickActions` read them with `var()`. */
      style={{
        backgroundImage:
          "linear-gradient(to bottom right, var(--quoin-tile-3), var(--quoin-tile-1), var(--quoin-border-strong))",
      }}
    >
      <div className="relative max-w-xl">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-surface/80 px-3 py-1 text-micro text-deep-soft">
          <Headset className="size-3.5 text-accent" />
          Talk to an expert
        </span>

        {/* No hard break. One was here, tuned to where the old typeface
            happened to wrap, and a wider face turned it into three lines
            with a stranded word. `text-balance` asks the browser to even
            the lines out instead, which survives a change of font. */}
        <h1 className="mt-3 max-w-sm text-balance font-display text-headline leading-[1.1] text-deep lg:text-display-sm">
          Ask someone who has built it before.
        </h1>

        <p className="mt-3 max-w-md text-body leading-relaxed text-deep-soft">
          Twenty minutes on a call, or an hour on site with a tape measure.
          Either way you leave knowing what the job needs and roughly what it
          costs — before you order anything.
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ mode detail */

/**
 * What each mode is, at length.
 *
 * The chooser inside the form carries the one-line version; this is where
 * the limits live. Both read from `CONSULT_MODE_INFO`, so the two can not
 * drift apart into a page that promises what the form does not.
 */
export function ConsultModeDetail() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {CONSULT_MODES.map((id) => {
        const mode = CONSULT_MODE_INFO[id];
        const Icon = MODE_ICON[id];

        return (
          <section
            key={id}
            className="flex flex-col rounded-card border border-line-soft bg-surface p-4"
          >
            <div className="flex items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-wash text-accent">
                <Icon className="size-5" />
              </span>
              <div className="min-w-0">
                <h3 className="font-display text-body font-semibold text-ink">{mode.title}</h3>
                <p className="text-micro text-muted">
                  {mode.duration} · {mode.price}
                </p>
              </div>
            </div>

            <ul className="mt-3 space-y-1.5">
              {mode.gets.map((line) => (
                <li key={line} className="flex gap-2 text-caption leading-relaxed text-muted">
                  <Check className="mt-0.5 size-3.5 shrink-0 text-success" />
                  {line}
                </li>
              ))}
            </ul>

            {/* The limit is not small print. Someone who books a call
                expecting a measured quote has been mis-sold, and finds out
                at the worst possible moment — on the call. */}
            <p className="mt-3 flex gap-2 border-t border-line-soft pt-3 text-micro leading-relaxed text-faint">
              <Info className="mt-px size-3.5 shrink-0" />
              {mode.limit}
            </p>
          </section>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------ how it works */

const STEPS = [
  {
    Icon: Calendar,
    title: "You ask",
    body: "Pick a mode and the day that suits you. Two minutes, no account needed.",
  },
  {
    Icon: Phone,
    title: "We call back",
    body: "Within one working day, to confirm the time and — for a site visit — the fee.",
  },
  {
    Icon: Check,
    title: "You get it in writing",
    body: "A summary after the call, or a measured quantity list after the visit.",
  },
];

export function ConsultSteps() {
  return (
    <ol className="space-y-3">
      {STEPS.map(({ Icon, title, body }, i) => (
        <li key={title} className="flex gap-3">
          <span className="relative grid size-8 shrink-0 place-items-center rounded-full border border-line bg-surface text-accent">
            <Icon className="size-4" />
            {/* The rule joining the steps, drawn from each marker down to
                the next rather than behind the whole list, so it stops at
                the last one instead of trailing into white space. */}
            {i < STEPS.length - 1 && (
              <span className="absolute left-1/2 top-full h-3 w-px -translate-x-1/2 bg-line" aria-hidden />
            )}
          </span>
          <div className="min-w-0 pb-1">
            <p className="text-body font-medium leading-tight text-ink">{title}</p>
            <p className="mt-0.5 text-caption leading-relaxed text-muted">{body}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/* ---------------------------------------------------------------- promises */

const ASSURANCES = [
  { Icon: Shield, label: "Experts verified by Quoin, not a directory listing" },
  { Icon: Clock, label: "A call back within one working day" },
  { Icon: Info, label: "Advice first — no obligation to order anything" },
];

export function ConsultAssurances() {
  return (
    <ul className="space-y-2.5">
      {ASSURANCES.map(({ Icon, label }) => (
        <li key={label} className="flex gap-2.5 text-caption leading-relaxed text-muted">
          <Icon className="mt-px size-4 shrink-0 text-accent" />
          {label}
        </li>
      ))}
    </ul>
  );
}

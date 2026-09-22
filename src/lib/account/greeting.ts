/**
 * Pure helpers for the account overview header and its money windows.
 *
 * Nothing here touches Prisma or the clock except by parameter, so the
 * greeting, "today" and "this month" are testable without a database and
 * safe to share with anything that only needs to render the same fact the
 * server already decided — the same shape as
 * `src/lib/services/booking-helpers.ts`.
 *
 * India Standard Time only, deliberately: Quoin ships from Indian stores to
 * Indian addresses, and reading "good morning" or "this month" off a
 * visitor's own browser timezone would greet someone checking a site
 * office from abroad for a time of day they are not having.
 */

const IST_TIME_ZONE = "Asia/Kolkata";

/** The hour of day in IST, 0-23. `hourCycle: "h23"` matters: the default
    12-hour cycle reports midnight as `24`, which would fail `hour < 12`
    for the one hour that most needs it to pass. */
function istHour(now: Date): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: IST_TIME_ZONE,
      hour: "numeric",
      hourCycle: "h23",
    }).format(now),
  );
}

/**
 * "Good morning" / "Good afternoon" / "Good evening", by the IST hour.
 */
export function greetingFor(now: Date): string {
  const hour = istHour(now);
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/**
 * A calendar day as `YYYY-MM-DD` in India — the same technique as `istDay`
 * in `src/lib/types/consult.ts`, restated here rather than imported: that
 * module is kept import-light for a client bundle, and pulling it in for
 * one function would tie this file's dependency graph to consult's for no
 * reason either module needs.
 */
export function todayIST(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: IST_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * The UTC instant of midnight on the 1st of the IST calendar month `now`
 * falls in — the "this month" boundary Pro's monthly spend compares
 * `Order.paidAt` against.
 *
 * Built from the ISO offset literal, not by stepping a `Date` back to the
 * 1st and hoping the offset held across the step: India Standard Time has
 * had no DST and no change since 1947, so `+05:30` is correct for every
 * month this application will ever query — the same construction as
 * `resolveIstMonthRangeUtc` in `src/lib/data/admin-metrics.ts`, restated
 * here for the reason `todayIST` above gives.
 */
export function startOfMonthIST(now: Date): Date {
  const [year, month] = todayIST(now).split("-");
  return new Date(`${year}-${month}-01T00:00:00+05:30`);
}

/** The trimmed first word of a name, or `null` for anything blank —
    "there" is the caller's own fallback to compose, not this function's. */
export function firstName(name: string | null | undefined): string | null {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return null;
  return trimmed.split(/\s+/)[0];
}

/**
 * The correctly-pluralised word for `n`, so a card composes
 * `` `${n} ${plural(n, "Active Project", "Active Projects")}` `` instead of
 * every caller writing its own `n === 1 ? ... : ...`.
 */
export function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

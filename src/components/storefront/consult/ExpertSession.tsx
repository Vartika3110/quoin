"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { Check, Clock, Video } from "@/components/icons";
import { cn } from "@/components/ui/cn";
import {
  CONSULT_TOPIC_INFO,
  CONSULT_TOPICS,
  formatConsultDay,
  formatConsultTime,
  formatFee,
  type ConsultTopic,
} from "@/lib/types/consult";
import type { AreaChoice } from "@/lib/data/service-areas";
import type { Category } from "@/lib/types/catalog";

/**
 * Booking and paying for a video consultation.
 *
 * Four steps in one column, in the order the decision is actually made:
 * what you want to talk about (which is also what it costs), when, who
 * you are, pay. No tabs and no wizard — a ₹99 purchase that takes four
 * screens is a ₹99 purchase nobody completes.
 *
 * ## What this component is careful about
 *
 *  - **The price is on the topic.** It is not revealed at the end. The
 *    three bands are three cards with their fees on them, because
 *    choosing the band *is* choosing the price and a customer who finds
 *    that out at the payment step has been handled badly.
 *  - **Only real slots are offered.** Availability comes from
 *    `/api/v1/consultations/availability`, which returns what can
 *    actually be booked, and is refetched after a clash so the customer
 *    sees what is left rather than being told twice.
 *  - **Payment is Razorpay's own sheet**, opened against an order this
 *    server created. The success callback is treated as a reason to look,
 *    never as proof of payment — `payment.captured` on the webhook is the
 *    only thing that confirms a booking, exactly as checkout works. So
 *    the confirmation page reads the row back rather than being told what
 *    to say by the browser.
 */

/** ---- Razorpay --------------------------------------------------------- *
 *
 * Loaded lazily, on reaching payment, and never from the root layout
 * where every visitor would pay for a third-party script. The same
 * approach `CheckoutFlow` takes.
 *
 * The global `Window.Razorpay` declaration lives in `CheckoutFlow.tsx`;
 * this file reads it through a local cast instead of augmenting the same
 * global a second time, which would be a duplicate-declaration error the
 * day either type changed. */
const RAZORPAY_SCRIPT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

interface RazorpayHandoff {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

interface RazorpayInstance {
  open: () => void;
  on: (event: "payment.failed", handler: (response: unknown) => void) => void;
}

type RazorpayConstructor = new (options: {
  key: string;
  order_id: string;
  amount: number;
  currency: string;
  name: string;
  description?: string;
  prefill?: { name?: string; contact?: string; email?: string };
  handler: (response: RazorpayHandoff) => void;
  modal?: { ondismiss?: () => void };
}) => RazorpayInstance;

let scriptPromise: Promise<void> | null = null;

function loadRazorpay(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Razorpay can only load in the browser."));
  }
  if (gateway()) return Promise.resolve();

  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = RAZORPAY_SCRIPT_SRC;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        /* Cleared so the next attempt tries again rather than remembering
           a network blip forever as a permanent failure. */
        scriptPromise = null;
        reject(
          new Error("We could not reach the payment gateway. Check your connection."),
        );
      };
      document.body.appendChild(script);
    });
  }
  return scriptPromise;
}

function gateway(): RazorpayConstructor | undefined {
  return (window as unknown as { Razorpay?: RazorpayConstructor }).Razorpay;
}

/** ---- Wire shapes ------------------------------------------------------ */

interface DayAvailability {
  day: string;
  starts: number[];
}

interface BookingResponse {
  reference: string;
  feePaise: number;
  startsAt: string;
  durationMinutes: number;
  razorpayOrderId: string;
  razorpayKeyId: string | null;
  holdMinutes: number;
}

/** ---- The component ---------------------------------------------------- */

export function ExpertSession({
  areas,
  categories,
  defaultAreaSlug,
  defaultName,
  /** False while gateway KYC is pending. The section then points at the
      free call-back form rather than offering a button that cannot work. */
  paymentsReady,
}: {
  areas: AreaChoice[];
  categories: Category[];
  defaultAreaSlug: string | null;
  defaultName?: string;
  paymentsReady: boolean;
}) {
  const router = useRouter();

  const [topic, setTopic] = useState<ConsultTopic | null>(null);
  const [days, setDays] = useState<DayAvailability[] | null>(null);
  /**
   * Set when the availability call itself failed.
   *
   * Tracked separately from `days` being empty, and that distinction is
   * the whole point: the first version collapsed both into `days: []`,
   * and the screen then told a customer "every slot in the next two
   * weeks is taken" when the truth was that the request had 500'd.
   * Claiming to be fully booked is a sentence that loses the customer for
   * good, and it was being said on no evidence at all.
   */
  const [loadFailed, setLoadFailed] = useState(false);
  const [day, setDay] = useState<string | null>(null);
  const [startMinutes, setStartMinutes] = useState<number | null>(null);

  const [name, setName] = useState(defaultName ?? "");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [areaSlug, setAreaSlug] = useState(defaultAreaSlug ?? "");
  const [categorySlug, setCategorySlug] = useState("");
  const [notes, setNotes] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const loadAvailability = useCallback(async () => {
    setLoadFailed(false);
    setDays(null);
    try {
      const response = await fetch("/api/v1/consultations/availability");
      const payload = (await response.json()) as
        | { data: { days: DayAvailability[] } }
        | { error: { message: string } };
      if (!response.ok || "error" in payload) {
        setLoadFailed(true);
        setDays([]);
        return;
      }
      setDays(payload.data.days);
    } catch {
      setLoadFailed(true);
      setDays([]);
    }
  }, []);

  const openDays = (days ?? []).filter((d) => d.starts.length > 0);
  const chosenDay = openDays.find((d) => d.day === day) ?? null;

  async function book() {
    if (!topic || !day || startMinutes == null) return;

    setError(null);
    setFieldErrors({});
    setBusy(true);

    try {
      const response = await fetch("/api/v1/consultations/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic,
          day,
          startMinutes,
          name,
          phone,
          email,
          areaSlug: areaSlug || undefined,
          categorySlug: categorySlug || undefined,
          notes: notes || undefined,
        }),
      });
      const payload = (await response.json()) as
        | { data: BookingResponse }
        | { error: { message: string; fields?: Record<string, string> } };

      if (!response.ok || "error" in payload) {
        if ("error" in payload) {
          setError(payload.error.message);
          if (payload.error.fields) setFieldErrors(payload.error.fields);
          /* A clash means the board has moved. Refetch rather than leave
             a stale grid showing the slot that was just taken. */
          if (response.status === 409) {
            setStartMinutes(null);
            void loadAvailability();
          }
        } else {
          setError("We could not start that booking. Try again in a moment.");
        }
        setBusy(false);
        return;
      }

      await pay(payload.data);
    } catch {
      setError("We could not reach Quoin. Check your connection and try again.");
      setBusy(false);
    }
  }

  async function pay(booking: BookingResponse) {
    if (!booking.razorpayKeyId) {
      setError("Payments are not available right now. Request a free call back instead.");
      setBusy(false);
      return;
    }

    try {
      await loadRazorpay();
      const Razorpay = gateway();
      if (!Razorpay) throw new Error("We could not load the payment screen.");

      /* Scoped to this instance rather than a ref, the same guard
         `CheckoutFlow` documents: Razorpay has been known to call
         `handler` twice on a slow close, and a second call must not race
         the first. */
      let handled = false;

      const rzp = new Razorpay({
        key: booking.razorpayKeyId,
        order_id: booking.razorpayOrderId,
        amount: booking.feePaise,
        currency: "INR",
        name: "Quoin",
        description: `Consultation ${booking.reference}`,
        prefill: { name, contact: phone, email: email || undefined },
        handler: () => {
          if (handled) return;
          handled = true;
          /* Straight to the booking's own page, which reads the row back
             from the database. Nothing the browser was handed is treated
             as proof — see the note at the top of this file. */
          router.push(`/consult/${booking.reference}`);
        },
        modal: {
          ondismiss: () => {
            setBusy(false);
            setError(
              `Payment closed before finishing. We are holding ${formatConsultTime(
                startMinutes ?? 0,
              )} for ${booking.holdMinutes} minutes — press Pay again to keep it.`,
            );
          },
        },
      });

      rzp.on("payment.failed", () => {
        setBusy(false);
        setError(
          `That payment did not go through. We are still holding your time for ${booking.holdMinutes} minutes — press Pay again to retry.`,
        );
      });

      rzp.open();
    } catch (cause) {
      setBusy(false);
      setError(
        cause instanceof Error ? cause.message : "We could not open the payment screen.",
      );
    }
  }

  const ready =
    topic != null &&
    day != null &&
    startMinutes != null &&
    name.trim().length >= 2 &&
    phone.trim().length >= 10;

  return (
    <div className="space-y-7">
      {/* ---- 1. What it is about, and what it costs ------------------- */}
      <section className="space-y-3">
        <Step n={1} title="What do you want to talk about?" />
        <div className="grid gap-3 sm:grid-cols-3">
          {CONSULT_TOPICS.map((id) => {
            const info = CONSULT_TOPIC_INFO[id];
            const on = topic === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setTopic(id);
                  /* Fetched here rather than in an effect watching
                     `topic`. It is a response to an event — the customer
                     picked a band — not state to synchronise, and an
                     effect that calls `setState` is a cascading render
                     for a list nobody was looking at before the click.
                     Fetched once: `days` is not topic-dependent. */
                  if (days === null) void loadAvailability();
                }}
                aria-pressed={on}
                className={cn(
                  "flex h-full flex-col rounded-card border p-4 text-left transition-colors",
                  on
                    ? "border-accent bg-accent-wash"
                    : "border-line bg-surface hover:border-line-strong",
                )}
              >
                <span className="flex items-baseline justify-between gap-2">
                  <span className="font-display text-title-sm font-semibold text-ink">
                    {formatFee(info.feePaise)}
                  </span>
                  {on && <Check className="size-4 shrink-0 text-accent" />}
                </span>
                {/* Fee and title only. The summary line that used to sit
                    here is gone at the owner's instruction: three cards
                    each carrying a sentence made the chooser a paragraph
                    to read before the first decision, and `covers` below
                    says the same thing properly once a band is picked. */}
                <span className="mt-1 text-caption font-semibold text-ink">{info.title}</span>
              </button>
            );
          })}
        </div>

        {topic && (
          <ul className="space-y-1.5 rounded-card border border-line-soft bg-raised p-4">
            {CONSULT_TOPIC_INFO[topic].covers.map((line) => (
              <li key={line} className="flex gap-2 text-caption text-ink">
                <Check className="mt-0.5 size-3.5 shrink-0 text-accent" aria-hidden />
                {line}
              </li>
            ))}
            <li className="flex gap-2 pt-1 text-micro text-muted">
              <Clock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              A 15–20 minute video call. The fee includes GST and is refunded in full if we
              cannot make the time we agreed.
            </li>
          </ul>
        )}
      </section>

      {/* ---- 2. When ---------------------------------------------------- */}
      {topic && (
        <section className="space-y-3">
          <Step n={2} title="When suits you?" />

          {days === null ? (
            <p className="flex items-center gap-2 text-caption text-muted">
              <Spinner className="size-4" />
              Checking what is free…
            </p>
          ) : loadFailed ? (
            /* "We could not check", not "nothing is free". See `loadFailed`. */
            <div className="space-y-2 rounded-card border border-line-soft bg-raised px-4 py-3">
              <p className="text-caption text-muted">
                We could not check what is free just now. This is us, not you.
              </p>
              <Button variant="outline" size="sm" onClick={() => void loadAvailability()}>
                Try again
              </Button>
            </div>
          ) : openDays.length === 0 ? (
            <p className="rounded-card border border-line-soft bg-raised px-4 py-3 text-caption text-muted">
              Every slot in the next two weeks is taken. Request a free call back below and we
              will ring you instead.
            </p>
          ) : (
            <>
              <div className="rail gap-2 pb-1">
                {openDays.map((option) => (
                  <button
                    key={option.day}
                    type="button"
                    onClick={() => {
                      setDay(option.day);
                      setStartMinutes(null);
                    }}
                    aria-pressed={day === option.day}
                    className={cn(
                      "shrink-0 rounded-lg border px-3 py-2 text-center transition-colors",
                      day === option.day
                        ? "border-accent bg-accent-wash text-accent"
                        : "border-line bg-surface text-ink hover:border-line-strong",
                    )}
                  >
                    <span className="block text-caption font-medium">
                      {formatConsultDay(option.day)}
                    </span>
                    <span className="block text-micro text-muted">
                      {option.starts.length} free
                    </span>
                  </button>
                ))}
              </div>

              {chosenDay && (
                <div className="flex flex-wrap gap-2">
                  {chosenDay.starts.map((minutes) => (
                    <button
                      key={minutes}
                      type="button"
                      onClick={() => setStartMinutes(minutes)}
                      aria-pressed={startMinutes === minutes}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-caption transition-colors",
                        startMinutes === minutes
                          ? "border-accent bg-accent-wash font-medium text-accent"
                          : "border-line bg-surface text-muted hover:border-line-strong hover:text-ink",
                      )}
                    >
                      {formatConsultTime(minutes)}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </section>
      )}

      {/* ---- 3. Who you are -------------------------------------------- */}
      {topic && startMinutes != null && (
        <section className="space-y-3">
          <Step n={3} title="Who are we calling?" />

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Your name" error={fieldErrors.name}>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                className={inputClass}
              />
            </Field>
            <Field label="Mobile number" error={fieldErrors.phone}>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                inputMode="tel"
                autoComplete="tel"
                placeholder="10 digits"
                className={inputClass}
              />
            </Field>
            <Field label="Email (optional)" error={fieldErrors.email}>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                inputMode="email"
                autoComplete="email"
                className={inputClass}
              />
            </Field>
            <Field label="Where is the property? (optional)" error={fieldErrors.areaSlug}>
              <select
                value={areaSlug}
                onChange={(e) => setAreaSlug(e.target.value)}
                className={inputClass}
              >
                <option value="">Not sure / elsewhere</option>
                {areas.map((area) => (
                  <option key={area.slug} value={area.slug}>
                    {area.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Which part of the catalogue? (optional)">
            <select
              value={categorySlug}
              onChange={(e) => setCategorySlug(e.target.value)}
              className={inputClass}
            >
              <option value="">No particular department</option>
              {categories.map((category) => (
                <option key={category.slug} value={category.slug}>
                  {category.title}
                </option>
              ))}
            </select>
          </Field>

          <Field label="What is the question? (optional, but it helps)">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              maxLength={1000}
              placeholder="e.g. 2BHK in Pitampura, want to redo both bathrooms — what should I budget and in what order?"
              className={cn(inputClass, "h-auto resize-none py-2")}
            />
          </Field>
          <p className="text-micro text-muted">
            Sent to the expert before the call, so the twenty minutes go on your answer rather
            than on background.
          </p>
        </section>
      )}

      {/* ---- 4. Pay ----------------------------------------------------- */}
      {topic && startMinutes != null && (
        <section className="space-y-3 border-t border-line-soft pt-5">
          {!paymentsReady ? (
            <p className="rounded-card border border-line-soft bg-raised px-4 py-3 text-caption text-muted">
              Card and UPI payments are not switched on yet, so this cannot be booked today.
              Request a free call back below — an expert will ring you, at no charge.
            </p>
          ) : (
            <>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-caption text-muted">
                  {day ? formatConsultDay(day) : ""} at {formatConsultTime(startMinutes)} ·{" "}
                  {CONSULT_TOPIC_INFO[topic].title}
                </span>
                <span className="font-display text-title-sm font-semibold text-ink">
                  {formatFee(CONSULT_TOPIC_INFO[topic].feePaise)}
                </span>
              </div>

              {error && (
                <p
                  role="status"
                  className="rounded-card border border-danger/30 bg-danger-wash px-4 py-3 text-caption text-danger"
                >
                  {error}
                </p>
              )}

              <Button
                variant="primary"
                size="lg"
                onClick={() => void book()}
                disabled={busy || !ready}
                className="w-full"
              >
                {busy ? (
                  <>
                    <Spinner className="size-4.5" />
                    Opening payment…
                  </>
                ) : (
                  <>
                    <Video className="size-4.5" />
                    Pay {formatFee(CONSULT_TOPIC_INFO[topic].feePaise)} and book
                  </>
                )}
              </Button>
              <p className="text-micro text-muted">
                We hold your time for 15 minutes while you pay. The video link appears on your
                booking page the moment the payment clears — nothing to install.
              </p>
            </>
          )}
        </section>
      )}
    </div>
  );
}

const inputClass =
  "h-11 w-full rounded-lg border border-line bg-surface px-3 text-body text-ink outline-none placeholder:text-faint focus:border-accent";

function Step({ n, title }: { n: number; title: string }) {
  return (
    <h3 className="flex items-center gap-2 text-caption font-semibold text-ink">
      <span className="grid size-5 shrink-0 place-items-center rounded-full bg-accent text-micro font-bold text-on-accent">
        {n}
      </span>
      {title}
    </h3>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-micro font-medium text-muted">{label}</span>
      {children}
      {error && <span className="block text-micro text-danger">{error}</span>}
    </label>
  );
}

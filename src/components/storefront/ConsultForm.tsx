"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, Chevron, Clock, Headset, Pin } from "@/components/icons";
import { MODE_ICON } from "@/components/storefront/consult";
import type { AreaChoice } from "@/lib/data/service-areas";
import type { Category } from "@/lib/types/catalog";
import {
  CONSULT_MODE_INFO,
  CONSULT_MODES,
  CONSULT_SLOT_LABEL,
  CONSULT_SLOTS,
  formatConsultDay,
  type ConsultMode,
  type ConsultRequestView,
  type ConsultSlot,
} from "@/lib/types/consult";

/**
 * Ask for a consultation.
 *
 * Deliberately one screen rather than a wizard. This is the top of the
 * funnel and the whole ask is nine fields, four of which are optional —
 * a customer who cannot see how long it will take does not start.
 *
 * The day rail is rendered from days handed down by the server. Computing
 * "today" here would use the visitor's device clock, and a phone set to
 * London would offer a day the API then rejects as being in the past.
 */
export function ConsultForm({
  areas,
  categories,
  days,
  defaultAreaSlug,
  defaultName,
}: {
  areas: AreaChoice[];
  categories: Category[];
  days: string[];
  /** The locality already chosen in the header, so it is not asked twice. */
  defaultAreaSlug: string | null;
  defaultName?: string;
}) {
  const [mode, setMode] = useState<ConsultMode>("video");
  const [day, setDay] = useState<string>("");
  const [slot, setSlot] = useState<ConsultSlot | "">("");
  const [areaSlug, setAreaSlug] = useState(defaultAreaSlug ?? "");

  const [busy, setBusy] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [done, setDone] = useState<ConsultRequestView | null>(null);

  /* Move to the first box the server rejected. Without this a rejected
     submit is silent for anyone not looking at the field they last
     touched — the error text is on screen, but nothing takes them to it,
     and on a phone it can be a screen away from the button they pressed.
     Focusing it announces the message through `aria-describedby` too. */
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (Object.keys(fields).length === 0) return;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [fields]);

  if (done) return <ConsultConfirmation request={done} />;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setFields({});
    setMessage(null);

    const form = new FormData(event.currentTarget);
    const text = (key: string) => String(form.get(key) ?? "").trim();

    try {
      const res = await fetch("/api/v1/consultations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          name: text("name"),
          phone: text("phone"),
          email: text("email"),
          areaSlug,
          pincode: text("pincode"),
          categorySlug: text("categorySlug"),
          notes: text("notes"),
          preferredDate: day,
          /* Sent only with a day: the API rejects a window on its own,
             and it is right to — "evening" alone is not a request. */
          preferredSlot: day && slot ? slot : undefined,
        }),
      });

      const payload = await res.json();

      if (!res.ok) {
        const fieldErrors = payload?.error?.fields ?? {};
        setFields(fieldErrors);
        /* The banner is for failures that belong to no field — a rate
           limit, a 500. When the API has already pinned the problem to an
           input, repeating it at the top of the form says the same thing
           twice and buries which box to actually fix. */
        setMessage(
          Object.keys(fieldErrors).length > 0
            ? null
            : (payload?.error?.message ?? "Something went wrong. Please try again."),
        );
        return;
      }

      setDone(payload.data.consultation as ConsultRequestView);
    } catch {
      /* Network-level failure — the request may or may not have landed,
         so the copy must not claim it did not. */
      setMessage("We could not reach Quoin. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={submit} noValidate className="space-y-6">
      <ModeChooser mode={mode} onChange={setMode} />

      <Field
        legend="When suits you?"
        hint="Optional. Leave it and we will find a time on the call back."
      >
        <div className="rail gap-2 pb-1">
          <DayChip label="Any day" value="" active={day === ""} onPick={setDay} />
          {days.map((d) => (
            <DayChip
              key={d}
              label={formatConsultDay(d)}
              value={d}
              active={day === d}
              onPick={setDay}
            />
          ))}
        </div>
        <ErrorText id="preferredDate" fields={fields} />

        {/* A window is meaningless without a day, so it appears only once
            there is one — rather than sitting there disabled, which reads
            as broken. */}
        {day && (
          <div className="mt-3 flex flex-wrap gap-2">
            {CONSULT_SLOTS.map((s) => (
              <Chip
                key={s}
                name="slot"
                label={CONSULT_SLOT_LABEL[s]}
                checked={slot === s}
                onChange={() => setSlot(s)}
              />
            ))}
          </div>
        )}
      </Field>

      <Field
        legend={mode === "site_visit" ? "Where is the site?" : "Where is the project?"}
        hint={
          mode === "site_visit"
            ? "An expert has to get there, so this one we do need."
            : "Helps us put you with someone who knows the local trades."
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Select
            name="areaSlug"
            label="Area"
            value={areaSlug}
            onChange={setAreaSlug}
            error={fields.areaSlug}
            options={[
              { value: "", label: "Select an area" },
              ...areas.map((a) => ({ value: a.slug, label: `${a.name}, ${a.city}` })),
            ]}
          />
          <Input
            name="pincode"
            label="Site pincode"
            optional
            inputMode="numeric"
            maxLength={6}
            placeholder="110063"
            error={fields.pincode}
          />
        </div>

        {/* Said out loud rather than discovered by a customer whose area is
            missing from the list. A request from outside the network is
            still worth taking — it just cannot be promised. */}
        <p className="mt-2 text-[11px] leading-relaxed text-faint">
          Not on the list? Enter the pincode anyway — we will tell you on the
          call back whether we can reach you.
        </p>
      </Field>

      <Field legend="What is it about?" hint="Optional, but it decides which expert calls.">
        <Select
          name="categorySlug"
          label="Closest category"
          error={fields.categorySlug}
          options={[
            { value: "", label: "Not sure yet" },
            ...categories.map((c) => ({ value: c.slug, label: c.title })),
          ]}
        />

        <div className="mt-3">
          <Textarea
            name="notes"
            label="Anything we should know"
            optional
            maxLength={1000}
            placeholder="Two bathrooms in a 1990s flat, tiles and fittings both going. Budget around ₹4L."
            error={fields.notes}
          />
        </div>
      </Field>

      <Field legend="Who do we call?">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            name="name"
            label="Name"
            defaultValue={defaultName}
            autoComplete="name"
            placeholder="Your name"
            error={fields.name}
          />
          <Input
            name="phone"
            label="Mobile number"
            inputMode="tel"
            autoComplete="tel"
            placeholder="98765 43210"
            error={fields.phone}
          />
        </div>
        <div className="mt-3">
          <Input
            name="email"
            label="Email"
            optional
            type="email"
            autoComplete="email"
            placeholder="For the written summary"
            error={fields.email}
          />
        </div>
      </Field>

      {message && (
        <p
          role="alert"
          className="rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger"
        >
          {message}
        </p>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-accent px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent-bright disabled:opacity-60"
        >
          <Headset className="size-4" />
          {busy ? "Sending…" : `Request a ${CONSULT_MODE_INFO[mode].title.toLowerCase()}`}
        </button>

        {/* The honest label for what the button does. It creates a request;
            a person turns that into a time. Saying "Book now" here would
            be a promise the system cannot keep. */}
        <p className="text-[11px] leading-relaxed text-faint">
          This asks for a call back — it does not confirm a slot yet.
        </p>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------- confirmation */

function ConsultConfirmation({ request }: { request: ConsultRequestView }) {
  const mode = CONSULT_MODE_INFO[request.mode];
  const Icon = MODE_ICON[request.mode];

  return (
    <div className="rounded-card border border-line-soft bg-surface p-5">
      <span className="grid size-11 place-items-center rounded-full bg-success/10 text-success">
        <Check className="size-6" />
      </span>

      <h2 className="mt-3 font-display text-2xl text-ink">We have it.</h2>
      <p className="mt-1 text-sm leading-relaxed text-muted">
        Quoin will call you on {request.phone} within one working day to fix a
        time{request.mode === "site_visit" ? " and confirm the visit fee" : ""}.
      </p>

      <dl className="mt-4 divide-y divide-line-soft border-y border-line-soft text-sm">
        <Row term="Reference" detail={<span className="font-semibold tracking-wide">{request.reference}</span>} />
        <Row
          term="Mode"
          detail={
            <span className="inline-flex items-center gap-1.5">
              <Icon className="size-4 text-accent" />
              {mode.title}
            </span>
          }
        />
        {request.preferredDate && (
          <Row
            term="You asked for"
            detail={
              <span className="inline-flex items-center gap-1.5">
                <Clock className="size-4 text-accent" />
                {formatConsultDay(request.preferredDate)}
                {request.preferredSlot && `, ${CONSULT_SLOT_LABEL[request.preferredSlot]}`}
              </span>
            }
          />
        )}
        {request.areaName && (
          <Row
            term="Area"
            detail={
              <span className="inline-flex items-center gap-1.5">
                <Pin className="size-4 text-accent" />
                {request.areaName}
              </span>
            }
          />
        )}
      </dl>

      <p className="mt-4 text-[11px] leading-relaxed text-faint">
        Keep the reference — it is how we find this request if you call us first.
      </p>
    </div>
  );
}

function Row({ term, detail }: { term: string; detail: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <dt className="text-xs text-muted">{term}</dt>
      <dd className="text-right text-sm text-ink">{detail}</dd>
    </div>
  );
}

/* ------------------------------------------------------------ mode chooser */

function ModeChooser({
  mode,
  onChange,
}: {
  mode: ConsultMode;
  onChange: (mode: ConsultMode) => void;
}) {
  return (
    <fieldset>
      <legend className="text-sm font-semibold text-ink">How would you like to meet?</legend>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {CONSULT_MODES.map((id) => {
          const info = CONSULT_MODE_INFO[id];
          const Icon = MODE_ICON[id];
          const on = mode === id;

          return (
            <label
              key={id}
              className={`relative flex cursor-pointer gap-3 rounded-card border p-4 transition-colors ${
                on
                  ? "border-accent bg-accent-wash"
                  : "border-line-soft bg-surface hover:border-accent-edge"
              }`}
            >
              {/* A real radio, visually hidden rather than replaced by a
                  div with role="radio": arrow-key roving, form reset and
                  every screen reader come free and correct. */}
              <input
                type="radio"
                name="mode"
                value={id}
                checked={on}
                onChange={() => onChange(id)}
                className="sr-only"
              />
              <span
                className={`grid size-10 shrink-0 place-items-center rounded-full ${
                  on ? "bg-accent text-white" : "bg-accent-wash text-accent"
                }`}
              >
                <Icon className="size-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-ink">{info.title}</span>
                <span className="mt-0.5 block text-xs leading-snug text-muted">
                  {info.summary}
                </span>
                <span className="mt-1.5 block text-[11px] text-accent">
                  {info.duration} · {info.price}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/* -------------------------------------------------------------- form parts */

function Field({
  legend,
  hint,
  children,
}: {
  legend: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    /* `min-w-0`: a fieldset carries `min-inline-size: min-content` from the
       UA stylesheet, so the day rail inside it sizes the fieldset to all
       fourteen chips and pushes the whole page sideways instead of
       scrolling within its own box. Every other element defaults to
       `min-width: auto` and has the same failure mode; the fieldset is
       just the one that cannot be fixed by the flex rules around it. */
    <fieldset className="min-w-0 border-t border-line-soft pt-5">
      <legend className="text-sm font-semibold text-ink">{legend}</legend>
      {hint && <p className="mb-3 mt-0.5 text-xs text-muted">{hint}</p>}
      <div className={hint ? "" : "mt-3"}>{children}</div>
    </fieldset>
  );
}

function DayChip({
  label,
  value,
  active,
  onPick,
}: {
  label: string;
  value: string;
  active: boolean;
  onPick: (value: string) => void;
}) {
  return (
    <label
      /* `relative`: the radio below is `sr-only`, which is
         `position: absolute`. Without a positioned ancestor its containing
         block is the page, not this label, so the rail's `overflow-x` never
         clips it — it lands at its static x, up to 1.5k px out, and the
         whole document scrolls sideways on a phone. */
      className={`relative cursor-pointer whitespace-nowrap rounded-full border px-3.5 py-2 text-xs transition-colors ${
        active
          ? "border-accent bg-accent text-white"
          : "border-line bg-surface text-ink hover:border-accent-edge"
      }`}
    >
      <input
        type="radio"
        name="day"
        value={value}
        checked={active}
        onChange={() => onPick(value)}
        className="sr-only"
      />
      {label}
    </label>
  );
}

function Chip({
  name,
  label,
  checked,
  onChange,
}: {
  name: string;
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label
      className={`relative cursor-pointer rounded-full border px-3.5 py-2 text-xs transition-colors ${
        checked
          ? "border-accent bg-accent-wash text-accent"
          : "border-line bg-surface text-ink hover:border-accent-edge"
      }`}
    >
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onChange}
        className="sr-only"
      />
      {label}
    </label>
  );
}

function Label({
  htmlFor,
  children,
  optional,
}: {
  htmlFor: string;
  children: React.ReactNode;
  optional?: boolean;
}) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-xs text-muted">
      {children}
      {optional && <span className="text-faint"> (optional)</span>}
    </label>
  );
}

/* `text-base` on a phone rather than `text-sm`: iOS Safari zooms the page
   in when a field under 16px takes focus, and the viewport deliberately
   leaves zoom enabled, so the only fix is to size the type. It also takes
   the fields to a 44px touch height. `lg:text-sm` keeps the desktop form
   at the size it was drawn at. */
const BOX =
  "w-full rounded-xl border bg-surface px-3.5 py-2.5 text-base text-ink outline-none placeholder:text-faint lg:text-sm";

function Input({
  name,
  label,
  error,
  optional,
  ...rest
}: {
  name: string;
  label: string;
  error?: string;
  optional?: boolean;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <div>
      <Label htmlFor={id} optional={optional}>
        {label}
      </Label>
      <input
        id={id}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`${BOX} ${error ? "border-danger" : "border-line"}`}
        {...rest}
      />
      {error && (
        <p id={`${id}-error`} className="mt-1 text-[11px] text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

function Textarea({
  name,
  label,
  error,
  optional,
  ...rest
}: {
  name: string;
  label: string;
  error?: string;
  optional?: boolean;
} & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  return (
    <div>
      <Label htmlFor={id} optional={optional}>
        {label}
      </Label>
      <textarea
        id={id}
        name={name}
        rows={3}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`${BOX} resize-y ${error ? "border-danger" : "border-line"}`}
        {...rest}
      />
      {error && (
        <p id={`${id}-error`} className="mt-1 text-[11px] text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

function Select({
  name,
  label,
  options,
  value,
  onChange,
  error,
}: {
  name: string;
  label: string;
  options: { value: string; label: string }[];
  value?: string;
  onChange?: (value: string) => void;
  error?: string;
}) {
  const id = useId();
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <select
          id={id}
          name={name}
          value={value}
          onChange={onChange ? (e) => onChange(e.target.value) : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className={`${BOX} appearance-none pr-9 ${error ? "border-danger" : "border-line"}`}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <Chevron className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 rotate-90 text-muted" />
      </div>
      {error && (
        <p id={`${id}-error`} className="mt-1 text-[11px] text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/** Field-level error for a control that is not one of the boxes above. */
function ErrorText({ id, fields }: { id: string; fields: Record<string, string> }) {
  if (!fields[id]) return null;
  return <p className="mt-1 text-[11px] text-danger">{fields[id]}</p>;
}

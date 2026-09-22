"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Field, Input, Select, Textarea } from "@/components/ui/Input";
import { InlineError } from "@/components/ui/ErrorState";
import { Steps } from "@/components/ui/Progress";
import { Tabs } from "@/components/ui/Tabs";
import { StickyBar } from "@/components/storefront/StickyBar";
import { cn } from "@/components/ui/cn";
import { ArrowRight, Back, Camera, Check, Close, Document } from "@/components/icons";
import { useSignedUpload, type UploadedFile } from "@/lib/uploads/use-signed-upload";
import { track } from "@/lib/analytics";
import { addressLabelText } from "@/lib/addresses/format";
import { PROJECT_KIND_LABEL, type ProjectKind } from "@/lib/store/projects";
import {
  CONSULT_SLOTS,
  CONSULT_SLOT_LABEL,
  formatConsultDay,
  type ConsultSlot,
} from "@/lib/types/consult";
import type { Service } from "@/lib/data/services";

/**
 * Booking or quoting a service — five steps, one screen at a time on a
 * phone, matching the shape `CheckoutFlow` already uses for the same
 * reason: a form that shows everything at once is a form people abandon.
 *
 * The day rail is handed down from the server (`days`), not computed here
 * — see the comment on the same choice in `ConsultForm`. Computing "today"
 * in the browser would use the visitor's device clock, and a phone set to
 * a different timezone would offer a day the API then rejects as past.
 *
 * Nothing here states a price. `service.pricing` is shown on the review
 * step as the honest sentence it already is on the service's own page —
 * "quoted after the site visit" — never a number, because there is not
 * one until a staff member enters `quotePaise` later.
 */

const STEP_LABELS = ["Project", "Service", "Date", "Site", "Review"];

interface ProjectOption {
  id: string;
  name: string;
  kind: ProjectKind;
  location: string;
}

interface AddressOption {
  id: string;
  label: "HOME" | "WORK" | "SITE" | "OTHER";
  line1: string;
  line2: string | null;
  landmark: string | null;
  city: string;
  pincode: string;
  isDefault: boolean;
}

type BookingMode = "BOOKING" | "QUOTE";

export function ServiceBookingFlow({
  services,
  projects,
  addresses,
  days,
  initialServiceSlug,
  initialProjectId,
  forceQuote,
}: {
  services: Service[];
  projects: ProjectOption[];
  addresses: AddressOption[];
  /** `YYYY-MM-DD`, next 30 days starting tomorrow IST. */
  days: string[];
  initialServiceSlug?: string;
  initialProjectId?: string;
  forceQuote: boolean;
}) {
  const router = useRouter();

  const defaultService =
    services.find((s) => s.slug === initialServiceSlug) ?? services[0];

  const [step, setStep] = useState(0);

  const [serviceSlug, setServiceSlug] = useState(defaultService?.slug ?? "");
  const [bookChoice, setBookChoice] = useState<BookingMode>(forceQuote ? "QUOTE" : "BOOKING");

  const initialProject =
    initialProjectId && projects.some((p) => p.id === initialProjectId)
      ? initialProjectId
      : null;
  const [projectMode, setProjectMode] = useState<"existing" | "new" | "none">(
    initialProject ? "existing" : "none",
  );
  const [selectedProjectId, setSelectedProjectId] = useState(initialProject ?? "");
  const [newProjectName, setNewProjectName] = useState("");

  const [preferredDate, setPreferredDate] = useState("");
  const [preferredSlot, setPreferredSlot] = useState<ConsultSlot | "">("");

  const [useCustomAddress, setUseCustomAddress] = useState(addresses.length === 0);
  const [addressChoice, setAddressChoice] = useState(
    addresses.find((a) => a.label === "SITE")?.id ?? addresses[0]?.id ?? "",
  );
  const [customLine, setCustomLine] = useState("");
  const [customCity, setCustomCity] = useState("");
  const [customPincode, setCustomPincode] = useState("");

  const linkedProject = projects.find((p) => p.id === selectedProjectId) ?? null;
  const [projectKind, setProjectKind] = useState<ProjectKind>(linkedProject?.kind ?? "other");
  const [areaSqft, setAreaSqft] = useState("");
  const [requirements, setRequirements] = useState("");
  const [notes, setNotes] = useState("");

  const upload = useSignedUpload("SERVICE_DOCUMENT");
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [busy, setBusy] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);

  const startedRef = useRef(false);
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    track("service_booking_started", { service: defaultService?.slug ?? "" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!defaultService) {
    return <InlineError>There are no services to book right now.</InlineError>;
  }

  const selectedService = services.find((s) => s.slug === serviceSlug) ?? defaultService;
  const effectiveKind: BookingMode =
    selectedService.bookingMode === "quote" ? "QUOTE" : bookChoice;

  async function handleFilesSelected(list: FileList | null) {
    if (!list || list.length === 0) return;
    upload.clearError();
    const room = Math.max(0, 10 - files.length);
    const picked = Array.from(list).slice(0, room);
    for (const file of picked) {
      try {
        const uploaded = await upload.upload(file);
        setFiles((prev) => [...prev, uploaded]);
      } catch {
        /* `upload.error` already carries the message; nothing more to do
           per file — a failed one just does not join the list. */
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeFile(fileId: string) {
    setFiles((prev) => prev.filter((f) => f.fileId !== fileId));
  }

  const canAdvance =
    step === 0
      ? projectMode !== "existing" || Boolean(selectedProjectId)
      : step === 1
        ? Boolean(selectedService)
        : step === 2
          ? effectiveKind === "BOOKING"
            ? Boolean(preferredDate) && Boolean(preferredSlot)
            : true
          : step === 3
            ? (projectMode !== "new" || newProjectName.trim().length > 0) &&
              (useCustomAddress ? customLine.trim().length > 0 : Boolean(addressChoice)) &&
              requirements.trim().length >= 10
            : false;

  /* Maps a field the API rejected back to the step that owns it, so a
     customer who submits from Review lands on the box to fix rather than
     reading an error with nothing on screen to act on. */
  const FIELD_STEP: Record<string, number> = {
    serviceSlug: 1,
    kind: 1,
    preferredDate: 2,
    projectId: 0,
    addressId: 3,
    siteLine: 3,
    fileIds: 3,
    requirements: 3,
  };

  async function submit() {
    setBusy(true);
    setFields({});
    setMessage(null);

    try {
      const res = await fetch("/api/v1/services/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceSlug: selectedService.slug,
          kind: effectiveKind,
          projectId: projectMode === "existing" ? selectedProjectId : undefined,
          newProjectName: projectMode === "new" ? newProjectName.trim() : undefined,
          preferredDate: preferredDate || undefined,
          preferredSlot: preferredDate && preferredSlot ? preferredSlot : undefined,
          addressId: !useCustomAddress && addressChoice ? addressChoice : undefined,
          siteLine: useCustomAddress ? customLine.trim() : undefined,
          siteCity: useCustomAddress ? customCity.trim() : undefined,
          sitePincode: useCustomAddress ? customPincode.trim() : undefined,
          projectKind,
          areaSqft: areaSqft.trim() ? Number(areaSqft) : undefined,
          requirements: requirements.trim(),
          notes: notes.trim() || undefined,
          fileIds: files.map((f) => f.fileId),
        }),
      });

      const payload = await res.json();

      if (!res.ok) {
        const fieldErrors = payload?.error?.fields ?? {};
        setFields(fieldErrors);
        setMessage(
          Object.keys(fieldErrors).length > 0
            ? null
            : (payload?.error?.message ?? "Something went wrong. Please try again."),
        );
        const firstField = Object.keys(fieldErrors)[0];
        if (firstField && FIELD_STEP[firstField] !== undefined) {
          setStep(FIELD_STEP[firstField]);
        }
        return;
      }

      const reference = payload.data.booking.reference as string;
      track(
        effectiveKind === "BOOKING" ? "service_booked" : "quote_requested",
        effectiveKind === "BOOKING"
          ? { service: selectedService.slug, kind: "booking" }
          : { service: selectedService.slug },
      );
      router.push(`/account/services/${reference}?booked=1`);
    } catch {
      setMessage("We could not reach Quoin. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <Steps steps={STEP_LABELS} current={step} className="mb-8" />

      {step === 0 && (
        <StepPanel
          title="Which project is this for?"
          detail="Optional — link it so this shows up alongside that project's budget and materials."
        >
          <div className="space-y-2">
            {projects.map((p) => (
              <ChoiceCard
                key={p.id}
                active={projectMode === "existing" && selectedProjectId === p.id}
                onClick={() => {
                  setProjectMode("existing");
                  setSelectedProjectId(p.id);
                  setProjectKind(p.kind);
                }}
                title={p.name}
                detail={[PROJECT_KIND_LABEL[p.kind], p.location].filter(Boolean).join(" · ")}
              />
            ))}
            <ChoiceCard
              active={projectMode === "new"}
              onClick={() => setProjectMode("new")}
              title="Create a new project"
              detail="Name it on the site step, along with the rest of the job."
            />
            <ChoiceCard
              active={projectMode === "none"}
              onClick={() => setProjectMode("none")}
              title="Not linked to a project"
              detail="You can link it to a project later from your account."
            />
          </div>
        </StepPanel>
      )}

      {step === 1 && (
        <StepPanel
          title="Which service?"
          detail="Each one says what it covers, what it excludes, and how it is priced."
        >
          <div className="space-y-2">
            {services.map((s) => (
              <ChoiceCard
                key={s.slug}
                active={serviceSlug === s.slug}
                onClick={() => setServiceSlug(s.slug)}
                title={s.name}
                detail={s.summary}
                badge={s.bookingMode === "book" ? "Book a day" : "Quote first"}
              />
            ))}
          </div>

          {selectedService.bookingMode === "book" ? (
            <div className="mt-5">
              <span className="mb-1.5 block text-caption font-medium text-ink">
                How would you like to proceed?
              </span>
              <Tabs
                items={[
                  { id: "BOOKING" as const, label: "Book a day" },
                  { id: "QUOTE" as const, label: "Request a quote" },
                ]}
                value={bookChoice}
                onChange={setBookChoice}
                label="Booking mode"
                variant="segmented"
                className="w-full"
              />
            </div>
          ) : (
            <p className="mt-4 text-caption leading-relaxed text-muted">
              {selectedService.name} is quoted against a real scope — Quoin reviews your
              site details and sends a price. Nothing is booked to a fixed day yet.
            </p>
          )}
        </StepPanel>
      )}

      {step === 2 && (
        <StepPanel
          title="When would you like the visit?"
          detail={
            effectiveKind === "BOOKING"
              ? "This is your preferred window. A person at Quoin confirms the exact time by phone."
              : "Optional for a quote — Quoin will agree a visit day by phone once the scope is reviewed."
          }
        >
          <div className="rail gap-2 pb-1">
            {effectiveKind === "QUOTE" && (
              <DayChip
                label="No preference"
                active={preferredDate === ""}
                onPick={() => {
                  setPreferredDate("");
                  setPreferredSlot("");
                }}
              />
            )}
            {days.map((d) => (
              <DayChip
                key={d}
                label={formatConsultDay(d)}
                active={preferredDate === d}
                onPick={() => setPreferredDate(d)}
              />
            ))}
          </div>
          {fields.preferredDate && (
            <p className="mt-1 text-micro text-danger">{fields.preferredDate}</p>
          )}

          {preferredDate && (
            <div className="mt-4 flex flex-wrap gap-2">
              {CONSULT_SLOTS.map((s) => (
                <SlotChip
                  key={s}
                  label={CONSULT_SLOT_LABEL[s]}
                  checked={preferredSlot === s}
                  onChange={() => setPreferredSlot(s)}
                />
              ))}
            </div>
          )}
        </StepPanel>
      )}

      {step === 3 && (
        <StepPanel
          title="Tell us about the site"
          detail="Enough for someone at Quoin to prepare before the visit."
        >
          <div className="space-y-5">
            {projectMode === "new" && (
              <Field
                label="Project name"
                htmlFor="new-project-name"
                required
                error={fields.newProjectName}
              >
                <Input
                  id="new-project-name"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  maxLength={120}
                  placeholder="e.g. Andheri flat renovation"
                />
              </Field>
            )}
            {projectMode === "existing" && linkedProject && (
              <div>
                <span className="mb-1.5 block text-caption font-medium text-ink">Project</span>
                <p className="text-body-sm text-ink">{linkedProject.name}</p>
              </div>
            )}

            <div>
              <span className="mb-1.5 block text-caption font-medium text-ink">
                Site address
              </span>

              {addresses.length > 0 && !useCustomAddress && (
                <div className="space-y-2">
                  {addresses.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      aria-pressed={addressChoice === a.id}
                      onClick={() => setAddressChoice(a.id)}
                      className={cn(
                        "flex w-full items-start gap-3 rounded-card border p-3.5 text-left transition-colors",
                        addressChoice === a.id
                          ? "border-accent bg-accent-wash"
                          : "border-line-soft bg-surface hover:border-line-strong",
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border",
                          addressChoice === a.id
                            ? "border-accent bg-accent text-on-accent"
                            : "border-line-strong text-transparent",
                        )}
                      >
                        <Check className="size-3" strokeWidth={3} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-body-sm font-semibold text-ink">
                            {addressLabelText(a.label)}
                          </span>
                          {a.isDefault && (
                            <span className="rounded-sm bg-raised px-1.5 py-0.5 text-micro text-muted">
                              Default
                            </span>
                          )}
                        </span>
                        <span className="mt-0.5 block text-caption leading-relaxed text-muted">
                          {[a.line1, a.line2].filter(Boolean).join(", ")}
                          <br />
                          {a.city} {a.pincode}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {addresses.length > 0 && (
                <button
                  type="button"
                  className="mt-2 text-caption font-medium text-accent"
                  onClick={() => setUseCustomAddress((v) => !v)}
                >
                  {useCustomAddress ? "Use a saved address instead" : "Enter an address"}
                </button>
              )}

              {useCustomAddress && (
                <div className="mt-3 space-y-3">
                  <Field
                    label="Address"
                    htmlFor="site-line"
                    required
                    error={fields.siteLine}
                  >
                    <Textarea
                      id="site-line"
                      value={customLine}
                      onChange={(e) => setCustomLine(e.target.value)}
                      maxLength={300}
                      rows={2}
                      placeholder="Plot, street, landmark"
                    />
                  </Field>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="City" htmlFor="site-city">
                      <Input
                        id="site-city"
                        value={customCity}
                        onChange={(e) => setCustomCity(e.target.value)}
                        maxLength={120}
                      />
                    </Field>
                    <Field label="PIN code" htmlFor="site-pincode">
                      <Input
                        id="site-pincode"
                        value={customPincode}
                        onChange={(e) => setCustomPincode(e.target.value.replace(/\D/g, ""))}
                        maxLength={6}
                        inputMode="numeric"
                      />
                    </Field>
                  </div>
                </div>
              )}
            </div>

            <Field label="Project type" htmlFor="project-kind">
              <Select
                id="project-kind"
                value={projectKind}
                onChange={(e) => setProjectKind(e.target.value as ProjectKind)}
              >
                {(Object.keys(PROJECT_KIND_LABEL) as ProjectKind[]).map((k) => (
                  <option key={k} value={k}>
                    {PROJECT_KIND_LABEL[k]}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Approximate area" htmlFor="area-sqft" hint="Square feet, if you know it">
              <Input
                id="area-sqft"
                type="number"
                inputMode="numeric"
                min={1}
                max={1_000_000}
                value={areaSqft}
                onChange={(e) => setAreaSqft(e.target.value)}
                placeholder="e.g. 1200"
              />
            </Field>

            <Field
              label="What do you need done?"
              htmlFor="requirements"
              required
              hint={`${requirements.trim().length}/2000 · at least 10 characters`}
              error={fields.requirements}
            >
              <Textarea
                id="requirements"
                value={requirements}
                onChange={(e) => setRequirements(e.target.value)}
                maxLength={2000}
                rows={4}
                placeholder="Describe the scope, the problem, or what you'd like built"
              />
            </Field>

            <Field label="Additional notes" htmlFor="notes" hint="Optional">
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={1000}
                rows={2}
              />
            </Field>

            <div>
              <span className="mb-1.5 block text-caption font-medium text-ink">
                Photos or documents
              </span>
              <p className="mb-2 text-caption text-muted">
                Up to 10 files — photos of the site, or a drawing.
              </p>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
                className="hidden"
                onChange={(e) => handleFilesSelected(e.target.files)}
              />
              <div className="flex flex-wrap gap-2">
                {files.map((f) => (
                  <span
                    key={f.fileId}
                    className="flex items-center gap-2 rounded-lg border border-line-soft bg-surface px-3 py-2 text-caption text-ink"
                  >
                    <Document className="size-4 shrink-0 text-muted" />
                    <span className="max-w-40 truncate">{f.originalName}</span>
                    <button
                      type="button"
                      onClick={() => removeFile(f.fileId)}
                      aria-label={`Remove ${f.originalName}`}
                      className="text-muted hover:text-ink"
                    >
                      <Close className="size-3.5" />
                    </button>
                  </span>
                ))}
                {files.length < 10 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    loading={upload.uploading}
                    disabled={upload.uploading}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Camera className="size-4" />
                    Add files
                  </Button>
                )}
              </div>
              {upload.error && <p className="mt-2 text-micro text-danger">{upload.error}</p>}
            </div>
          </div>
        </StepPanel>
      )}

      {step === 4 && (
        <StepPanel
          title="Check it over"
          detail="Nothing is charged now — a booking or a quote request only starts the conversation."
        >
          <div className="space-y-3 rounded-card border border-line-soft bg-surface p-4">
            <ReviewRow label="Service" value={selectedService.name} />
            <ReviewRow
              label="Project"
              value={
                projectMode === "existing"
                  ? (linkedProject?.name ?? "—")
                  : projectMode === "new"
                    ? newProjectName.trim() || "New project"
                    : "Not linked"
              }
            />
            <ReviewRow
              label="Date"
              value={preferredDate ? formatConsultDay(preferredDate) : "To be agreed by phone"}
            />
            {preferredDate && preferredSlot && (
              <ReviewRow label="Time window" value={CONSULT_SLOT_LABEL[preferredSlot]} />
            )}
            <ReviewRow
              label="Address"
              value={
                useCustomAddress
                  ? [customLine, customCity].filter(Boolean).join(", ") || "—"
                  : (() => {
                      const a = addresses.find((x) => x.id === addressChoice);
                      return a ? `${addressLabelText(a.label)} — ${a.line1}, ${a.city}` : "—";
                    })()
              }
            />
            <ReviewRow label="Price" value={selectedService.pricing} />
            {files.length > 0 && (
              <ReviewRow label="Files" value={`${files.length} attached`} />
            )}
          </div>

          {message && (
            <div className="mt-4">
              <InlineError>{message}</InlineError>
            </div>
          )}
        </StepPanel>
      )}

      <div className="mt-6 flex items-center gap-3 pb-4">
        {step > 0 && (
          <Button variant="ghost" onClick={() => setStep((s) => s - 1)} disabled={busy}>
            <Back className="size-4" />
            Back
          </Button>
        )}
        {step < 4 && (
          <div className="ml-auto hidden lg:block">
            <Button disabled={!canAdvance} onClick={() => setStep((s) => s + 1)}>
              Continue
              <ArrowRight className="size-4" />
            </Button>
          </div>
        )}
        {step === 4 && (
          <div className="ml-auto hidden lg:block">
            <Button loading={busy} disabled={busy} onClick={submit}>
              {effectiveKind === "BOOKING" ? "Confirm Service" : "Request Quote"}
            </Button>
          </div>
        )}
      </div>

      <StickyBar>
        <div className="min-w-0 flex-1">
          <p className="text-body-sm font-semibold text-ink">{selectedService.name}</p>
          <p className="text-micro text-muted">
            Step {step + 1} of {STEP_LABELS.length} · {STEP_LABELS[step]}
          </p>
        </div>
        {step < 4 ? (
          <Button
            size="lg"
            className="shrink-0"
            disabled={!canAdvance}
            onClick={() => setStep((s) => s + 1)}
          >
            Continue
          </Button>
        ) : (
          <Button size="lg" className="shrink-0" loading={busy} disabled={busy} onClick={submit}>
            {effectiveKind === "BOOKING" ? "Confirm" : "Request quote"}
          </Button>
        )}
      </StickyBar>
    </div>
  );
}

/* ----------------------------------------------------------------- parts */

function StepPanel({
  title,
  detail,
  children,
}: {
  title: string;
  detail: string;
  children: React.ReactNode;
}) {
  return (
    <section className="anim-rise">
      <h2 className="font-display text-title font-semibold text-ink">{title}</h2>
      <p className="mt-1 max-w-prose text-body-sm leading-relaxed text-muted">{detail}</p>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function ChoiceCard({
  active,
  onClick,
  title,
  detail,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  detail?: string;
  badge?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex w-full items-start gap-3 rounded-card border p-4 text-left transition-colors",
        active
          ? "border-accent bg-accent-wash"
          : "border-line-soft bg-surface hover:border-line-strong",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border transition-colors",
          active ? "border-accent bg-accent text-on-accent" : "border-line-strong text-transparent",
        )}
      >
        <Check className="size-3" strokeWidth={3} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-body-sm font-semibold text-ink">{title}</span>
          {badge && (
            <Badge tone={badge === "Book a day" ? "success" : "info"} size="sm">
              {badge}
            </Badge>
          )}
        </span>
        {detail && (
          <span className="mt-0.5 block text-caption leading-relaxed text-muted">{detail}</span>
        )}
      </span>
    </button>
  );
}

/** Same visual contract as `ConsultForm`'s own day chip — deliberately not
    imported from there, since that component keeps its parts private and
    a booking is not a consultation. */
function DayChip({
  label,
  active,
  onPick,
}: {
  label: string;
  active: boolean;
  onPick: () => void;
}) {
  return (
    <label
      className={cn(
        "tap-target relative cursor-pointer whitespace-nowrap rounded-full border px-3.5 py-2 text-caption transition-colors",
        active
          ? "border-accent bg-accent text-on-accent"
          : "border-line bg-surface text-ink hover:border-accent-edge",
      )}
    >
      <input type="radio" name="preferred-day" checked={active} onChange={onPick} className="sr-only" />
      {label}
    </label>
  );
}

function SlotChip({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label
      className={cn(
        "tap-target relative cursor-pointer rounded-full border px-3.5 py-2 text-caption transition-colors",
        checked
          ? "border-accent bg-accent-wash text-accent"
          : "border-line bg-surface text-ink hover:border-accent-edge",
      )}
    >
      <input type="radio" name="preferred-slot" checked={checked} onChange={onChange} className="sr-only" />
      {label}
    </label>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 text-body-sm">
      <span className="shrink-0 text-muted">{label}</span>
      <span className="min-w-0 flex-1 text-right text-ink">{value}</span>
    </div>
  );
}

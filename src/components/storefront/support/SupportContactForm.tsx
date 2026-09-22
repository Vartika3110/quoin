"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Field, Input, Select, Textarea } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { InlineError } from "@/components/ui/ErrorState";
import { CheckCircle, Close } from "@/components/icons";
import { SUPPORT_CATEGORIES } from "@/lib/support/faq";
import type { SupportCategorySlug, SupportRequestView } from "@/lib/data/support";

/** What the "About" chip is attached to, if anything. Union rather than
    two optional strings, so the form can never hold both at once — a
    request is about one order or one booking, never both. */
type About = { kind: "order" | "booking"; reference: string } | null;

/**
 * "Contact support".
 *
 * The category and subject arrive pre-filled from the query string a
 * customer landed with (`/account/support?order=...&category=orders`, set
 * by other pages that link here) — see `defaultSubject` in
 * `src/lib/data/support.ts`, computed once on the server and passed down
 * rather than re-derived here, so the sentence shown matches exactly what
 * the API would have produced for the same input.
 */
export function SupportContactForm({
  defaultCategory,
  orderReference,
  bookingReference,
  defaultSubject,
}: {
  defaultCategory: SupportCategorySlug;
  orderReference?: string;
  bookingReference?: string;
  defaultSubject: string;
}) {
  const router = useRouter();

  const [category, setCategory] = useState<SupportCategorySlug>(defaultCategory);
  const [about, setAbout] = useState<About>(
    orderReference
      ? { kind: "order", reference: orderReference }
      : bookingReference
        ? { kind: "booking", reference: bookingReference }
        : null,
  );
  const [subject, setSubject] = useState(defaultSubject);
  const [message, setMessage] = useState("");

  const [busy, setBusy] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<SupportRequestView | null>(null);

  if (done) {
    return (
      <Card padding="lg">
        <span className="grid size-11 place-items-center rounded-full bg-success/10 text-success">
          <CheckCircle className="size-6" />
        </span>
        <h2 className="mt-3 font-display text-title-lg text-ink">
          Request {done.reference} received
        </h2>
        <p className="mt-1 text-body leading-relaxed text-muted">
          Someone from Quoin will get back to you using the contact details on
          your account.
        </p>
        <p className="mt-4 text-body-sm">
          <a href="/consult" className="font-medium text-accent hover:text-accent-bright">
            Prefer to talk? Request a call
          </a>
        </p>
      </Card>
    );
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setFields({});
    setError(null);

    try {
      const res = await fetch("/api/v1/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          subject,
          message,
          orderReference: about?.kind === "order" ? about.reference : undefined,
          bookingReference: about?.kind === "booking" ? about.reference : undefined,
        }),
      });
      const payload = await res.json();

      if (!res.ok) {
        const fieldErrors = payload?.error?.fields ?? {};
        setFields(fieldErrors);
        /* The banner is for failures that belong to no field — a rate
           limit, a stale reference, a 500. Once the API has pinned the
           problem to an input, repeating it at the top says the same
           thing twice. */
        setError(
          Object.keys(fieldErrors).length > 0
            ? null
            : (payload?.error?.message ?? "Something went wrong. Please try again."),
        );
        return;
      }

      setDone(payload.data.request as SupportRequestView);
      /* Re-reads "Your requests" below from the server so the new row
         appears there too, rather than hand-building a second copy of
         what that list looks like. */
      router.refresh();
    } catch {
      setError("We could not reach Quoin. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <Field label="Category" htmlFor="support-category">
        <Select
          id="support-category"
          value={category}
          onChange={(e) => setCategory(e.target.value as SupportCategorySlug)}
        >
          {SUPPORT_CATEGORIES.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.label}
            </option>
          ))}
        </Select>
      </Field>

      {about && (
        <p>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-accent-edge bg-accent-wash py-1 pl-3 pr-1.5 text-caption font-medium text-accent">
            About {about.kind === "order" ? "order" : "booking"} {about.reference}
            <button
              type="button"
              onClick={() => setAbout(null)}
              aria-label="Remove"
              className="grid size-5 shrink-0 place-items-center rounded-full transition-colors hover:bg-accent-wash-strong"
            >
              <Close className="size-3.5" />
            </button>
          </span>
        </p>
      )}

      <Field label="Subject" htmlFor="support-subject" error={fields.subject}>
        <Input
          id="support-subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          maxLength={120}
          aria-invalid={fields.subject ? true : undefined}
        />
      </Field>

      <Field
        label="Message"
        htmlFor="support-message"
        error={fields.message}
        hint={fields.message ? undefined : "The more detail, the less back-and-forth."}
      >
        <Textarea
          id="support-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={2000}
          rows={5}
          aria-invalid={fields.message ? true : undefined}
        />
      </Field>

      {error && <InlineError>{error}</InlineError>}

      <Button type="submit" loading={busy} disabled={busy}>
        Send request
      </Button>
    </form>
  );
}

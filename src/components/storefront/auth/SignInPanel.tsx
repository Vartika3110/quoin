"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Input";
import { InlineError } from "@/components/ui/ErrorState";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/components/ui/cn";
import { ArrowRight, Back, GoogleG, Phone, Shield } from "@/components/icons";
import { InvalidPhoneError, normalizePhone } from "@/lib/auth/phone";

/**
 * Sign in with a code.
 *
 * The OTP endpoints have existed since identity was built; nothing in the
 * storefront ever called them, so an account could only be created with
 * curl. This is that missing half.
 *
 * Sign-up and sign-in are one flow because the API makes them one call —
 * the account is created on first successful verification. The copy never
 * says "create an account" for that reason: the customer is not choosing
 * between two doors, and offering them would imply a distinction the
 * server does not make.
 *
 * Two states, not two routes. A verification screen at its own URL is a
 * screen that can be refreshed, deep-linked and arrived at with no
 * challenge outstanding, and every one of those ends in a dead end.
 */
export function SignInPanel({
  /** Where to go once the session exists. Defaults to the account. */
  next = "/account",
  onDone,
  googleEnabled,
  smsEnabled,
}: {
  next?: string;
  onDone?: () => void;
  /** Whether `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` are set —
      `isGoogleSignInConfigured()`, read by the server parent so the
      button never renders only to 404 or bounce back unavailable. */
  googleEnabled: boolean;
  /** `isOtpDeliveryAvailable()` — true in development regardless, false
      in production until MSG91's DLT template is approved. */
  smsEnabled: boolean;
}) {
  const router = useRouter();
  const toast = useToast();

  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);

  const codeRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);

  /* The resend cooldown the server told us about, counted down here so the
     button says how long rather than failing when pressed. */
  useEffect(() => {
    if (resendIn <= 0) return;
    const id = window.setInterval(() => setResendIn((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearInterval(id);
  }, [resendIn]);

  useEffect(() => {
    if (sentTo) codeRef.current?.focus();
  }, [sentTo]);

  async function post(path: string, body: unknown) {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as {
      data?: Record<string, unknown>;
      error?: { message: string };
    };
    if (!res.ok) throw new Error(json.error?.message ?? "Something went wrong.");
    return json.data ?? {};
  }

  async function requestCode() {
    /* Checked here before the network, because the button that runs this
       is no longer disabled while the field is empty. A disabled button
       is how a form tells somebody nothing at all: they press it, the
       page does not move, and there is no text on screen saying why.
       The same normaliser the server uses, so the two cannot disagree
       about what a valid Indian mobile number is. */
    try {
      normalizePhone(phone);
    } catch (e) {
      setError(
        e instanceof InvalidPhoneError
          ? e.message
          : "Enter a valid 10-digit Indian mobile number",
      );
      phoneRef.current?.focus();
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const data = await post("/api/v1/auth/otp/request", { phone });
      setSentTo(String(data.phone ?? phone));
      setResendIn(Number(data.resendAfterSeconds ?? 30));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    setBusy(true);
    setError(null);
    try {
      await post("/api/v1/auth/otp/verify", { phone, code });
      toast.success("Signed in");
      onDone?.();
      /* `refresh` as well as `push`: the session is a cookie, and every
         page that reads it is server-rendered, so without this the header
         and the account page would still be showing the signed-out tree. */
      router.push(next);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setCode("");
      codeRef.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  if (!googleEnabled && !smsEnabled) {
    /* Neither method is configured — an empty card with nothing to press
       would look broken; this says plainly that it is not ready rather
       than simulating a sign-in that cannot complete (invariant 8). */
    return (
      <p className="text-body-sm leading-relaxed text-muted">
        Sign-in isn&rsquo;t available yet. Please check back shortly.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {googleEnabled && (
        <a
          href={`/api/v1/auth/google/start?next=${encodeURIComponent(next)}`}
          /* A plain anchor, not `<Button href>` — this has to be a real
             browser navigation to an API route that 302s to Google, and
             Next's `Link` is written for client-side transitions between
             pages this app renders. Classes copied from `Button`'s
             `secondary` variant at `lg` (`src/components/ui/Button.tsx`)
             rather than importing constants that component does not
             export. */
          className={cn(
            "relative inline-flex h-13 w-full shrink-0 items-center justify-center gap-2 rounded-lg",
            "bg-deep text-on-deep shadow-xs transition-[background-color,box-shadow] duration-150 ease-out-quart",
            "hover:-translate-y-0.5 hover:bg-deep-soft hover:shadow-sm active:translate-y-0 active:bg-deep",
            "text-body-lg font-medium",
          )}
        >
          <GoogleG className="size-4.5" />
          Continue with Google
        </a>
      )}

      {googleEnabled && smsEnabled && (
        <div className="flex items-center gap-3 text-micro uppercase tracking-wide text-faint">
          <span className="h-px flex-1 bg-line-soft" aria-hidden />
          or
          <span className="h-px flex-1 bg-line-soft" aria-hidden />
        </div>
      )}

      {smsEnabled && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (busy) return;
            if (sentTo) void verify();
            else void requestCode();
          }}
          className="space-y-4"
        >
          {!sentTo ? (
            <>
              <Field
                label="Mobile number"
                htmlFor="phone"
                hint="Indian numbers only, with or without +91."
                required
              >
                <Input
                  id="phone"
                  ref={phoneRef}
                  name="phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  autoFocus
                  placeholder="98765 43210"
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    /* Cleared on the first keystroke after a rejection.
                       An error that outlives the thing it described
                       reads as a second, new failure. */
                    if (error) setError(null);
                  }}
                  leading={<Phone className="size-4" />}
                  aria-invalid={error ? true : undefined}
                />
              </Field>

              {error && <InlineError>{error}</InlineError>}

              {/* Not disabled on an empty field. The check moved into
                  `requestCode`, so pressing this says what is wrong
                  instead of doing nothing at all. */}
              <Button type="submit" block size="lg" loading={busy}>
                Send me a code
                <ArrowRight className="size-4" />
              </Button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  setSentTo(null);
                  setCode("");
                  setError(null);
                }}
                className="flex items-center gap-1.5 text-caption text-muted transition-colors hover:text-ink"
              >
                <Back className="size-4" />
                Change number
              </button>

              <Field
                label="Enter the code"
                htmlFor="code"
                hint={`Sent to ${sentTo}. It expires in a few minutes.`}
                required
              >
                <Input
                  id="code"
                  ref={codeRef}
                  name="one-time-code"
                  type="text"
                  inputMode="numeric"
                  /* Lets iOS and Android offer the code straight from the SMS
                     rather than making the customer switch apps to read it. */
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="••••••"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  className="nums tracking-[0.5em]"
                  aria-invalid={error ? true : undefined}
                />
              </Field>

              {error && <InlineError>{error}</InlineError>}

              <Button
                type="submit"
                block
                size="lg"
                loading={busy}
                disabled={code.length < 6}
              >
                Verify and continue
              </Button>

              <Button
                type="button"
                variant="ghost"
                block
                disabled={resendIn > 0 || busy}
                onClick={() => void requestCode()}
              >
                {resendIn > 0 ? `Resend in ${resendIn}s` : "Send another code"}
              </Button>
            </>
          )}

          <p className="flex items-start gap-2 text-micro leading-relaxed text-faint">
            <Shield className="mt-0.5 size-3.5 shrink-0" />
            Quoin has no password to forget. A code is sent to your phone each
            time, and your number is never shown in full back to you.
          </p>
        </form>
      )}
    </div>
  );
}

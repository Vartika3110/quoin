"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Input";
import { OtpInput } from "@/components/ui/OtpInput";
import { InlineError } from "@/components/ui/ErrorState";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/components/ui/cn";
import {
  ArrowRight,
  Back,
  CheckCircle,
  GoogleG,
  Phone,
  Shield,
} from "@/components/icons";
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
  /** `isSupabaseAuthConfigured()` — whether Supabase Auth, which now
      mints and checks the code, has a URL and an anon key. No longer
      true-in-development-regardless: there is no console fallback behind
      Supabase, so an unconfigured deploy must say so rather than offer a
      box that answers 503. */
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

  /**
   * Verified, and now waiting on the navigation.
   *
   * A terminal state, never reset: the session cookie exists by the time
   * this is true, so there is nothing to go back to. It also covers a real
   * gap rather than decorating one — `router.push` to a server-rendered
   * page is a round trip, and without this the customer watches a spinner
   * on a button they have already succeeded at pressing.
   */
  const [done, setDone] = useState(false);

  /**
   * Bumped on every rejected code, and used as the `OtpInput` key.
   *
   * Remounting is how the boxes get refocused from the start after a wrong
   * code. The alternative is an imperative handle on the child purely to
   * call `focus`, and the value lives up here, so a remount costs nothing
   * and leaves `OtpInput` with no API beyond the value it renders.
   */
  const [attempt, setAttempt] = useState(0);

  const phoneRef = useRef<HTMLInputElement>(null);

  /* The resend cooldown the server told us about, counted down here so the
     button says how long rather than failing when pressed. */
  useEffect(() => {
    if (resendIn <= 0) return;
    const id = window.setInterval(() => setResendIn((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearInterval(id);
  }, [resendIn]);

  /* The code field focuses itself on mount (`autoFocus` on the first box),
     so the effect that used to chase it with a ref is gone. */

  /**
   * One POST, with every failure already turned into something worth
   * reading.
   *
   * Three distinct failures used to arrive here as raw text: a dropped
   * connection surfaced the browser's own "Failed to fetch", a 502 from
   * the platform returned an HTML error page that `res.json()` threw on,
   * and both ended up in the panel as either jargon or
   * "Something went wrong." Each gets its own sentence now, because
   * "check your connection" and "try again shortly" ask the customer to
   * do different things.
   */
  async function post(path: string, body: unknown) {
    let res: Response;
    try {
      res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      /* `fetch` rejects only for transport failures — offline, DNS, a
         killed request. Never for a 4xx or 5xx, which resolve normally. */
      throw new Error(
        "We could not reach Quoin. Check your connection and try again.",
      );
    }

    let json: { data?: Record<string, unknown>; error?: { message: string } };
    try {
      json = await res.json();
    } catch {
      /* A response that is not JSON did not come from the API — it is a
         gateway or platform error page. Nothing in it is worth showing. */
      throw new Error(
        res.ok
          ? "We got an unexpected response. Please try again."
          : "Something went wrong on our side. Please try again shortly.",
      );
    }

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
      /* A resend must clear whatever was typed against the old code.
         Leaving it would show six filled boxes holding a code the server
         has just superseded, and the customer would press Verify on it. */
      setCode("");
      setAttempt((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  /**
   * `submitted` is passed explicitly by the auto-submit path.
   *
   * `OtpInput` calls `onComplete` from the same handler that produced the
   * final digit, so `code` in this closure is still five characters long
   * at that moment — React has not re-rendered. Reading state here would
   * verify the wrong code on every automatic submit.
   */
  async function verify(submitted?: string) {
    const value = submitted ?? code;
    if (value.length < 6) return;

    setBusy(true);
    setError(null);
    try {
      await post("/api/v1/auth/otp/verify", { phone, code: value });
      /* Shown before navigating, not after: `push` to a server-rendered
         page takes a moment, and this is what fills it. */
      setDone(true);
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
      /* Remounts the boxes, which refocuses the first one — see `attempt`. */
      setAttempt((n) => n + 1);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    /* Replaces the form outright rather than sitting above it. The session
       exists; leaving a phone field and a Verify button on screen invites a
       customer to start a second sign-in over the top of the navigation
       that is already in flight. */
    return (
      <div
        className="flex flex-col items-center gap-3 py-6 text-center"
        role="status"
        aria-live="polite"
      >
        <CheckCircle className="size-9 text-accent" />
        <div>
          <p className="text-body-lg font-medium text-ink">
            Verified
          </p>
          <p className="mt-1 text-body-sm leading-relaxed text-muted">
            Taking you back to where you left off…
          </p>
        </div>
      </div>
    );
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
                error={error ?? undefined}
                required
              >
                <OtpInput
                  /* Remounted on each rejection so the first box takes
                     focus again — see `attempt`. */
                  key={attempt}
                  id="code"
                  value={code}
                  onChange={setCode}
                  /* Submits itself on the sixth digit. The button below
                     stays, because autofill and paste can both land a
                     complete code while the request is already in flight,
                     and because a form with no visible action to press is
                     disorienting even when it does not need one. */
                  onComplete={(value) => {
                    if (!busy) void verify(value);
                  }}
                  disabled={busy}
                  invalid={Boolean(error)}
                  describedBy="code-msg"
                  autoFocus
                />
              </Field>

              {/* No `InlineError` here: `Field` above now renders the
                  error into `#code-msg`, which the boxes point at through
                  `aria-describedby`. Printing it twice was two different
                  failures as far as a screen reader is concerned. */}

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

"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Input";
import { InlineError } from "@/components/ui/ErrorState";
import { useToast } from "@/components/ui/Toast";
import { ArrowRight, Back, Phone, Shield } from "@/components/icons";

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
}: {
  next?: string;
  onDone?: () => void;
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

  return (
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
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              autoFocus
              placeholder="98765 43210"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              leading={<Phone className="size-4" />}
              aria-invalid={error ? true : undefined}
            />
          </Field>

          {error && <InlineError>{error}</InlineError>}

          <Button type="submit" block size="lg" loading={busy} disabled={!phone.trim()}>
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
  );
}

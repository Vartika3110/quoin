"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Drawer } from "@/components/ui/Drawer";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { ProductCard } from "@/components/storefront/ProductCard";
import { SERVICE_ICON } from "@/components/storefront/ServiceCard";
import { Camera, Headset, Mic, Search, Upload } from "@/components/icons";
import { cn } from "@/components/ui/cn";
import { ImagePrepareError, isImageFile, prepareImageForUpload } from "@/lib/parcha-image";
import type { AiMatch, AssistResult, VisualSearchResult } from "@/components/storefront/ai/types";

/**
 * Searching Quoin with a camera or with your voice.
 *
 * One sheet for both, because they are the same act with two inputs:
 * *here is what I mean, find it*. The answer has the same shape either
 * way — a line saying what Quoin understood, then real catalogue rows
 * under each thing it identified — so a second component would be the
 * same list rendered twice.
 *
 * ## What is honest about this screen
 *
 * Every product below is a row Postgres really holds, matched by
 * `src/lib/data/ai-match.ts` against a bar it has to clear. An
 * identification that matched nothing is **still shown**, saying so, with
 * its department as the way forward. That is deliberate: a customer who
 * photographs a ceiling fan and gets four taps learns that this feature
 * guesses, and stops trusting the rest of the catalogue with it. One that
 * gets "Ceiling fan — we don't stock these; try Electricals & Lighting"
 * learns something true.
 *
 * ## The microphone does its listening on the device
 *
 * Speech is transcribed by the Web Speech API in the browser — no audio
 * leaves the phone, and it costs nothing. Only the *text* is posted, and
 * only the interpretation of it needs a model. Where the API is absent
 * (Firefox) the voice mode is not offered at all rather than offered and
 * broken; see `VoiceSearch` for the same rule in the search field itself.
 */

export type AiSearchMode = "photo" | "voice";

/* ---- The Web Speech API ---------------------------------------------------
 *
 * Not in TypeScript's DOM lib. Only the members used here are declared,
 * for the reason `VoiceSearch` records: a full ambient definition of a
 * vendor-prefixed API that two browsers implement differently is a
 * liability rather than an asset. */
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult:
    | ((event: {
        results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
      }) => void)
    | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
}

type RecognitionConstructor = new () => SpeechRecognitionLike;

function getRecognition(): RecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function speechIsAvailable(): boolean {
  return getRecognition() !== null;
}

/** ---- The sheet --------------------------------------------------------- */

export function AiSearchSheet({
  open,
  mode,
  onClose,
}: {
  open: boolean;
  mode: AiSearchMode;
  onClose: () => void;
}) {
  return (
    <Drawer
      open={open}
      onClose={onClose}
      side="responsive"
      title={mode === "photo" ? "Search by photo" : "Ask Quoin"}
      description={
        mode === "photo"
          ? "Photograph a product and we will find what we stock like it."
          : "Say what you need. We will look for the products and the trades."
      }
      className="lg:w-[34rem]"
    >
      {/* No `open` prop and no reset effects: `Drawer` returns null when
          closed, so these unmount and the next open starts clean. State
          cleared in an effect would be a cascading render for a result
          nobody is looking at. */}
      {mode === "photo" ? <PhotoSearch /> : <VoiceAssistant />}
    </Drawer>
  );
}

/** ---- Photo ------------------------------------------------------------- */

function PhotoSearch() {
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VisualSearchResult | null>(null);

  /* Revoked on replacement and on unmount: an object URL holds the whole
     decoded image alive, and a customer trying four photographs of the
     same wall would otherwise keep all four in memory. */
  const previewUrl = useRef<string | null>(null);
  useEffect(
    () => () => {
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    },
    [],
  );

  const search = useCallback(async (file: File) => {
    setError(null);
    setResult(null);
    setBusy(true);

    try {
      /* Re-encoded in the browser before it is sent: a modern phone
         photograph is 4-8MB and the platform refuses a body much past
         4.5MB, so this is what makes the feature work on the device it is
         designed for. Also converts HEIC, which OpenAI will not read. */
      const prepared = isImageFile(file) ? await prepareImageForUpload(file) : file;

      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
      previewUrl.current = URL.createObjectURL(prepared);
      setPreview(previewUrl.current);

      const body = new FormData();
      body.append("photo", prepared);

      const response = await fetch("/api/v1/search/visual", { method: "POST", body });
      const payload = (await response.json()) as
        | { data: VisualSearchResult }
        | { error: { message: string } };

      if (!response.ok || "error" in payload) {
        setError(
          "error" in payload
            ? payload.error.message
            : "We could not search that photo. Try again in a moment.",
        );
        return;
      }
      setResult(payload.data);
    } catch (cause) {
      /* `prepareImageForUpload` throws this for a file the canvas cannot
         decode — a corrupt download, or a format the browser does not
         know. Its own message names the problem, so it is shown. */
      setError(
        cause instanceof ImagePrepareError
          ? cause.message
          : "We could not search that photo. Check your connection and try again.",
      );
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <div className="space-y-5">
      {/* Two controls, because they are two different acts on a phone:
          `capture="environment"` opens the rear camera directly, and the
          plain input opens the gallery. One input with both behaviours
          does not exist — a browser picks one. */}
      <div className="grid grid-cols-2 gap-3">
        <FilePick
          label="Take a photo"
          Icon={Camera}
          capture
          disabled={busy}
          onPick={search}
        />
        <FilePick label="Choose a photo" Icon={Upload} disabled={busy} onPick={search} />
      </div>

      {preview && (
        <div className="flex items-start gap-3 rounded-card border border-line-soft bg-raised p-3">
          {/* A plain `img`, not `next/image`: this is a blob URL for bytes
              that exist only in this tab, so there is nothing for the
              optimiser to fetch, resize or cache. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt="The photo you are searching with"
            className="size-20 shrink-0 rounded-lg object-cover"
          />
          <div className="min-w-0 flex-1">
            {busy ? (
              <p className="flex items-center gap-2 text-caption text-muted">
                <Spinner className="size-4" />
                Looking at your photo…
              </p>
            ) : (
              <p className="text-caption text-muted">
                {result?.summary || "Searching the catalogue for what is in it."}
              </p>
            )}
          </div>
        </div>
      )}

      {error && <Problem message={error} />}

      {result?.note && !error && (
        <Problem
          message={result.note}
          /* Not a failure: the photograph was read fine and held nothing
             Quoin sells. Different colour, different word. */
          tone="neutral"
        />
      )}

      {result?.matches.map((match, i) => <MatchBlock key={`${match.label}-${i}`} match={match} />)}

      {!preview && !busy && (
        <Guidance
          lines={[
            "Get the product in the middle of the frame and fill it.",
            "A tile, a tap, a hinge, a light fitting — one thing at a time works best.",
            "A photo of a whole room works too: we will pick out what is buyable in it.",
          ]}
        />
      )}
    </div>
  );
}

/** ---- Voice ------------------------------------------------------------- */

function VoiceAssistant() {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AssistResult | null>(null);

  const recognition = useRef<SpeechRecognitionLike | null>(null);

  const ask = useCallback(async (text: string) => {
    const said = text.trim();
    if (said.length < 2) return;

    setError(null);
    setResult(null);
    setBusy(true);
    try {
      const response = await fetch("/api/v1/search/assist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ transcript: said }),
      });
      const payload = (await response.json()) as
        | { data: AssistResult }
        | { error: { message: string } };

      if (!response.ok || "error" in payload) {
        setError(
          "error" in payload
            ? payload.error.message
            : "We could not work that out. Try again, or search by typing.",
        );
        return;
      }
      setResult(payload.data);
    } catch {
      setError("We could not reach Quoin. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }, []);

  /* Closing the sheet unmounts this, and unmounting must stop the
     microphone: one left listening on a storefront is a microphone
     nobody expects. No `open` dependency, because there is no open
     state to watch — `Drawer` renders null when closed. */
  useEffect(() => {
    const current = recognition;
    return () => current.current?.stop();
  }, []);

  function toggle() {
    const Recognition = getRecognition();
    if (!Recognition) return;

    if (listening) {
      recognition.current?.stop();
      return;
    }

    const instance = new Recognition();
    /* Indian English: the catalogue is full of brand names and trade
       terms — "Jaquar", "parcha", "CPVC" — that en-US models mangle. */
    instance.lang = "en-IN";
    /* `continuous` here, unlike the search field's single shot: somebody
       describing a job speaks in clauses with pauses in them, and a
       recogniser that stops at the first silence cuts them off mid-
       sentence. `interimResults` is what puts the words on screen as
       they are said, so the pause does not read as a hang. */
    instance.continuous = true;
    instance.interimResults = true;

    let final = "";
    instance.onresult = (event) => {
      let interim = "";
      for (let i = 0; i < event.results.length; i += 1) {
        const result = event.results[i];
        const text = result?.[0]?.transcript ?? "";
        if (result.isFinal) final += text;
        else interim += text;
      }
      setTranscript((final + interim).trimStart());
    };
    /* Denied permission, no network, or nothing heard all end here. None
       of them deserve an alert: the textarea below is right there. */
    instance.onerror = () => setListening(false);
    instance.onend = () => {
      setListening(false);
      /* Asked on `onend` rather than on every final result: one request
         per utterance, when the speaker has actually stopped. */
      const said = final.trim();
      if (said.length >= 2) void ask(said);
    };

    recognition.current = instance;
    setTranscript("");
    setResult(null);
    setError(null);
    setListening(true);
    instance.start();
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col items-center gap-3 rounded-card border border-line-soft bg-raised p-5">
        <button
          type="button"
          onClick={toggle}
          disabled={busy}
          aria-pressed={listening}
          aria-label={listening ? "Stop listening" : "Start listening"}
          className={cn(
            "grid size-16 place-items-center rounded-full transition-all duration-200",
            listening
              ? "bg-accent text-on-accent shadow-md"
              : "bg-accent-wash text-accent hover:bg-accent-wash-strong",
            busy && "opacity-60",
          )}
        >
          {busy ? <Spinner className="size-6" /> : <Mic className={cn("size-7", listening && "anim-pop")} />}
        </button>

        <p className="text-center text-caption text-muted" role="status">
          {busy
            ? "Working out what you need…"
            : listening
              ? "Listening — say what you are looking for."
              : "Tap and speak. Hindi or English."}
        </p>
      </div>

      {/* The transcript is editable. Speech recognition mishears trade
          words constantly — "CPVC" comes back "see pvc" — and a customer
          who can see the mistake can fix it in one tap instead of
          repeating the whole sentence. */}
      {(transcript || result) && (
        <div className="space-y-2">
          <label htmlFor="ai-transcript" className="text-micro font-medium text-muted">
            What we heard
          </label>
          <textarea
            id="ai-transcript"
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            rows={2}
            className="w-full resize-none rounded-lg border border-line bg-surface px-3 py-2 text-body text-ink outline-none focus:border-accent"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => void ask(transcript)}
            disabled={busy || transcript.trim().length < 2}
          >
            <Search className="size-4" />
            Search for this
          </Button>
        </div>
      )}

      {error && <Problem message={error} />}

      {result && (
        <>
          {result.reply && (
            <p className="rounded-card border border-accent-edge bg-accent-wash px-4 py-3 text-body text-ink">
              {result.reply}
            </p>
          )}

          {result.services.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-caption font-semibold text-ink">Someone to do the work</h3>
              <div className="space-y-2">
                {result.services.map((service) => {
                  const Icon = SERVICE_ICON[service.icon];
                  return (
                    <Link
                      key={service.slug}
                      href={`/services/${service.slug}`}
                      className="flex items-center gap-3 rounded-card border border-line-soft bg-surface p-3 transition-colors hover:bg-hover"
                    >
                      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-wash text-accent">
                        <Icon className="size-5" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-caption font-semibold text-ink">
                          {service.name}
                        </span>
                        <span className="block truncate text-micro text-muted">
                          {service.summary}
                        </span>
                      </span>
                    </Link>
                  );
                })}
              </div>
            </section>
          )}

          {result.matches.map((match, i) => (
            <MatchBlock key={`${match.label}-${i}`} match={match} />
          ))}

          {/* The follow-up is shown, not asked. Making somebody answer a
              question before they see anything turns a search box into a
              form. */}
          {result.followUp && (
            <p className="text-caption text-muted">
              <span className="font-medium text-ink">One thing: </span>
              {result.followUp}
            </p>
          )}

          {/* Advice is not this component's job — see the note at the top
              of `src/lib/ai/assistant.ts`. When somebody is asking what
              they *should* do, the honest answer is a person. */}
          {result.suggestConsult && (
            <div className="rounded-card border border-accent-edge bg-accent-wash p-4">
              <p className="text-caption text-ink">
                That is a judgement call, and a 15–20 minute call with one of our experts will
                answer it better than a search will.
              </p>
              <Button href="/consult" variant="primary" size="sm" className="mt-3">
                <Headset className="size-4" />
                Talk to an expert
              </Button>
            </div>
          )}

          {result.intent === "unclear" &&
            result.matches.length === 0 &&
            result.services.length === 0 && (
              <Guidance
                lines={[
                  'Try naming the thing: "anti-skid bathroom tiles".',
                  'Or the job: "someone to fix a leaking tap in Pitampura".',
                  "Hindi and Hinglish both work.",
                ]}
              />
            )}
        </>
      )}
    </div>
  );
}

/** ---- Shared pieces ----------------------------------------------------- */

/**
 * One identification, with what Quoin stocks under it.
 *
 * The empty case is a first-class state rather than a hidden row. See the
 * note at the top of this file.
 */
function MatchBlock({ match }: { match: AiMatch }) {
  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <h3 className="text-caption font-semibold text-ink">{match.label}</h3>
        {match.detail && <span className="text-micro text-muted">{match.detail}</span>}
        {match.brand && (
          <span className="rounded-full bg-accent-wash px-2 py-0.5 text-micro font-medium text-accent">
            {match.brand}
          </span>
        )}
      </div>

      {match.products.length > 0 ? (
        <div className="rail gap-3 pb-1">
          {match.products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      ) : (
        <p className="text-micro text-muted">
          We do not stock this.{" "}
          {match.department ? (
            <>
              <Link
                href={`/c/${match.department.slug}`}
                className="font-medium text-accent underline-offset-2 hover:underline"
              >
                Browse {match.department.name}
              </Link>{" "}
              for what we do have.
            </>
          ) : (
            <>
              Try{" "}
              <Link
                href="/consult"
                className="font-medium text-accent underline-offset-2 hover:underline"
              >
                asking an expert
              </Link>
              .
            </>
          )}
        </p>
      )}
    </section>
  );
}

function FilePick({
  label,
  Icon,
  capture = false,
  disabled,
  onPick,
}: {
  label: string;
  Icon: typeof Camera;
  capture?: boolean;
  disabled?: boolean;
  onPick: (file: File) => void;
}) {
  const input = useRef<HTMLInputElement>(null);

  return (
    <>
      <Button
        variant="outline"
        size="md"
        onClick={() => input.current?.click()}
        disabled={disabled}
        className="w-full"
      >
        <Icon className="size-4.5" />
        {label}
      </Button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        {...(capture ? { capture: "environment" as const } : {})}
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          /* Cleared so picking the same file twice fires `change` again —
             without this, retrying after a failure does nothing. */
          e.target.value = "";
          if (file) onPick(file);
        }}
      />
    </>
  );
}

function Problem({ message, tone = "error" }: { message: string; tone?: "error" | "neutral" }) {
  return (
    <p
      role="status"
      className={cn(
        "rounded-card border px-4 py-3 text-caption",
        tone === "error"
          ? "border-danger/30 bg-danger-wash text-danger"
          : "border-line-soft bg-raised text-muted",
      )}
    >
      {message}
    </p>
  );
}

function Guidance({ lines }: { lines: string[] }) {
  return (
    <ul className="space-y-1.5">
      {lines.map((line) => (
        <li key={line} className="flex gap-2 text-micro text-muted">
          <span aria-hidden className="text-accent">
            •
          </span>
          {line}
        </li>
      ))}
    </ul>
  );
}

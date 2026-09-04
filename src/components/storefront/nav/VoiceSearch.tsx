"use client";

import { useEffect, useRef, useState } from "react";
import { useHydrated } from "@/lib/store/hydrated";
import { Mic } from "@/components/icons";
import { cn } from "@/components/ui/cn";

/**
 * Search by voice.
 *
 * Genuinely useful here rather than a gimmick: the person searching is
 * often on a site with dusty hands, holding a phone in one of them, and
 * "hafele concealed hinge" is a miserable thing to thumb-type. It is also
 * how someone who knows the material by name but not its spelling finds it.
 *
 * Built on the Web Speech API, which is Chrome, Edge and Safari — and
 * absent in Firefox. The button **renders nothing at all** where it is not
 * supported, rather than appearing and failing on press: a dead control is
 * worse than a missing one.
 *
 * Recognition is single-shot and non-continuous. A microphone that stays
 * open on a storefront is a microphone nobody expects, and one utterance is
 * all a search box needs.
 */

/* The API is not in TypeScript's DOM lib, and only the handful of members
   used here are declared — a full ambient definition for a vendor-prefixed
   API that two browsers implement differently is a liability, not an asset. */
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
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

export function VoiceSearch({
  onTranscript,
  className,
}: {
  /** Called with what was heard, once. */
  onTranscript: (text: string) => void;
  className?: string;
}) {
  const [listening, setListening] = useState(false);
  const recognition = useRef<SpeechRecognitionLike | null>(null);
  const hydrated = useHydrated();

  /* Stop listening if the palette closes with the microphone open. */
  useEffect(() => {
    const current = recognition;
    return () => current.current?.stop();
  }, []);

  /* Feature detection is a pure read of `window`, so it can happen during
     render — but only once the client has taken over. The server render
     and the hydrating one both say "unsupported", which is also the right
     answer for Firefox, so nothing flashes and nothing mismatches. */
  if (!hydrated || getRecognition() === null) return null;

  function start() {
    const Recognition = getRecognition();
    if (!Recognition) return;

    if (listening) {
      recognition.current?.stop();
      return;
    }

    const instance = new Recognition();
    /* Indian English: the catalogue is full of brand names and trade terms
       — "Jaquar", "parcha", "CPVC" — that en-US models mangle. */
    instance.lang = "en-IN";
    instance.continuous = false;
    instance.interimResults = false;

    instance.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript;
      if (transcript) onTranscript(transcript.trim());
    };
    /* Denied permission, no network, or nothing heard all end here. None
       of them deserve a message: the text field is right there. */
    instance.onerror = () => setListening(false);
    instance.onend = () => setListening(false);

    recognition.current = instance;
    setListening(true);
    instance.start();
  }

  return (
    <button
      type="button"
      onClick={start}
      aria-pressed={listening}
      aria-label={listening ? "Stop listening" : "Search by voice"}
      className={cn(
        "grid size-10 shrink-0 place-items-center rounded-lg transition-colors",
        listening
          ? "bg-accent text-on-accent"
          : "text-muted hover:bg-hover hover:text-ink",
        className,
      )}
    >
      <Mic className={cn("size-5", listening && "anim-pop")} />
      {listening && (
        /* The visible state is the filled button; this is the same fact
           for a screen reader, which cannot see it. */
        <span className="sr-only" role="status">
          Listening
        </span>
      )}
    </button>
  );
}

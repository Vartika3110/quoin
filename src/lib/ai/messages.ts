import type { AiFailure } from "@/lib/ai/client";

/**
 * What a customer is told when an AI feature cannot answer.
 *
 * One sentence per reason, written for somebody standing on a site with a
 * phone in one hand. None of them quote the upstream error — see the note
 * at the top of `src/lib/ai/client.ts` — and all of them leave a door
 * open, because every one of these features has a manual path beside it:
 * type the search, browse the department, book a consultation.
 *
 * Shared across the three AI routes rather than written per route, so the
 * voice assistant and the camera do not describe the same outage in two
 * different registers.
 */
export const AI_MESSAGE: Record<AiFailure, string> = {
  not_configured:
    "This feature is not switched on yet. You can still search by typing, or browse the departments.",
  unsupported:
    "We cannot read that kind of file. Try a JPG, PNG or WEBP photograph.",
  empty:
    "We could not find anything we sell in that photo. Try getting closer to the product, or search by typing.",
  invalid_response: "We could not read that cleanly. Try once more, or search by typing.",
  rate_limited:
    "We are handling a lot of these just now. Wait a minute and try again.",
  timeout: "That took too long. Try a smaller photo, or search by typing.",
  upstream: "We could not do that just now. Try again in a moment.",
};

/** The same for the voice assistant, where "photo" is the wrong noun. */
export const ASSIST_MESSAGE: Record<AiFailure, string> = {
  ...AI_MESSAGE,
  empty: "We did not catch that. Try saying it again, or search by typing.",
  unsupported: "We did not catch that. Try saying it again, or search by typing.",
  timeout: "That took too long. Try saying it again, or search by typing.",
};

import { randomBytes } from "node:crypto";
import { env } from "@/lib/env";

/**
 * The video room a consultation meets in.
 *
 * Behind a thin seam — a room *name* in the database and a URL built
 * here — for the reason `StoredFile.storageKey` is not a URL and
 * `auth/whatsapp.ts` hides its gateway: which provider is live is
 * environment configuration, and a URL written into a row pins that row
 * to whoever was running the day it was created. Moving to Daily, 100ms
 * or a self-hosted Jitsi is this file and nothing else.
 *
 * ## Jitsi Meet, and exactly what that buys
 *
 * `meet.jit.si` needs no account, no API key and no SDK: a URL is a room,
 * and both sides join it in a browser. That is why it is the default —
 * the feature works on the day it ships rather than on the day somebody
 * finishes a video vendor's onboarding.
 *
 * What it does **not** buy, stated plainly because it is the kind of
 * thing that is discovered at the wrong moment:
 *
 *  - **The room name is the access control.** A public Jitsi room is open
 *    to anyone who knows its name, and there is no waiting room and no
 *    host approval. So the name is 20 random bytes rather than anything
 *    derived from the reference, the phone number or the customer's name
 *    — see `mintRoomName`. Guessing one is not feasible; *forwarding* one
 *    is, which is why the link is only ever shown to the customer who
 *    booked it and the staff handling it.
 *  - **No recording, and no transcript.** Nothing in this app claims
 *    either.
 *  - **No capacity guarantee.** It is a free public service. That is an
 *    argument for `JITSI_DOMAIN` existing, not for not shipping.
 *
 * `JITSI_DOMAIN` points this at a self-hosted deployment or at Jitsi as a
 * Service without a code change. Unset, it is the public instance.
 */

const DEFAULT_DOMAIN = "meet.jit.si";

export function videoDomain(): string {
  const configured = env.JITSI_DOMAIN?.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  return configured && configured.length > 0 ? configured : DEFAULT_DOMAIN;
}

/**
 * A fresh room name.
 *
 * Prefixed so a Quoin room is recognisable in a provider's logs, then 20
 * random bytes base32-ish encoded. **Nothing derived from the booking**:
 * a room named after the reference code would be guessable by anyone who
 * has ever seen a Quoin reference, and the room name is the only thing
 * standing between a stranger and a customer's consultation.
 *
 * Lower case and digits only, with no padding: Jitsi treats a room name
 * case-insensitively in some paths and a mixed-case name has quietly
 * resolved to a different room than the one in the link.
 */
export function mintRoomName(): string {
  const raw = randomBytes(20).toString("base64url").toLowerCase().replace(/[^a-z0-9]/g, "");
  return `quoin-${raw}`;
}

/** The URL both sides open. */
export function meetingUrl(room: string): string {
  return `https://${videoDomain()}/${encodeURIComponent(room)}`;
}

/**
 * Whether a consultation's room should be open yet.
 *
 * Open from ten minutes before the start until an hour after it, which is
 * generous at both ends on purpose: a customer who joins early should
 * find the room rather than a locked door, and a call that runs long
 * should not be cut off by this app. Outside that window the join page
 * shows the time instead of the link, so a stale tab cannot drop somebody
 * into an empty room at midnight and leave them wondering.
 */
const OPEN_BEFORE_MINUTES = 10;
const OPEN_AFTER_MINUTES = 60;

export function roomIsOpen(input: { startsAt: Date; now: Date }): boolean {
  const start = input.startsAt.getTime();
  const now = input.now.getTime();
  return (
    now >= start - OPEN_BEFORE_MINUTES * 60_000 && now <= start + OPEN_AFTER_MINUTES * 60_000
  );
}

export { OPEN_BEFORE_MINUTES as VIDEO_OPEN_BEFORE_MINUTES };

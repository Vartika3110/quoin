import assert from "node:assert/strict";
import { describe, it } from "node:test";

/* env.ts validates at import time — the same setup every other test file
   uses. Only DATABASE_URL and AUTH_SECRET are required by the schema. */
process.env.DATABASE_URL ??= "postgresql://localhost:5432/quoin_test";
process.env.AUTH_SECRET ??= "test-secret-at-least-32-characters-long!!";

const {
  CONSULT_CONCURRENT_EXPERTS,
  CONSULT_MIN_NOTICE_MINUTES,
  CONSULT_START_MINUTES,
  CONSULT_TOPIC_INFO,
  CONSULT_TOPICS,
  formatConsultTime,
  formatFee,
  istInstant,
  istMinutes,
  startIsBookable,
} = await import("@/lib/types/consult");

const { videoDomain, mintRoomName, meetingUrl, roomIsOpen } = await import(
  "@/lib/consult/video"
);

/**
 * The arithmetic and the rules behind paid video consultations.
 *
 * Everything tested here is pure. The booking itself needs Postgres — the
 * `Serializable` transaction in `createBooking` is the interesting part
 * and cannot be exercised without one — so what is covered here is the
 * half that decides *what gets offered and what it costs*, which is the
 * half a customer sees and the half that silently breaks on a timezone
 * mistake.
 */

describe("consultation fees", () => {
  it("prices the three bands at ₹99, ₹149 and ₹200", () => {
    /* The owner's numbers. Asserted as paise, because a fee that drifts
       by a factor of 100 is the one pricing bug nobody notices in review
       and every customer notices at the payment sheet. */
    assert.equal(CONSULT_TOPIC_INFO.repair.feePaise, 9900);
    assert.equal(CONSULT_TOPIC_INFO.products.feePaise, 14900);
    assert.equal(CONSULT_TOPIC_INFO.interior.feePaise, 20000);
  });

  it("has an entry for every topic, and no extras", () => {
    assert.deepEqual([...CONSULT_TOPICS].sort(), ["interior", "products", "repair"]);
    assert.deepEqual(Object.keys(CONSULT_TOPIC_INFO).sort(), [...CONSULT_TOPICS].sort());
  });

  it("gives every band something concrete to say it covers", () => {
    for (const topic of CONSULT_TOPICS) {
      const info = CONSULT_TOPIC_INFO[topic];
      assert.ok(info.covers.length >= 3, `${topic} should list what it covers`);
      assert.ok(info.title.length > 0);
      assert.ok(info.summary.length > 0);
    }
  });

  it("formats a fee in whole rupees", () => {
    assert.equal(formatFee(9900), "₹99");
    assert.equal(formatFee(20000), "₹200");
    /* No paise on screen: "₹99.00" reads like a form field, and every fee
       here is a whole number of rupees. */
    assert.equal(formatFee(14900), "₹149");
  });
});

describe("IST slot arithmetic", () => {
  it("turns an IST day and minute into the right UTC instant", () => {
    /* 10:00 IST is 04:30 UTC. Getting this wrong by 5½ hours puts a
       morning appointment in the previous evening, which is exactly the
       bug `istDay` was written for in the other direction. */
    assert.equal(istInstant("2026-10-15", 10 * 60).toISOString(), "2026-10-15T04:30:00.000Z");
    assert.equal(istInstant("2026-10-15", 19 * 60 + 30).toISOString(), "2026-10-15T14:00:00.000Z");
  });

  it("crosses midnight correctly for an early IST time", () => {
    /* 05:00 IST on the 15th is 23:30 UTC on the *14th*. Not a bookable
       slot, but the arithmetic has to be right either way. */
    assert.equal(istInstant("2026-10-15", 5 * 60).toISOString(), "2026-10-14T23:30:00.000Z");
  });

  it("round-trips an instant back to its IST minute", () => {
    for (const minutes of CONSULT_START_MINUTES) {
      const at = istInstant("2026-10-15", minutes);
      assert.equal(istMinutes(at), minutes, `${minutes} should round-trip`);
    }
  });

  it("formats start times the way a chip shows them", () => {
    assert.equal(formatConsultTime(10 * 60), "10 am");
    assert.equal(formatConsultTime(10 * 60 + 30), "10:30 am");
    assert.equal(formatConsultTime(12 * 60), "12 pm");
    assert.equal(formatConsultTime(12 * 60 + 30), "12:30 pm");
    assert.equal(formatConsultTime(19 * 60 + 30), "7:30 pm");
  });
});

describe("the start-time grid", () => {
  it("is sorted, unique, and inside one day", () => {
    const sorted = [...CONSULT_START_MINUTES].sort((a, b) => a - b);
    assert.deepEqual(CONSULT_START_MINUTES, sorted, "the grid must be in order");
    assert.equal(new Set(CONSULT_START_MINUTES).size, CONSULT_START_MINUTES.length);
    for (const minutes of CONSULT_START_MINUTES) {
      assert.ok(minutes >= 0 && minutes < 24 * 60);
    }
  });

  it("offers nothing before 10am or after 7:30pm", () => {
    assert.equal(Math.min(...CONSULT_START_MINUTES), 10 * 60);
    assert.equal(Math.max(...CONSULT_START_MINUTES), 19 * 60 + 30);
  });

  it("leaves the middle of the day clear", () => {
    /* A real break, not a rounding artefact: nothing starts between 1pm
       and 3pm. */
    const lunch = CONSULT_START_MINUTES.filter((m) => m >= 13 * 60 && m < 15 * 60);
    assert.deepEqual(lunch, []);
  });
});

describe("startIsBookable", () => {
  const now = new Date("2026-10-15T06:00:00.000Z");

  it("refuses a slot that is full", () => {
    assert.equal(
      startIsBookable({
        startsAt: new Date("2026-10-15T12:00:00.000Z"),
        now,
        taken: CONSULT_CONCURRENT_EXPERTS,
      }),
      false,
    );
  });

  it("allows a slot with a place left", () => {
    assert.equal(
      startIsBookable({
        startsAt: new Date("2026-10-15T12:00:00.000Z"),
        now,
        taken: CONSULT_CONCURRENT_EXPERTS - 1,
      }),
      true,
    );
  });

  it("refuses a slot inside the notice window", () => {
    const soon = new Date(now.getTime() + (CONSULT_MIN_NOTICE_MINUTES - 1) * 60_000);
    assert.equal(startIsBookable({ startsAt: soon, now, taken: 0 }), false);
  });

  it("allows a slot exactly at the notice boundary", () => {
    const edge = new Date(now.getTime() + CONSULT_MIN_NOTICE_MINUTES * 60_000);
    assert.equal(startIsBookable({ startsAt: edge, now, taken: 0 }), true);
  });

  it("refuses a slot in the past", () => {
    assert.equal(
      startIsBookable({ startsAt: new Date(now.getTime() - 60_000), now, taken: 0 }),
      false,
    );
  });
});

describe("the video room", () => {
  it("defaults to the public Jitsi instance", () => {
    assert.equal(videoDomain(), "meet.jit.si");
  });

  it("mints a room name with no booking detail in it", () => {
    const a = mintRoomName();
    const b = mintRoomName();

    /* The room name is the only access control on a public Jitsi room —
       see the note in `src/lib/consult/video.ts` — so this asserts the
       two properties that matter: it is unguessable, and it is not
       derived from anything a stranger could know. */
    assert.notEqual(a, b, "two rooms must never collide");
    assert.match(a, /^quoin-[a-z0-9]{20,}$/, "lower case, alphanumeric, and long");
  });

  it("builds a URL from a room name", () => {
    assert.equal(meetingUrl("quoin-abc123"), "https://meet.jit.si/quoin-abc123");
  });

  it("opens the room from ten minutes before until an hour after", () => {
    const startsAt = new Date("2026-10-15T10:00:00.000Z");

    const at = (minutes: number) => new Date(startsAt.getTime() + minutes * 60_000);

    assert.equal(roomIsOpen({ startsAt, now: at(-11) }), false, "11 minutes early: shut");
    assert.equal(roomIsOpen({ startsAt, now: at(-10) }), true, "10 minutes early: open");
    assert.equal(roomIsOpen({ startsAt, now: at(0) }), true, "on time: open");
    assert.equal(roomIsOpen({ startsAt, now: at(59) }), true, "59 minutes in: open");
    assert.equal(roomIsOpen({ startsAt, now: at(61) }), false, "an hour later: shut");
  });
});

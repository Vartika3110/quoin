import assert from "node:assert/strict";
import { describe, it } from "node:test";

process.env.DATABASE_URL ??= "postgresql://localhost:5432/quoin_test";
process.env.AUTH_SECRET ??= "test-secret-at-least-32-characters-long!!";

const { planRefund, refundEmptiesPayment } = await import("@/lib/orders/refund-input");

/**
 * The amount a staff member types into the refund form.
 *
 * The only box in this application where somebody types money that is
 * about to leave the account, which is why the parsing is a pure function
 * with tests rather than four conditions inside a component.
 */
const CAPTURED = 520_000; // ₹5,200

describe("what a typed refund amount comes to", () => {
  it("offers everything outstanding without reading the box", () => {
    const plan = planRefund({ mode: "full", typed: "nonsense", refundablePaise: CAPTURED });
    assert.deepEqual(plan, { amountPaise: CAPTURED, problem: null });
  });

  it("takes rupees and paise without going through a float", () => {
    /* ₹12,500.10 × 100 is 1250009.999999998 in IEEE 754 — the reason
       `rupeesToPaise` builds the integer from digits. Checked here too
       because this is the path a person's typing actually takes. */
    assert.equal(planRefund({ mode: "partial", typed: "500.55", refundablePaise: CAPTURED }).amountPaise, 50_055);
    assert.equal(planRefund({ mode: "partial", typed: "5200.00", refundablePaise: CAPTURED }).amountPaise, 520_000);
    assert.equal(planRefund({ mode: "partial", typed: "1,200", refundablePaise: CAPTURED }).amountPaise, 120_000);
  });

  it("says nothing at all while the box is empty", () => {
    /* A field that turns red the moment it is focused and emptied reads
       as broken. */
    assert.deepEqual(planRefund({ mode: "partial", typed: "", refundablePaise: CAPTURED }), {
      amountPaise: null,
      problem: null,
    });
    assert.deepEqual(planRefund({ mode: "partial", typed: "   ", refundablePaise: CAPTURED }), {
      amountPaise: null,
      problem: null,
    });
  });

  it("refuses more than is left, and says how much that is", () => {
    const plan = planRefund({ mode: "partial", typed: "6000", refundablePaise: CAPTURED });
    assert.equal(plan.amountPaise, null);
    assert.match(plan.problem ?? "", /5,200/);
  });

  it("refuses zero", () => {
    const plan = planRefund({ mode: "partial", typed: "0", refundablePaise: CAPTURED });
    assert.equal(plan.amountPaise, null);
    assert.match(plan.problem ?? "", /more than nothing/);
  });

  it("refuses something that is not an amount", () => {
    for (const typed of ["abc", "-100", "1.234", "₹500", "1e3"]) {
      const plan = planRefund({ mode: "partial", typed, refundablePaise: CAPTURED });
      assert.equal(plan.amountPaise, null, `accepted ${typed}`);
      assert.ok(plan.problem, `said nothing about ${typed}`);
    }
  });

  it("allows exactly what is left", () => {
    assert.equal(
      planRefund({ mode: "partial", typed: "5200", refundablePaise: CAPTURED }).amountPaise,
      CAPTURED,
    );
  });

  it("has nothing to offer once the payment is fully refunded", () => {
    /* The card is not rendered in this state — the page checks the same
       thing — but the function is the authority and must not answer with
       a refund of zero. */
    const plan = planRefund({ mode: "full", typed: "", refundablePaise: 0 });
    assert.equal(plan.amountPaise, null);
    assert.ok(plan.problem);
  });
});

describe("which sentence the form shows about the order", () => {
  it("calls a refund of everything outstanding a full one", () => {
    assert.equal(refundEmptiesPayment(CAPTURED, CAPTURED), true);
  });

  it("calls anything less a part refund", () => {
    /* Which is the one that must *not* say the order moves to Refund
       pending, because it does not. */
    assert.equal(refundEmptiesPayment(50_000, CAPTURED), false);
  });

  it("is not a full refund when there is no amount yet", () => {
    assert.equal(refundEmptiesPayment(null, CAPTURED), false);
  });
});

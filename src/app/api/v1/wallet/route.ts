import { handler, ok, requireUser } from "@/lib/http";
import { getWalletBalance, listWalletEntries } from "@/lib/data/wallet";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/wallet
 *
 * The signed-in customer's balance, and the movements behind it.
 *
 * Both in one response because they are one fact: a balance without
 * its history is a number the customer has to take on trust, and this
 * is money Quoin is holding for them. The account page renders both;
 * the header chip reads only the balance and ignores the rest.
 *
 * `requireUser` and not an id in the path — a wallet is never read by
 * reference. There is deliberately no way to ask this route about
 * somebody else's balance, so there is no ownership check to get
 * wrong.
 */
export const GET = handler(async () => {
  const user = await requireUser();

  const [balancePaise, entries] = await Promise.all([
    getWalletBalance(user.id),
    listWalletEntries(user.id, 20),
  ]);

  return ok({ balancePaise, entries });
});

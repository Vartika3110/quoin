"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { VendorStatus } from "@prisma/client";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";

/**
 * Marking a vendor verified — the one control that makes them payable.
 *
 * **The note is required, and it is the point.** Everything else about
 * verification is arithmetic a machine does: a GSTIN's checksum, an
 * IFSC's shape, eventually a penny drop returning the name the bank
 * holds. What no machine can record is the judgement at the edge —
 * "the bank has them as SHARMA TRADERS, the PAN says Sharma Traders
 * Pvt Ltd, same shop, confirmed on the phone with Rakesh". That
 * sentence is the difference between a payout somebody can defend and
 * one nobody can explain, so the field is not optional and a blank one
 * is refused by `markVerified` as well as here.
 *
 * It cannot verify a vendor with nowhere to send money. That check is
 * in the data layer too — this is a second pair of eyes, not the
 * guard.
 */
export function VendorVerifyForm({
  vendorId,
  status,
}: {
  vendorId: string;
  status: VendorStatus;
}) {
  const router = useRouter();
  const toast = useToast();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function send(body: Record<string, unknown>, done: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/admin/vendors/${vendorId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await res.json();
      if (!res.ok) {
        toast.error(payload?.error?.message ?? "Could not update this vendor");
        return;
      }
      toast.success(done);
      setNote("");
      router.refresh();
    } catch {
      toast.error("Network error — nothing changed");
    } finally {
      setBusy(false);
    }
  }

  if (status === "ACTIVE") {
    return (
      <div className="space-y-3">
        <p className="text-body-sm text-muted">
          Verified, and payable. Suspending keeps the record and every purchase
          made from them — it only stops them appearing on a statement.
        </p>
        <Button
          variant="outline"
          size="sm"
          loading={busy}
          disabled={busy}
          onClick={() => send({ action: "status", status: "SUSPENDED" }, "Vendor suspended")}
        >
          Suspend
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-body-sm text-muted">
        Say what you checked. The GSTIN and IFSC are already checked for shape
        and checksum; what this records is the part a person did — the call,
        the cancelled cheque, the name that nearly matched.
      </p>

      <Textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={3}
        maxLength={500}
        placeholder="Cheque seen, name matches the PAN, confirmed on the phone with…"
        aria-label="What was checked"
      />

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          loading={busy}
          disabled={busy || note.trim().length < 3}
          onClick={() => send({ action: "verify", note }, "Vendor verified — they can be paid")}
        >
          Mark verified
        </Button>
        {status !== "PENDING" && (
          <Button
            variant="outline"
            size="sm"
            loading={busy}
            disabled={busy}
            onClick={() => send({ action: "status", status: "PENDING" }, "Flagged for a look")}
          >
            Flag for a look
          </Button>
        )}
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import type { SupportStatus } from "@prisma/client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { SUPPORT_STATUS_LABEL } from "@/lib/data/support";

const STATUSES = Object.keys(SUPPORT_STATUS_LABEL) as SupportStatus[];

/**
 * Moves one request between Open, In progress and Resolved.
 *
 * Unlike an order, a support request's status is not a lifecycle with
 * illegal moves — any of the three is always a legal thing for staff to
 * set, including moving a resolved request back open if the customer
 * replies. So this is a plain select rather than `OrderStatusForm`'s
 * server-computed set of legal next states.
 */
export function SupportStatusForm({
  reference,
  status,
}: {
  reference: string;
  status: SupportStatus;
}) {
  const router = useRouter();
  const toast = useToast();
  const [value, setValue] = useState<SupportStatus>(status);
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (value === status) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/v1/admin/support/${encodeURIComponent(reference)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: value }),
      });
      const body = await res.json();

      if (!res.ok) {
        toast.error(body?.error?.message ?? "Could not update this request");
        setValue(status);
        return;
      }

      toast.success(`Moved to ${SUPPORT_STATUS_LABEL[value]}`);
      router.refresh();
    } catch {
      toast.error("Network error — the request was not updated");
      setValue(status);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
      <Select
        value={value}
        onChange={(e) => setValue(e.target.value as SupportStatus)}
        disabled={saving}
        className="w-40"
      >
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {SUPPORT_STATUS_LABEL[s]}
          </option>
        ))}
      </Select>
      <Button onClick={submit} loading={saving} disabled={saving || value === status} size="sm">
        Save
      </Button>
    </div>
  );
}

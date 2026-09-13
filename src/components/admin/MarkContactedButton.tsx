"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

/**
 * Marks one back-in-stock request as handled.
 *
 * Refreshes the server tree on success rather than flipping local state,
 * the same reason `StockActions` does: the list is read from the rows,
 * and a second copy of it on the client is one that can disagree.
 */
export function MarkContactedButton({ alertId }: { alertId: string }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <span className="flex items-center gap-2">
      <Button
        size="sm"
        variant="outline"
        loading={saving}
        onClick={async () => {
          setSaving(true);
          setError(null);
          try {
            const res = await fetch(`/api/v1/admin/stock-alerts/${alertId}`, {
              method: "PATCH",
            });
            if (!res.ok) throw new Error(String(res.status));
            router.refresh();
          } catch {
            setError("Could not save");
          } finally {
            setSaving(false);
          }
        }}
      >
        Mark contacted
      </Button>
      {error && <span className="text-micro text-danger">{error}</span>}
    </span>
  );
}

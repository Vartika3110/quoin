"use client";

import { Button } from "@/components/ui/Button";
import { Download } from "@/components/icons";

/**
 * The one control on the receipt page, and the reason that page is a
 * client boundary at all. `print:hidden` (Tailwind's built-in media-print
 * variant) rather than a prop or a second render: the button has no
 * reason to exist on paper, and this is one class instead of a second
 * `@media print` rule to keep in sync with it.
 */
export function PrintReceiptButton() {
  return (
    <Button onClick={() => window.print()} className="print:hidden">
      <Download className="size-4" />
      Print / Save as PDF
    </Button>
  );
}

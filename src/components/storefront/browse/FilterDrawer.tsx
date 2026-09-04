"use client";

import { useState, type ReactNode } from "react";
import { Drawer } from "@/components/ui/Drawer";
import { Button } from "@/components/ui/Button";
import { Sliders } from "@/components/icons";
import { Counter } from "@/components/ui/Badge";

/**
 * The filter panel on a phone.
 *
 * Wraps the server-rendered `FilterPanel` rather than reimplementing it —
 * passed through as `children`, so the desktop sidebar and the sheet can
 * never offer a different set of filters. This component owns nothing but
 * the open state, which is why it is the only client code in the browse
 * chrome.
 *
 * Choosing a filter navigates, which unmounts the drawer, so there is no
 * "apply" step to get wrong and no state to sync back to the URL.
 */
export function FilterDrawer({
  children,
  activeCount,
}: {
  children: ReactNode;
  activeCount: number;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="lg:hidden"
      >
        <Sliders className="size-4" />
        Filters
        {activeCount > 0 && <Counter value={activeCount} className="ml-0.5" />}
      </Button>

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="Filters"
        side="responsive"
      >
        <div className="p-4">{children}</div>
      </Drawer>
    </>
  );
}

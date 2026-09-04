"use client";

import { useState } from "react";
import { AddressPicker, type Address } from "@/components/storefront/checkout/AddressPicker";

/**
 * The address book.
 *
 * Wraps the checkout's picker rather than reimplementing it. The two
 * screens do the same job — show what is saved, add another — and the only
 * difference is that nothing downstream depends on the selection here. A
 * second implementation would be a second place for the coordinate
 * requirement to be forgotten.
 */
export function AddressBook() {
  const [selected, setSelected] = useState<Address | null>(null);

  return (
    <AddressPicker
      selectedId={selected?.id ?? null}
      onSelect={setSelected}
    />
  );
}

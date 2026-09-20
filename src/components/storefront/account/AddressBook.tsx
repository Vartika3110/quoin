"use client";

import { AddressPicker } from "@/components/storefront/checkout/AddressPicker";

/**
 * The address book.
 *
 * Wraps the checkout's picker rather than reimplementing it, in `manage`
 * mode: same card, same coordinate requirement, but edit/delete/set-default
 * instead of a selection nothing on this page needs. A second
 * implementation would be a second place for the coordinate requirement to
 * be forgotten.
 */
export function AddressBook() {
  return <AddressPicker mode="manage" selectedId={null} onSelect={() => {}} />;
}

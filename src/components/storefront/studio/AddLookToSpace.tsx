"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { Spinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import { Check, Plus } from "@/components/icons";
import { cn } from "@/components/ui/cn";
import { useStudio } from "@/lib/store/studio";
import { formatPrice } from "@/lib/types/catalog";
import type { LookMatch } from "@/lib/types/studio";

/**
 * Putting a matched look into a room.
 *
 * Section 14 asks for "add all to project" and "add available items to
 * cart" side by side. Only the first is here, and the difference is
 * deliberate: a cart line needs a variant, a quantity and a serviceable
 * address, and a bulk "add five things" button that guesses all three is
 * how someone ends up buying the wrong finish in the wrong quantity. So
 * this files the products into a Space — where they can be sized, priced
 * and reconsidered — and buying stays where it already works, on the
 * product page, one deliberate decision at a time.
 *
 * The prices carried across are a snapshot, exactly as `OrderLine` and
 * `ProjectMaterial` snapshot theirs. A room should still show what was
 * chosen and what it cost that day after a SKU is retired.
 */
export function AddLookToSpace({ matches }: { matches: LookMatch[] }) {
  const { spaces, signedIn, ready } = useStudio();
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(
    () => new Set(matches.map((m) => m.slug)),
  );

  if (matches.length === 0) return null;

  function toggle(slug: string) {
    setChosen((current) => {
      const next = new Set(current);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }

  async function addTo(spaceId: string, spaceName: string) {
    const picked = matches.filter((m) => chosen.has(m.slug));
    if (picked.length === 0) return;

    setBusy(spaceId);
    try {
      /* Sequential, not `Promise.all`. Each insert reads `max(position)`
         inside its own transaction to place the row on the end; five
         concurrent inserts would all read the same maximum and land on
         the same position, leaving the order to a creation-time
         tiebreak forever. Five requests is a fraction of a second. */
      for (const match of picked) {
        const response = await fetch(`/api/v1/studio/spaces/${spaceId}/items`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind: "product",
            productSlug: match.slug,
            title: match.title,
            brand: match.brand ?? "",
            qty: 1,
            unitPricePaise: match.pricePaise,
          }),
        });
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.error?.message ?? "Could not add these products");
        }
      }

      toast.success(
        `${picked.length} ${picked.length === 1 ? "product" : "products"} added to ${spaceName}`,
        { label: "Open", onClick: () => router.push(`/studio/spaces/${spaceId}`) },
      );
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add these products");
    } finally {
      setBusy(null);
    }
  }

  if (!signedIn) {
    /* `next` brings them back to this idea rather than dropping them on
       whatever `/signin` defaults to — the same contract the save button
       on `IdeaCard` and `IdeaDetail` already honours. */
    return (
      <Button
        href={`/signin?next=${encodeURIComponent(pathname)}`}
        variant="outline"
        size="sm"
      >
        Sign in to add these to a space
      </Button>
    );
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        Add these to a space
      </Button>

      {open ? (
        <Drawer
          open
          onClose={() => setOpen(false)}
          side="responsive"
          title="Add to a space"
          description="Choose what to add, then which room it goes in."
        >
          <div className="flex flex-col gap-5 pb-2">
            <ul className="flex flex-col gap-1">
              {matches.map((match) => (
                <li key={match.slug}>
                  <button
                    type="button"
                    onClick={() => toggle(match.slug)}
                    aria-pressed={chosen.has(match.slug)}
                    className="flex min-h-11 w-full items-center gap-3 rounded-lg px-1 text-left transition-colors hover:bg-hover"
                  >
                    <span
                      className={cn(
                        "flex size-5 shrink-0 items-center justify-center rounded border transition-colors",
                        chosen.has(match.slug)
                          ? "border-accent bg-accent text-on-accent"
                          : "border-line-strong",
                      )}
                    >
                      {chosen.has(match.slug) ? <Check className="size-3" /> : null}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-body text-ink">
                      {match.title}
                    </span>
                    <span className="nums shrink-0 text-body-sm text-muted">
                      {match.pricePaise > 0 ? formatPrice(match.pricePaise) : "—"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>

            <div>
              <p className="mb-2 text-eyebrow uppercase text-faint">Your spaces</p>

              {!ready ? (
                <p className="flex items-center gap-2 py-4 text-body-sm text-muted">
                  <Spinner className="size-4" />
                  Loading
                </p>
              ) : spaces.length === 0 ? (
                <div className="rounded-card border border-line-soft bg-sunk p-4">
                  <p className="text-body-sm text-muted">
                    You have no spaces yet. Create one and these products go
                    straight into it.
                  </p>
                  <Button href="/studio/spaces?new=1" size="sm" className="mt-3">
                    Create a space
                  </Button>
                </div>
              ) : (
                <ul className="flex flex-col gap-1">
                  {spaces.map((space) => (
                    <li key={space.id}>
                      <button
                        type="button"
                        disabled={busy !== null || chosen.size === 0}
                        onClick={() => addTo(space.id, space.name)}
                        className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-3 text-left transition-colors hover:bg-hover disabled:opacity-50"
                      >
                        <span className="truncate text-body font-medium text-ink">
                          {space.name}
                        </span>
                        {busy === space.id ? (
                          <Spinner className="size-4" />
                        ) : (
                          <Plus className="size-4 text-faint" />
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </Drawer>
      ) : null}
    </>
  );
}

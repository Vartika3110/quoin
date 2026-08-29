"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Pin } from "@/components/icons";
import type { AreaChoice } from "@/lib/data/service-areas";

/**
 * Choose the locality Quoin delivers to.
 *
 * The list is every area with a store, so a customer can only pick
 * somewhere the promise actually holds. Anywhere else is not a silent
 * failure at checkout — it simply is not on the list, and the panel says
 * where service does exist.
 */
export function LocationPicker({
  areas,
  selected,
  className = "",
}: {
  areas: AreaChoice[];
  selected: AreaChoice | null;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const router = useRouter();
  const box = useRef<HTMLDivElement>(null);

  /* Dismiss on outside click and on Escape — a panel that can only be
     closed by choosing something traps a customer who opened it to look. */
  useEffect(() => {
    if (!open) return;

    function onPointer(event: MouseEvent) {
      if (box.current && !box.current.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function choose(slug: string) {
    setSaving(slug);
    try {
      const res = await fetch("/api/v1/area", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      if (res.ok) {
        setOpen(false);
        /* The header is server-rendered from the cookie, so the server
           has to re-render for the choice to show. */
        router.refresh();
      }
    } finally {
      setSaving(null);
    }
  }

  return (
    <div ref={box} className={`relative ${className}`}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="flex max-w-full items-center gap-1.5 text-left text-sm text-ink"
      >
        <Pin className="size-4 shrink-0 text-accent" />
        <span className="truncate">
          {selected ? `${selected.name}, ${selected.city}` : "Choose your area"}
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted" />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-card border border-line bg-surface shadow-lg"
        >
          <p className="border-b border-line-soft px-4 py-2.5 text-[11px] text-muted">
            Quoin delivers to these areas today
          </p>

          <ul>
            {areas.map((area) => {
              const active = selected?.slug === area.slug;
              return (
                <li key={area.slug}>
                  <button
                    role="option"
                    aria-selected={active}
                    disabled={saving !== null}
                    onClick={() => choose(area.slug)}
                    className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-hover disabled:opacity-60 ${
                      active ? "bg-accent-wash" : ""
                    }`}
                  >
                    {/* The name and nothing else. The delivery time belongs
                        in the header, where it applies to the area actually
                        chosen — repeating it against every option turns a
                        short list into a wall of numbers to compare. */}
                    <span className="min-w-0 truncate text-sm text-ink">{area.name}</span>
                    {active && <Check className="size-4 shrink-0 text-accent" />}
                  </button>
                </li>
              );
            })}
          </ul>

          <p className="border-t border-line-soft px-4 py-2.5 text-[11px] text-faint">
            Somewhere else? We are not there yet — more areas are coming.
          </p>
        </div>
      )}
    </div>
  );
}

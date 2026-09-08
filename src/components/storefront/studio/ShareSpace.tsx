"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { Check, People } from "@/components/icons";
import type { Visibility } from "@/lib/types/studio";

/**
 * Sharing a room.
 *
 * Two states and one switch, because the underlying column has two
 * states: a room is private or it is public. Section 42 asks for shareable
 * spaces, and the honest version of that is a link that works for anyone
 * and a page that says so plainly — not an "unlisted" middle setting,
 * which sounds safe and is how a renovation budget ends up in a search
 * index the day the link reaches a group chat.
 *
 * The link is built from `window.location.origin` rather than an
 * environment variable so it is right on a preview deployment, on
 * localhost and in production without any of them being configured.
 */
export function ShareSpace({
  spaceId,
  slug,
  visibility,
}: {
  spaceId: string;
  slug: string;
  visibility: Visibility;
}) {
  const router = useRouter();
  const toast = useToast();

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const isPublic = visibility === "public";
  const url =
    typeof window === "undefined" ? "" : `${window.location.origin}/studio/spaces/${slug}`;

  async function setVisibility(next: Visibility) {
    setBusy(true);
    try {
      const response = await fetch(`/api/v1/studio/spaces/${spaceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visibility: next }),
      });
      if (!response.ok) throw new Error("Could not change who can see this");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not change this");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      /* Reverts on its own. A "Copied" that never changes back stops
         meaning anything the second time. */
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Your browser would not let us copy that. Select it and copy manually.");
    }
  }

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <People className="size-4" />
        Share
      </Button>

      {open ? (
        <Modal open onClose={() => setOpen(false)} title="Share this space">
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <Choice
                label="Only you"
                detail="Nobody else can open it, and it is not indexed."
                on={!isPublic}
                disabled={busy}
                onSelect={() => setVisibility("private")}
              />
              <Choice
                label="Anyone with the link"
                detail="They can look at the ideas, the moodboard and the materials. They cannot change anything, and your notes stay yours."
                on={isPublic}
                disabled={busy}
                onSelect={() => setVisibility("public")}
              />
            </div>

            {isPublic ? (
              <div className="flex gap-2">
                <Input readOnly value={url} aria-label="Link to this space" />
                <Button variant="outline" onClick={copy} className="shrink-0">
                  {copied ? <Check className="size-4" /> : null}
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
            ) : null}
          </div>
        </Modal>
      ) : null}
    </>
  );
}

function Choice({
  label,
  detail,
  on,
  disabled,
  onSelect,
}: {
  label: string;
  detail: string;
  on: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={on}
      className={`flex items-start gap-3 rounded-card border p-3 text-left transition-colors ${
        on ? "border-accent-edge bg-accent-wash" : "border-line-soft hover:bg-hover"
      }`}
    >
      <span
        className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border ${
          on ? "border-accent bg-accent text-on-accent" : "border-line-strong"
        }`}
      >
        {on ? <Check className="size-3" /> : null}
      </span>
      <span>
        <span className="block text-body font-medium text-ink">{label}</span>
        <span className="block text-caption text-muted">{detail}</span>
      </span>
    </button>
  );
}

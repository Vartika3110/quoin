"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Field, Input, Select } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { Spinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import { IdeaImage } from "@/components/storefront/studio/IdeaImage";
import { Plus, Sofa } from "@/components/icons";
import { useStudio } from "@/lib/store/studio";
import { ROOMS, ROOM_LABEL, type StudioRoom } from "@/lib/types/studio";
import { formatPrice } from "@/lib/types/catalog";

/**
 * The rooms someone is working on.
 *
 * A plain responsive grid, not masonry: these are covers of a fixed
 * shape, and a ragged grid of equal-sized cards is a masonry layout doing
 * no work. The photograph is the room's most recently added idea unless
 * a cover has been chosen — set on the server when the first idea lands
 * (see `addSpaceItem`), so a new space is never a blank card for long.
 *
 * `?new=1` opens the create dialog on arrival, which is what the rail's
 * "New space" button links to. A URL that opens a dialog is worth more
 * than a button that only works from one page: it can be linked from the
 * empty state, the nav and a toast.
 */
export function SpacesGrid({ openNew = false }: { openNew?: boolean }) {
  const { spaces, ready, spacesError, refreshSpaces, createSpace } = useStudio();
  const [dialog, setDialog] = useState(openNew);

  if (spacesError) {
    return (
      <ErrorState
        title="We could not load your spaces"
        description={spacesError}
        retry={refreshSpaces}
      />
    );
  }

  if (!ready) {
    return (
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="overflow-hidden rounded-card border border-line-soft">
            <Skeleton className="aspect-[4/3] w-full rounded-none" />
            <div className="flex flex-col gap-2 p-3">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <>
      {spaces.length === 0 ? (
        <EmptyState
          icon={<Sofa className="size-6" />}
          title="No spaces yet"
          action={{ label: "Create a space", onClick: () => setDialog(true) }}
          secondaryAction={{ href: "/studio", label: "Find inspiration first" }}
        >
          A space is one room you are working on — a kitchen, a bathroom, a
          balcony. It holds the ideas you save for it, the products you
          choose, and what the whole thing is going to cost.
        </EmptyState>
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4">
          {spaces.map((space) => (
            <Link
              key={space.id}
              href={`/studio/spaces/${space.id}`}
              className="group flex flex-col overflow-hidden rounded-card border border-line-soft bg-surface outline-none transition-[transform,box-shadow] duration-200 ease-out-quart hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-2 focus-visible:ring-accent"
            >
              <div className="aspect-[4/3] overflow-hidden bg-sunk">
                {space.coverUrl ? (
                  <IdeaImage
                    src={space.coverUrl}
                    alt=""
                    /* The cover is cropped to a fixed 4:3 box, so the
                       intrinsic ratio does not matter here — only that
                       `next/image` gets a size to work from. */
                    width={800}
                    height={600}
                    sizes="(min-width: 1280px) 20vw, (min-width: 1024px) 30vw, 45vw"
                    className="h-full w-full object-cover transition-transform duration-500 ease-out-quart group-hover:scale-105"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-caption text-faint">
                    No cover yet
                  </div>
                )}
              </div>

              <div className="flex flex-1 flex-col gap-0.5 p-3">
                <p className="truncate text-body font-medium text-ink">{space.name}</p>
                <p className="nums text-caption text-faint">
                  {space.ideaCount} {space.ideaCount === 1 ? "idea" : "ideas"}
                  {space.productCount > 0 ? ` · ${space.productCount} products` : ""}
                </p>
                {space.plannedPaise > 0 ? (
                  <p className="nums mt-1 text-caption font-medium text-accent">
                    {formatPrice(space.plannedPaise)} planned
                  </p>
                ) : null}
              </div>
            </Link>
          ))}
        </div>
      )}

      {dialog ? (
        <NewSpaceDialog
          onClose={() => setDialog(false)}
          onCreate={createSpace}
        />
      ) : null}

      {spaces.length > 0 ? (
        <Button className="mt-6" variant="outline" onClick={() => setDialog(true)}>
          <Plus className="size-4" />
          New space
        </Button>
      ) : null}
    </>
  );
}

/** Mounted only while open — see the note on `SaveSheet` for why that is
    the reset mechanism rather than an effect. */
function NewSpaceDialog({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (input: {
    name: string;
    room?: StudioRoom;
    budgetPaise?: number;
  }) => Promise<{ id: string }>;
}) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [room, setRoom] = useState<StudioRoom>("kitchen");
  const [budget, setBudget] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed) return;

    setBusy(true);
    try {
      /* Rupees in the field, paise in the database — the conversion
         happens once, here, at the boundary. Everything below this line
         is integer paise, like every amount in the app. */
      const rupees = Number(budget.replace(/[^0-9]/g, ""));
      await onCreate({
        name: trimmed,
        room,
        budgetPaise: Number.isFinite(rupees) && rupees > 0 ? rupees * 100 : 0,
      });
      toast.success(`${trimmed} created`);
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create the space");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Create a space"
      description="One room you are working on."
      footer={
        <div className="flex gap-2">
          <Button onClick={submit} disabled={busy || !name.trim()}>
            {busy ? <Spinner className="size-4" /> : null}
            Create
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Name" htmlFor="space-name" required>
          <Input
            id="space-name"
            autoFocus
            value={name}
            maxLength={80}
            placeholder="Master bedroom"
            onChange={(event) => setName(event.target.value)}
          />
        </Field>

        <Field label="Room" htmlFor="space-room">
          <Select
            id="space-room"
            value={room}
            onChange={(event) => setRoom(event.target.value as StudioRoom)}
          >
            {ROOMS.map((value) => (
              <option key={value} value={value}>
                {ROOM_LABEL[value]}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Budget"
          htmlFor="space-budget"
          hint="Optional. What you intend to spend on this room, in rupees."
        >
          <Input
            id="space-budget"
            inputMode="numeric"
            value={budget}
            placeholder="250000"
            onChange={(event) => setBudget(event.target.value)}
          />
        </Field>
      </div>
    </Modal>
  );
}

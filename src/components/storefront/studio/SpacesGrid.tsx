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
 * no work. The cover is a collage of up to three of the board's pins —
 * a board is a collection, and one photograph on it looks like a single
 * pin with a name under it.
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
        title="We could not load your boards"
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
          title="No boards yet"
          action={{ label: "Create a board", onClick: () => setDialog(true) }}
          secondaryAction={{ href: "/studio", label: "Find inspiration first" }}
        >
          A board is one room you are working on — a kitchen, a bathroom, a
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
              <CoverCollage urls={space.coverUrls} />

              <div className="flex flex-1 flex-col gap-0.5 p-3">
                <p className="truncate text-body font-medium text-ink">{space.name}</p>
                <p className="nums text-caption text-faint">
                  {space.ideaCount} {space.ideaCount === 1 ? "pin" : "pins"}
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
          New board
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
      toast.error(error instanceof Error ? error.message : "Could not create the board");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Create a board"
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

/**
 * Up to three pins, as one cover.
 *
 * One large pane and two stacked beside it, which is the arrangement that
 * survives having fewer than three: at two it is a pair, at one it is a
 * single photograph filling the box, and none of those needs a grey
 * rectangle standing in for a picture that does not exist. Padding a
 * collage out to three panes is how an empty board ends up looking
 * broken instead of new.
 */
function CoverCollage({ urls }: { urls: (string | null)[] }) {
  if (urls.length === 0) {
    return (
      <div className="flex aspect-[4/3] items-center justify-center bg-sunk text-caption text-faint">
        No pins yet
      </div>
    );
  }

  const [first, ...rest] = urls.slice(0, 3);

  return (
    <div className="flex aspect-[4/3] gap-0.5 overflow-hidden bg-sunk">
      <Pane src={first} className="flex-[2]" />
      {rest.length > 0 && (
        <div className="flex flex-1 flex-col gap-0.5">
          {/* Index keys. The url was the key until a pin without a
              photograph became the normal case, and three nulls are not
              three distinct keys. Nothing here reorders. */}
          {rest.map((url, i) => (
            <Pane key={i} src={url} className="min-h-0 flex-1" />
          ))}
        </div>
      )}
    </div>
  );
}

function Pane({ src, className }: { src: string | null; className: string }) {
  /* A pane with no photograph is left as bare ground rather than given
     the "Photo coming soon" tile. A collage pane is a sliver — a third of
     a 4:3 cover, so around 60px tall in the grid — and the tile's two
     lines of type do not fit in it legibly. The card under the collage
     already says the board's name and how many pins it holds, so a muted
     pane reads as a photograph that has not been taken, which is what it
     is, and the pin's own tile says so in words the moment it is opened. */
  if (!src) {
    return <div className={`bg-line-hair/40 ${className}`} />;
  }

  return (
    <div className={`relative overflow-hidden ${className}`}>
      <IdeaImage
        src={src}
        alt=""
        /* Cropped to its pane, so the intrinsic ratio does not matter —
           only that `next/image` has a size to work from. */
        width={800}
        height={600}
        sizes="(min-width: 1280px) 20vw, (min-width: 1024px) 30vw, 45vw"
        className="size-full object-cover transition-transform duration-500 ease-out-quart group-hover:scale-105"
      />
    </div>
  );
}

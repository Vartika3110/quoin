"use client";

import { useMemo, useState } from "react";
import { Drawer } from "@/components/ui/Drawer";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import { Check, Heart, Plus } from "@/components/icons";
import { cn } from "@/components/ui/cn";
import { useStudio } from "@/lib/store/studio";
import { ROOM_LABEL, type IdeaView, type StudioRoom } from "@/lib/types/studio";

/**
 * Where to put an idea.
 *
 * A `Drawer` with `side="responsive"`, which is already a bottom sheet on
 * a phone and a side panel from `sm` up — the two things section 5 asks
 * for are one component that this app already has, with the focus trap,
 * the Escape handler, the focus return and the scroll lock done properly
 * once.
 *
 * **Mount this only while it is open.** There is no effect resetting the
 * ticks between one idea and the next — an effect that calls `setState`
 * on open is a cascading render, and React 19's
 * `react-hooks/set-state-in-effect` rule rejects it. Conditional mounting
 * gives the same reset for free, and keeps a feed of forty tiles from
 * holding forty idle portals in the DOM.
 *
 * The interaction is deliberately one round trip, not two. Saving and
 * filing go together in `POST /api/v1/studio/save`, inside one
 * transaction, so there is no state where the heart has filled and the
 * Kitchen is still empty. That is also why "♡ My Inspiration" is shown as
 * a row that is always on rather than a choice: saving *is* adding to My
 * Inspiration, and offering to turn it off would be offering to do
 * nothing.
 */
export function SaveSheet({
  idea,
  open,
  onClose,
}: {
  idea: IdeaView;
  open: boolean;
  onClose: () => void;
}) {
  const { spaces, ready, save, createSpace } = useStudio();
  const toast = useToast();

  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  /* The room a space is *for* groups the list, because someone with
     fifteen spaces is looking for "my kitchen ones" and not scanning
     alphabetically. Spaces whose room is `other` fall into a final group
     rather than being hidden. */
  const grouped = useMemo(() => {
    const byRoom = new Map<StudioRoom, typeof spaces>();
    for (const space of spaces) {
      const list = byRoom.get(space.room);
      if (list) list.push(space);
      else byRoom.set(space.room, [space]);
    }
    return [...byRoom.entries()].sort(([a], [b]) =>
      a === "other" ? 1 : b === "other" ? -1 : ROOM_LABEL[a].localeCompare(ROOM_LABEL[b]),
    );
  }, [spaces]);

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function onCreate() {
    const name = newName.trim();
    if (!name) return;

    setBusy(true);
    try {
      const space = await createSpace({ name });
      /* Ticked immediately — someone who just typed "Kitchen" into this
         sheet means to save into it, and making them tick it again is a
         step that exists only because the code was easier that way. */
      setSelected((current) => new Set(current).add(space.id));
      setCreating(false);
      setNewName("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create the space");
    } finally {
      setBusy(false);
    }
  }

  async function onSave() {
    setBusy(true);
    try {
      const count = await save(idea.id, [...selected]);
      const where =
        count === 0
          ? "Saved to My Inspiration"
          : count === 1
            ? `Saved to ${spaces.find((s) => selected.has(s.id))?.name ?? "your space"}`
            : `Saved to ${count} spaces`;
      toast.success(where);
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      side="responsive"
      title="Save inspiration"
      description={idea.title}
    >
      <div className="flex flex-col gap-5 pb-2">
        <Row
          icon={<Heart className="size-4 text-accent" />}
          label="My Inspiration"
          detail="Everything you save lands here"
          checked
          locked
        />

        {!ready ? (
          <div className="flex items-center gap-2 px-1 py-6 text-body-sm text-muted">
            <Spinner className="size-4" />
            Loading your spaces…
          </div>
        ) : (
          <>
            {grouped.length > 0 && (
              <div className="flex flex-col gap-4">
                {grouped.map(([room, list]) => (
                  <div key={room} className="flex flex-col gap-1.5">
                    <p className="px-1 text-eyebrow uppercase text-faint">
                      {ROOM_LABEL[room]}
                    </p>
                    {list.map((space) => (
                      <Row
                        key={space.id}
                        label={space.name}
                        detail={
                          space.ideaCount === 1
                            ? "1 idea"
                            : `${space.ideaCount} ideas`
                        }
                        checked={selected.has(space.id)}
                        onToggle={() => toggle(space.id)}
                      />
                    ))}
                  </div>
                ))}
              </div>
            )}

            {creating ? (
              <div className="flex flex-col gap-2 px-1">
                <Input
                  autoFocus
                  value={newName}
                  maxLength={80}
                  placeholder="Kitchen, Master bedroom…"
                  aria-label="Name of the new space"
                  onChange={(event) => setNewName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void onCreate();
                    }
                  }}
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={onCreate} disabled={busy || !newName.trim()}>
                    Create
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setCreating(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="flex min-h-11 items-center gap-2 rounded-lg px-1 text-left text-body font-medium text-accent transition-colors hover:bg-hover"
              >
                <Plus className="size-4" />
                Create a new space
              </button>
            )}
          </>
        )}

        <Button block size="lg" onClick={onSave} disabled={busy}>
          {busy ? <Spinner className="size-4" /> : null}
          {selected.size > 0
            ? `Save to ${selected.size} ${selected.size === 1 ? "space" : "spaces"}`
            : "Save"}
        </Button>
      </div>
    </Drawer>
  );
}

/**
 * One destination.
 *
 * A real `<button>` with `aria-pressed`, not a div with a click handler
 * and not a checkbox styled out of recognition: this is a toggle, and
 * that is the control a screen reader already knows how to announce.
 * `locked` renders the same row as static text for "My Inspiration",
 * which is not a choice.
 */
function Row({
  icon,
  label,
  detail,
  checked,
  locked = false,
  onToggle,
}: {
  icon?: React.ReactNode;
  label: string;
  detail?: string;
  checked: boolean;
  locked?: boolean;
  onToggle?: () => void;
}) {
  const body = (
    <>
      <span className="flex min-w-0 flex-1 flex-col text-left">
        <span className="flex items-center gap-2 truncate text-body font-medium text-ink">
          {icon}
          {label}
        </span>
        {detail ? <span className="text-caption text-faint">{detail}</span> : null}
      </span>
      <span
        className={cn(
          "flex size-6 shrink-0 items-center justify-center rounded-full border transition-colors",
          checked
            ? "border-accent bg-accent text-on-accent"
            : "border-line-strong bg-surface",
        )}
      >
        {checked ? <Check className="size-3.5" /> : null}
      </span>
    </>
  );

  if (locked) {
    return (
      <div className="flex min-h-11 items-center gap-3 rounded-lg px-1 py-1.5">{body}</div>
    );
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={checked}
      className="flex min-h-11 items-center gap-3 rounded-lg px-1 py-1.5 transition-colors hover:bg-hover"
    >
      {body}
    </button>
  );
}

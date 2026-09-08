"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Tabs, type TabItem } from "@/components/ui/Tabs";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Field, Input, Select, Textarea } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import { IdeaMasonry } from "@/components/storefront/studio/IdeaMasonry";
import { SpaceBudget } from "@/components/storefront/studio/SpaceBudget";
import { Moodboard } from "@/components/storefront/studio/Moodboard";
import { LinkToProject } from "@/components/storefront/studio/LinkToProject";
import { ShareSpace } from "@/components/storefront/studio/ShareSpace";
import { Plus, Sparkle, Trash } from "@/components/icons";
import { formatPrice } from "@/lib/types/catalog";
import { ROOM_LABEL } from "@/lib/types/studio";
import type {
  ItemKind,
  MoodboardView,
  SpaceDetailView,
  SpaceItemView,
} from "@/lib/types/studio";

/**
 * One room, as a workspace.
 *
 * Six tabs rather than one long page, for the reason `ProjectDashboard`
 * already gives: sections stacked is a page nobody reaches the bottom of,
 * and the numbers someone opens this for have to be above the fold. The
 * header carries those; everything else is one tap away.
 *
 * `canEdit` comes from the server and gates every control. It is not what
 * *enforces* anything — every mutation is checked again against `userId`
 * in the `where` clause — it is what stops a visitor to a shared room
 * being shown buttons that would fail.
 */
type Section = "inspiration" | "moodboard" | "products" | "materials" | "budget" | "notes";

const SECTIONS: TabItem<Section>[] = [
  { id: "inspiration", label: "Inspiration" },
  { id: "moodboard", label: "Moodboard" },
  { id: "products", label: "Products" },
  { id: "materials", label: "Materials" },
  { id: "budget", label: "Budget" },
  { id: "notes", label: "Notes" },
];

const SIZES = "(min-width: 1280px) 18vw, (min-width: 1024px) 22vw, (min-width: 640px) 33vw, 50vw";

export function SpaceWorkspace({
  space,
  moodboard,
}: {
  space: SpaceDetailView & { canEdit: boolean };
  moodboard: MoodboardView | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [section, setSection] = useState<Section>("inspiration");
  const [adding, setAdding] = useState<ItemKind | null>(null);

  const ideas = space.items
    .filter((item) => item.kind === "idea" && item.idea)
    .map((item) => item.idea!);
  const products = space.items.filter((item) => item.kind === "product");
  const materials = space.items.filter((item) => item.kind === "material");
  const colors = space.items.filter((item) => item.kind === "color");

  const removeItem = useCallback(
    async (itemId: string) => {
      try {
        const response = await fetch(
          `/api/v1/studio/spaces/${space.id}/items/${itemId}`,
          { method: "DELETE" },
        );
        if (!response.ok) throw new Error("Could not remove it");
        /* The server owns the counts, the cover and the budget totals, so
           the page is refreshed rather than patched in three places. */
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not remove it");
      }
    },
    [space.id, router, toast],
  );

  return (
    <div className="flex flex-col gap-6">
      <header className="px-5 lg:px-0">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-eyebrow uppercase text-accent">
              {ROOM_LABEL[space.room]}
            </p>
            <h1 className="mt-1 font-display text-headline font-light tracking-tight text-ink">
              {space.name}
            </h1>
            {space.description ? (
              <p className="mt-1.5 max-w-xl text-body text-muted">
                {space.description}
              </p>
            ) : null}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {space.canEdit ? (
              <ShareSpace
                spaceId={space.id}
                slug={space.slug}
                visibility={space.visibility}
              />
            ) : null}

            {space.projectId ? (
              <Button href={`/projects/${space.projectId}`} variant="outline" size="sm">
                Open the project
              </Button>
            ) : space.canEdit ? (
              <LinkToProject
                spaceId={space.id}
                spaceName={space.name}
                plannedPaise={space.plannedPaise}
                budgetPaise={space.budgetPaise}
              />
            ) : null}
          </div>
        </div>

        <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-body-sm">
          <Figure label="ideas" value={String(ideas.length)} />
          <Figure label="products" value={String(products.length)} />
          <Figure
            label="planned"
            value={formatPrice(space.plannedPaise)}
            emphasis
          />
          {space.budgetPaise > 0 ? (
            <Figure label="budget" value={formatPrice(space.budgetPaise)} />
          ) : null}
        </dl>
      </header>

      <div className="px-5 lg:px-0">
        <Tabs
          items={SECTIONS}
          value={section}
          onChange={setSection}
          label="Space sections"
          variant="underline"
        />
      </div>

      <div className="px-5 lg:px-0">
        {section === "inspiration" ? (
          ideas.length === 0 ? (
            <EmptyState
              icon={<Sparkle className="size-6" />}
              title="No ideas in this space yet"
              action={{ href: "/studio", label: "Find inspiration" }}
            >
              Save a photograph from the feed and choose this space, and it
              will appear here.
            </EmptyState>
          ) : (
            <IdeaMasonry ideas={ideas} label={`Ideas in ${space.name}`} sizes={SIZES} />
          )
        ) : null}

        {section === "moodboard" ? (
          <Moodboard
            spaceId={space.id}
            board={moodboard}
            items={space.items}
            canEdit={space.canEdit}
          />
        ) : null}

        {section === "products" ? (
          <ItemList
            items={products}
            kind="product"
            canEdit={space.canEdit}
            onRemove={removeItem}
            onAdd={() => setAdding("product")}
            empty="Nothing chosen yet. Open a product from Shop this look and add it here."
          />
        ) : null}

        {section === "materials" ? (
          <>
            <ItemList
              items={materials}
              kind="material"
              canEdit={space.canEdit}
              onRemove={removeItem}
              onAdd={() => setAdding("material")}
              empty="Add the finishes this room needs — flooring, walls, hardware."
            />

            {colors.length > 0 ? (
              <div className="mt-8">
                <p className="mb-2 text-eyebrow uppercase text-faint">Colours</p>
                <ul className="flex flex-wrap gap-3">
                  {colors.map((colour) => (
                    <li key={colour.id} className="flex items-center gap-2">
                      <span
                        className="size-6 rounded-full border border-line-soft"
                        style={{ backgroundColor: colour.hex ?? "#fff" }}
                        aria-hidden
                      />
                      <span className="text-body-sm text-muted">{colour.title}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {space.canEdit ? (
              <Button
                variant="ghost"
                size="sm"
                className="mt-4"
                onClick={() => setAdding("color")}
              >
                <Plus className="size-4" />
                Add a colour
              </Button>
            ) : null}
          </>
        ) : null}

        {section === "budget" ? (
          <SpaceBudget items={space.items} budgetPaise={space.budgetPaise} />
        ) : null}

        {section === "notes" ? (
          <SpaceNotes spaceId={space.id} initial={space.notes} canEdit={space.canEdit} />
        ) : null}
      </div>

      {adding ? (
        <AddItemDialog
          spaceId={space.id}
          kind={adding}
          onClose={() => setAdding(null)}
          onAdded={() => {
            setAdding(null);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}

function Figure({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dd
        className={`nums font-semibold ${emphasis ? "text-accent" : "text-ink"}`}
      >
        {value}
      </dd>
      <dt className="text-caption text-faint">{label}</dt>
    </div>
  );
}

/** Products and materials share a row shape: a label, a quantity, a
    price and a link out to the catalogue where there is one. */
function ItemList({
  items,
  kind,
  canEdit,
  onRemove,
  onAdd,
  empty,
}: {
  items: SpaceItemView[];
  kind: ItemKind;
  canEdit: boolean;
  onRemove: (id: string) => void;
  onAdd: () => void;
  empty: string;
}) {
  if (items.length === 0) {
    return (
      <EmptyState
        title={kind === "product" ? "No products yet" : "No materials yet"}
        compact
        action={canEdit ? { label: "Add one", onClick: onAdd } : undefined}
      >
        {empty}
      </EmptyState>
    );
  }

  return (
    <>
      <ul className="flex max-w-2xl flex-col gap-2">
        {items.map((item) => (
          <li key={item.id}>
            <Card padding="md" className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                {item.productSlug ? (
                  <Link
                    href={`/p/${item.productSlug}`}
                    className="truncate text-body font-medium text-ink hover:text-accent"
                  >
                    {item.title}
                  </Link>
                ) : (
                  <p className="truncate text-body font-medium text-ink">{item.title}</p>
                )}

                <p className="mt-0.5 flex flex-wrap items-center gap-2 text-caption text-faint">
                  {item.surface ? <Badge size="sm">{item.surface}</Badge> : null}
                  {item.brand ? <span>{item.brand}</span> : null}
                  <span className="nums">
                    {item.qty} {item.unit}
                  </span>
                </p>
              </div>

              <p className="nums shrink-0 text-body font-semibold text-ink">
                {item.unitPricePaise > 0
                  ? formatPrice(Math.round(item.qty * item.unitPricePaise))
                  : "—"}
              </p>

              {canEdit ? (
                <button
                  type="button"
                  onClick={() => onRemove(item.id)}
                  aria-label={`Remove ${item.title}`}
                  className="grid size-9 shrink-0 place-items-center rounded-md text-faint transition-colors hover:bg-danger-wash hover:text-danger"
                >
                  <Trash className="size-4" />
                </button>
              ) : null}
            </Card>
          </li>
        ))}
      </ul>

      {canEdit ? (
        <Button variant="outline" size="sm" className="mt-4" onClick={onAdd}>
          <Plus className="size-4" />
          Add {kind === "product" ? "a product" : "a material"}
        </Button>
      ) : null}
    </>
  );
}

/** Notes save on blur rather than on every keystroke: a request per
    character is absurd, and a debounce that fires mid-sentence writes
    half a thought. */
function SpaceNotes({
  spaceId,
  initial,
  canEdit,
}: {
  spaceId: string;
  initial: string;
  canEdit: boolean;
}) {
  const toast = useToast();
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(initial);

  async function commit() {
    if (value === saved) return;
    try {
      const response = await fetch(`/api/v1/studio/spaces/${spaceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: value }),
      });
      if (!response.ok) throw new Error("Could not save your notes");
      setSaved(value);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save your notes");
    }
  }

  if (!canEdit) {
    return value ? (
      <p className="max-w-2xl whitespace-pre-wrap text-body leading-relaxed text-muted">
        {value}
      </p>
    ) : (
      <p className="text-body-sm text-faint">No notes on this space.</p>
    );
  }

  return (
    <div className="max-w-2xl">
      <Textarea
        rows={12}
        value={value}
        maxLength={8000}
        aria-label="Notes about this space"
        placeholder="Measurements, quotes, what the electrician said…"
        onChange={(event) => setValue(event.target.value)}
        onBlur={commit}
      />
      <p className="mt-2 text-caption text-faint">
        {value === saved ? "Saved" : "Saves when you click away"}
      </p>
    </div>
  );
}

/** Adding a material, a colour or a product typed by hand. Products
    chosen from the catalogue arrive through Shop this look instead, which
    already knows the slug and the price. */
function AddItemDialog({
  spaceId,
  kind,
  onClose,
  onAdded,
}: {
  spaceId: string;
  kind: ItemKind;
  onClose: () => void;
  onAdded: () => void;
}) {
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [surface, setSurface] = useState("");
  const [qty, setQty] = useState("1");
  const [unit, setUnit] = useState("");
  const [price, setPrice] = useState("");
  const [hex, setHex] = useState("#d9c9b4");
  const [busy, setBusy] = useState(false);

  async function submit() {
    const trimmed = title.trim();
    if (!trimmed && kind !== "color") return;

    setBusy(true);
    try {
      const rupees = Number(price.replace(/[^0-9.]/g, ""));
      const response = await fetch(`/api/v1/studio/spaces/${spaceId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          title: trimmed || hex,
          ...(kind === "color" ? { hex } : {}),
          ...(kind !== "color"
            ? {
                surface: surface.trim(),
                qty: Number(qty) || 1,
                unit: unit.trim(),
                /* Rupees in, paise stored — converted once, here. */
                unitPricePaise:
                  Number.isFinite(rupees) && rupees > 0 ? Math.round(rupees * 100) : 0,
              }
            : {}),
        }),
      });

      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message ?? "Could not add it");

      onAdded();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add it");
    } finally {
      setBusy(false);
    }
  }

  const heading =
    kind === "color" ? "Add a colour" : kind === "product" ? "Add a product" : "Add a material";

  return (
    <Modal
      open
      onClose={onClose}
      title={heading}
      footer={
        <div className="flex gap-2">
          <Button onClick={submit} disabled={busy}>
            {busy ? <Spinner className="size-4" /> : null}
            Add
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {kind === "color" ? (
          <>
            <Field label="Colour" htmlFor="item-hex">
              <div className="flex items-center gap-3">
                <input
                  id="item-hex"
                  type="color"
                  value={hex}
                  onChange={(event) => setHex(event.target.value)}
                  className="h-11 w-16 cursor-pointer rounded-md border border-line bg-surface p-1"
                />
                <Input
                  value={title}
                  maxLength={40}
                  placeholder="Warm beige"
                  aria-label="Name of the colour"
                  onChange={(event) => setTitle(event.target.value)}
                />
              </div>
            </Field>
          </>
        ) : (
          <>
            <Field label="Name" htmlFor="item-title" required>
              <Input
                id="item-title"
                autoFocus
                value={title}
                maxLength={160}
                placeholder={kind === "product" ? "Brushed brass mixer" : "Italian marble"}
                onChange={(event) => setTitle(event.target.value)}
              />
            </Field>

            <Field label="Where it goes" htmlFor="item-surface">
              <Select
                id="item-surface"
                value={surface}
                onChange={(event) => setSurface(event.target.value)}
              >
                <option value="">Not sure yet</option>
                {["Flooring", "Walls", "Ceiling", "Hardware", "Joinery", "Lighting", "Fittings"].map(
                  (option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ),
                )}
              </Select>
            </Field>

            <div className="grid grid-cols-3 gap-3">
              <Field label="Quantity" htmlFor="item-qty">
                <Input
                  id="item-qty"
                  inputMode="decimal"
                  value={qty}
                  onChange={(event) => setQty(event.target.value)}
                />
              </Field>
              <Field label="Unit" htmlFor="item-unit">
                <Input
                  id="item-unit"
                  value={unit}
                  maxLength={20}
                  placeholder="sq.ft."
                  onChange={(event) => setUnit(event.target.value)}
                />
              </Field>
              <Field label="Price each" htmlFor="item-price">
                <Input
                  id="item-price"
                  inputMode="decimal"
                  value={price}
                  placeholder="₹"
                  onChange={(event) => setPrice(event.target.value)}
                />
              </Field>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import { Layers } from "@/components/icons";
import { cn } from "@/components/ui/cn";
import { useProjects } from "@/lib/store/projects";
import { formatPrice } from "@/lib/types/catalog";
import type { RoomMaterial } from "@/lib/types/studio";

/**
 * Putting a whole room onto a build.
 *
 * The lines land as project *materials*, not as cart items, and the
 * difference is the whole point of the button: `ProjectMaterial` is a
 * plan — a quantity somebody intends to buy, at today's price, which the
 * hub then tracks against what was actually ordered. A room dropped
 * straight into the cart would be a decision to buy eighteen things
 * today, which is not what "add all to project" means to someone still
 * choosing a kitchen.
 *
 * Quantities are carried across unsnapped. `ProjectMaterial.qty` is a
 * Float and is deliberately not put on the variant's sellable grid here —
 * that happens when the plan becomes an order, and rounding a plan up to
 * a pack size months early overstates the budget.
 *
 * One line at a time, and a partial failure is reported as a partial
 * failure. The alternative — a transaction endpoint for this one screen —
 * buys atomicity nobody asked for over a list somebody can see and
 * correct.
 */
export function AddAllToProject({
  materials,
  roomName,
  totalPaise,
  open,
  onClose,
}: {
  materials: RoomMaterial[];
  roomName: string;
  totalPaise: number;
  open: boolean;
  onClose: () => void;
}) {
  const { projects, ready, addMaterial } = useProjects();
  const toast = useToast();

  const [chosen, setChosen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!chosen) return;
    setBusy(true);

    let added = 0;
    try {
      for (const line of materials) {
        await addMaterial(chosen, {
          title: line.product.title,
          qty: line.qty,
          unit: line.unit || undefined,
          unitPricePaise: line.variant.price,
          productSlug: line.product.slug,
          variantId: line.variant.id,
          brand: line.product.brand ?? undefined,
        });
        added += 1;
      }
      toast.success(
        `${added} ${added === 1 ? "material" : "materials"} added from ${roomName}`,
      );
      onClose();
    } catch (error) {
      /* Says how far it got. "Something went wrong" after eleven of
         eighteen lines landed leaves somebody to work out by hand which
         seven are missing. */
      toast.error(
        added > 0
          ? `Added ${added} of ${materials.length}. ${
              error instanceof Error ? error.message : "The rest did not save."
            }`
          : error instanceof Error
            ? error.message
            : "Could not add these to the project",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add to a project"
      description={`${materials.length} ${
        materials.length === 1 ? "material" : "materials"
      } · ${formatPrice(totalPaise)} at today's list price`}
      footer={
        projects.length > 0 ? (
          <div className="flex gap-2">
            <Button onClick={submit} disabled={!chosen || busy}>
              {busy ? <Spinner className="size-4" /> : null}
              Add to project
            </Button>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
          </div>
        ) : null
      }
    >
      {!ready ? (
        <p className="flex items-center gap-2 py-6 text-body-sm text-muted">
          <Spinner className="size-4" />
          Loading your projects
        </p>
      ) : projects.length === 0 ? (
        <EmptyState
          icon={<Layers className="size-6" />}
          title="No projects yet"
          action={{ href: "/projects/new", label: "Start a project" }}
          compact
        >
          A project holds the budget, the task list and every order for one
          build. Start one and this room&rsquo;s materials can go straight onto it.
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-2">
          {projects.map((project) => (
            <li key={project.id}>
              <button
                type="button"
                onClick={() => setChosen(project.id)}
                aria-pressed={chosen === project.id}
                className={cn(
                  "flex w-full min-h-11 items-center justify-between gap-3 rounded-card border px-4 py-3 text-left transition-colors",
                  chosen === project.id
                    ? "border-accent bg-accent-wash"
                    : "border-line-soft bg-surface hover:bg-hover",
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate text-body font-medium text-ink">
                    {project.name}
                  </span>
                  {project.location && (
                    <span className="block truncate text-caption text-faint">
                      {project.location}
                    </span>
                  )}
                </span>
                {project.budgetPaise > 0 && (
                  <span className="nums shrink-0 text-caption text-muted">
                    {formatPrice(project.budgetPaise)}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

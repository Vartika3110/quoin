"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Input, Select } from "@/components/ui/Input";
import { InlineError } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";
import { Check } from "@/components/icons";
import { track } from "@/lib/analytics";
import { useProjects } from "@/lib/store/projects";

/**
 * Offers to file a just-placed (or already-placed) order under a project,
 * without ever requiring one — most orders are one-off pickups, and a
 * project is a renovation someone is deliberately tracking.
 *
 * Linking, not moving: an order is not owned by a project the way a task
 * is (see `linkOrder`, `src/lib/data/projects.ts`) — it is annotated onto
 * one so the project's spend and delivery list can include it. A 409
 * (already linked) is therefore not a failure to surface: the order is
 * already exactly where the customer asked it to be, whether this request
 * or an earlier one put it there.
 *
 * `useProjects()` exposes no "signed in" flag, only a list that is empty
 * both when there is nothing yet and — silently, by design, see the
 * provider's 401 handling — when the caller is signed out. Checkout and
 * every screen this is used from today requires a session to reach at
 * all, so that ambiguity is never actually reachable here; it is not
 * papered over with a guess.
 */

const NEW_PROJECT_VALUE = "__new__";
const MAX_NAME_LENGTH = 120;

type Outcome =
  | { kind: "success"; projectId: string; projectName: string }
  | { kind: "skipped" };

export function AddOrderToProject({
  reference,
  compact = false,
  onDone,
}: {
  reference: string;
  compact?: boolean;
  onDone?: (projectId: string | null) => void;
}) {
  const { projects, ready, error, create, refresh } = useProjects();

  const [choice, setChoice] = useState("");
  const [newName, setNewName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const activeProjects = projects.filter((p) => p.archivedAt == null);
  const hasProjects = activeProjects.length > 0;
  const isNewChoice = !hasProjects || choice === NEW_PROJECT_VALUE;

  function skip() {
    setOutcome({ kind: "skipped" });
    onDone?.(null);
  }

  async function submit() {
    setSubmitError(null);

    let projectId = choice;
    let projectName = activeProjects.find((p) => p.id === choice)?.name ?? "";

    if (isNewChoice) {
      const name = newName.trim();
      if (!name) {
        setNameError("Give the project a name.");
        return;
      }
      setNameError(null);
    } else if (!choice) {
      return;
    }

    setSubmitting(true);
    try {
      if (isNewChoice) {
        const created = await create({
          name: newName.trim(),
          /* The only field this form actually asks for. Everything else
             a project can carry — size, location, budget, requirements —
             is something to fill in from the project page itself, not to
             invent a default for on a screen about an order. */
          kind: "other",
          sizeSqft: 0,
          location: "",
          budgetPaise: 0,
          requirements: [],
        });
        track("project_created", { kind: "other" });
        projectId = created.id;
        projectName = created.name;
      }

      const res = await fetch(`/api/v1/projects/${projectId}/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference }),
      });

      if (res.status === 201 || res.status === 409) {
        track("order_added_to_project", { reference });
        setOutcome({ kind: "success", projectId, projectName });
        onDone?.(projectId);
        return;
      }

      /* Never the route's own message: a 404 here means the reference
         does not belong to this account (or does not exist at all) and
         the wording is the one honest thing that covers both without
         confirming which. Anything else is a plain, retryable failure —
         the account and network layer already logged the real reason. */
      setSubmitError(
        res.status === 404
          ? "We couldn't find that order."
          : "Could not add this order to a project. Please try again.",
      );
    } catch {
      setSubmitError("Could not add this order to a project. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const padding = compact ? "sm" : "lg";
  const headingClass = compact
    ? "text-body-sm font-semibold text-ink"
    : "font-display text-title-sm font-semibold text-ink";

  if (!ready) {
    return (
      <Card padding={padding}>
        <Skeleton className="h-4 w-2/5" />
        <Skeleton className="mt-4 h-11 w-full" />
      </Card>
    );
  }

  if (error) {
    return (
      <Card padding={padding}>
        <p className={headingClass}>Add this order to a project?</p>
        <div className="mt-3">
          <InlineError>{error}</InlineError>
        </div>
        <Button className="mt-3" variant="outline" size="sm" onClick={refresh}>
          Try again
        </Button>
      </Card>
    );
  }

  if (outcome?.kind === "skipped") {
    return (
      <Card padding={padding}>
        <p className="text-body-sm text-muted">
          You can add it later from the order page.
        </p>
      </Card>
    );
  }

  if (outcome?.kind === "success") {
    return (
      <Card padding={padding} tone="accent">
        <p className="flex items-center gap-2 text-body-sm font-semibold text-ink">
          <Check className="size-4 shrink-0 text-accent" />
          Added to {outcome.projectName}
        </p>
        <Link
          href={`/projects/${outcome.projectId}`}
          className="mt-2 inline-block text-caption font-medium text-accent"
        >
          View project
        </Link>
      </Card>
    );
  }

  return (
    <Card padding={padding}>
      <p className={headingClass}>Add this order to a project?</p>

      <div className="mt-3 space-y-3">
        {hasProjects && (
          <Select
            aria-label="Project"
            value={choice}
            onChange={(e) => {
              setChoice(e.target.value);
              setNameError(null);
              setSubmitError(null);
            }}
          >
            <option value="" disabled>
              Choose a project
            </option>
            {activeProjects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
            <option value={NEW_PROJECT_VALUE}>+ Create a new project</option>
          </Select>
        )}

        {isNewChoice && (
          <Field label="Project name" htmlFor="add-order-project-name" error={nameError}>
            <Input
              id="add-order-project-name"
              value={newName}
              onChange={(e) => {
                setNewName(e.target.value);
                if (nameError) setNameError(null);
              }}
              placeholder="e.g. Andheri flat renovation"
              maxLength={MAX_NAME_LENGTH}
            />
          </Field>
        )}

        {submitError && <InlineError>{submitError}</InlineError>}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            loading={submitting}
            disabled={submitting || (isNewChoice ? newName.trim().length === 0 : !choice)}
            onClick={submit}
          >
            {isNewChoice ? "Create & add" : "Add to project"}
          </Button>
          <Button size="sm" variant="ghost" onClick={skip} disabled={submitting}>
            Skip
          </Button>
        </div>
      </div>
    </Card>
  );
}

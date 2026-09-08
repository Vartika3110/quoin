"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Field, Input, Select } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import { Layers } from "@/components/icons";

/**
 * Attaching a room to a build.
 *
 * The join section 19 asks for, and the reason `StudioSpace.projectId` is
 * nullable: someone saves a kitchen they like long before they decide to
 * build one, and the two facts arrive months apart. This is where the
 * second one gets recorded.
 *
 * Two paths, one dialog — pick an existing project or start one from this
 * room. The second is section 18's "use this inspiration" flow, and it
 * carries the room's name and its planned total across, so the project
 * starts with a budget rather than an empty field.
 *
 * The Project Hub itself is untouched by all of this. A project created
 * here is an ordinary project, with the ordinary wizard's defaults, and
 * it opens in the hub that already exists.
 */
interface ProjectSummary {
  id: string;
  name: string;
}

const KINDS = [
  { value: "kitchen", label: "Kitchen" },
  { value: "bathroom", label: "Bathroom" },
  { value: "renovation", label: "Renovation" },
  { value: "new_home", label: "New home" },
  { value: "office", label: "Office" },
  { value: "commercial", label: "Commercial" },
  { value: "other", label: "Something else" },
] as const;

export function LinkToProject({
  spaceId,
  spaceName,
  plannedPaise,
  budgetPaise,
}: {
  spaceId: string;
  spaceName: string;
  plannedPaise: number;
  budgetPaise: number;
}) {
  const router = useRouter();
  const toast = useToast();

  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [choice, setChoice] = useState<string>("");
  const [name, setName] = useState(spaceName);
  const [kind, setKind] = useState<string>("renovation");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || projects !== null) return;

    const controller = new AbortController();
    fetch("/api/v1/projects", { signal: controller.signal })
      .then((response) => response.json())
      .then((body) => {
        if (controller.signal.aborted) return;
        setProjects(
          (body?.data?.projects ?? []).map((p: { id: string; name: string }) => ({
            id: p.id,
            name: p.name,
          })),
        );
      })
      .catch(() => {
        if (!controller.signal.aborted) setProjects([]);
      });

    return () => controller.abort();
  }, [open, projects]);

  async function attach(projectId: string) {
    setBusy(true);
    try {
      const response = await fetch(`/api/v1/studio/spaces/${spaceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message ?? "Could not link it");

      toast.success("Linked to the project");
      setOpen(false);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not link it");
    } finally {
      setBusy(false);
    }
  }

  async function createAndAttach() {
    const trimmed = name.trim();
    if (!trimmed) return;

    setBusy(true);
    try {
      /* The ordinary projects endpoint — Studio does not get its own way
         of making a project. The budget starts from whatever this room
         already plans, which beats an empty field, and the customer can
         change it in the hub like any other project. */
      const created = await fetch("/api/v1/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmed,
          kind,
          budgetPaise: budgetPaise || plannedPaise || 0,
        }),
      });
      const body = await created.json();
      if (!created.ok) {
        throw new Error(body?.error?.message ?? "Could not create the project");
      }

      await attach(body.data.project.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create the project");
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Layers className="size-4" />
        Use for a project
      </Button>

      {open ? (
        <Modal
          open
          onClose={() => setOpen(false)}
          title="Use this space for a project"
          description="A project is the whole build — orders, deliveries, tasks and documents. A space is one room in it."
        >
          <div className="flex flex-col gap-6">
            {projects === null ? (
              <p className="flex items-center gap-2 text-body-sm text-muted">
                <Spinner className="size-4" />
                Loading your projects
              </p>
            ) : projects.length > 0 ? (
              <div className="flex flex-col gap-3">
                <Field label="Add to an existing project" htmlFor="link-project">
                  <Select
                    id="link-project"
                    value={choice}
                    onChange={(event) => setChoice(event.target.value)}
                  >
                    <option value="">Choose one…</option>
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Button
                  onClick={() => choice && attach(choice)}
                  disabled={!choice || busy}
                  size="sm"
                >
                  {busy ? <Spinner className="size-4" /> : null}
                  Link it
                </Button>
              </div>
            ) : null}

            <div className="flex flex-col gap-3 border-t border-line-hair pt-5">
              <p className="text-body font-medium text-ink">Or start a new one</p>

              <Field label="Project name" htmlFor="link-name" required>
                <Input
                  id="link-name"
                  value={name}
                  maxLength={120}
                  onChange={(event) => setName(event.target.value)}
                />
              </Field>

              <Field label="What is it" htmlFor="link-kind">
                <Select
                  id="link-kind"
                  value={kind}
                  onChange={(event) => setKind(event.target.value)}
                >
                  {KINDS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Field>

              <Button onClick={createAndAttach} disabled={busy || !name.trim()} size="sm">
                {busy ? <Spinner className="size-4" /> : null}
                Create the project
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}
    </>
  );
}

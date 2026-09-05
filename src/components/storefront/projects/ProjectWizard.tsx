"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Input";
import { InlineError } from "@/components/ui/ErrorState";
import { Steps } from "@/components/ui/Progress";
import { cn } from "@/components/ui/cn";
import { useToast } from "@/components/ui/Toast";
import {
  ArrowRight,
  Back,
  Bolt,
  Bricks,
  Building,
  Check,
  Hammer,
  Home,
  Layers,
  Roller,
  Ruler,
  Sofa,
  Tap,
} from "@/components/icons";
import {
  PROJECT_KIND_LABEL,
  useProjects,
  type ProjectKind,
} from "@/lib/store/projects";
import {
  createPersistentStore,
  usePersistentStore,
} from "@/lib/store/persistent";

/**
 * Creating a project.
 *
 * One question a screen. A single form with nine fields is faster to build
 * and slower to finish: on a phone it is a wall, and the first thing a
 * customer does with a wall is put it off. Six short screens with a
 * progress bar finish, because each one is obviously nearly over.
 *
 * The draft autosaves after every answer, so closing the tab at step four
 * — which is what happens when someone gets a call mid-flow — does not
 * cost them the first three.
 *
 * Nothing here is required except a name and a kind. A customer who does
 * not yet know their budget should still end up with a project; a form
 * that refuses to proceed without a number they have not decided is a form
 * that teaches them to invent one.
 */


const STEP_LABELS = ["Type", "Size", "Place", "Budget", "Timeline", "Scope"];

const KINDS: { id: ProjectKind; Icon: typeof Home; detail: string }[] = [
  { id: "new_home", Icon: Home, detail: "Building from the ground up" },
  { id: "renovation", Icon: Hammer, detail: "Reworking a space you have" },
  { id: "kitchen", Icon: Tap, detail: "One room, done properly" },
  { id: "bathroom", Icon: Tap, detail: "Sanitaryware, tiling, plumbing" },
  { id: "office", Icon: Building, detail: "Workspace fit-out" },
  { id: "commercial", Icon: Building, detail: "Retail, hospitality, industrial" },
  { id: "other", Icon: Layers, detail: "Something else entirely" },
];

const REQUIREMENTS: { id: string; Icon: typeof Bricks }[] = [
  { id: "Civil work", Icon: Bricks },
  { id: "Flooring", Icon: Ruler },
  { id: "Plumbing", Icon: Tap },
  { id: "Electrical", Icon: Bolt },
  { id: "Painting", Icon: Roller },
  { id: "Joinery", Icon: Sofa },
  { id: "False ceiling", Icon: Layers },
  { id: "Waterproofing", Icon: Building },
];

/** Preset budgets in rupees. Typing an exact figure is always available. */
const BUDGETS = [200_000, 500_000, 1_000_000, 2_500_000, 5_000_000];

interface Draft {
  step: number;
  name: string;
  kind: ProjectKind | null;
  sizeSqft: string;
  location: string;
  budget: string;
  startDate: string;
  targetDate: string;
  requirements: string[];
}

const EMPTY: Draft = {
  step: 0,
  name: "",
  kind: null,
  sizeSqft: "",
  location: "",
  budget: "",
  startDate: "",
  targetDate: "",
  requirements: [],
};

/* The in-progress answers, persisted so closing the tab at step four —
   which is what happens when someone gets a call mid-flow — does not cost
   them the first three. */
const draftStore = createPersistentStore<Draft>("project-draft", 1, EMPTY);

export function ProjectWizard({ areas }: { areas: { slug: string; name: string }[] }) {
  const router = useRouter();
  const toast = useToast();
  const { create } = useProjects();
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  /* Reads and writes storage directly — no effect, and the answers are
     already persisted by the time the next question renders. */
  const [draft, setDraft] = usePersistentStore(draftStore);

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const step = draft.step;
  const go = (next: number) =>
    set({ step: Math.max(0, Math.min(STEP_LABELS.length - 1, next)) });

  /* A real request now, so a dropped connection must not read as "nothing
     happened" — the answers stay in `draftStore` either way, so a retry
     costs one tap, not the whole form. */
  async function finish() {
    setSubmitting(true);
    setSubmitError(null);
    const today = new Date().toISOString().slice(0, 10);
    try {
      const project = await create({
        name: draft.name.trim() || defaultName(draft.kind),
        kind: draft.kind ?? "other",
        sizeSqft: Number(draft.sizeSqft) || 0,
        location: draft.location.trim(),
        /* Rupees in the form, paise in the store — the same boundary the
           rest of the app keeps. */
        budgetPaise: Math.round((Number(draft.budget) || 0) * 100),
        startDate: draft.startDate || today,
        /* Left out entirely rather than sent as `""` — the server treats
           an omitted date as "not set" but validates any date it is
           actually given, and an empty string is not a calendar day. */
        targetDate: draft.targetDate || undefined,
        requirements: draft.requirements,
      });

      setDraft(EMPTY);
      toast.success("Project created");
      router.push(`/projects/${project.id}`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  /* Only the first step gates progress. Everything after it is a question
     the customer may not have an answer to yet. */
  const canContinue = step === 0 ? draft.kind != null : true;

  return (
    <div className="mx-auto max-w-xl">
      <Steps steps={STEP_LABELS} current={step} className="mb-8" />

      <div key={step} className="anim-rise">
        {step === 0 && (
          <Question
            title="What are you building?"
            detail="It sets up the first tasks on your board. You can change it later."
          >
            <div className="grid gap-2 sm:grid-cols-2">
              {KINDS.map(({ id, Icon, detail }) => (
                <Choice
                  key={id}
                  selected={draft.kind === id}
                  onClick={() => set({ kind: id })}
                  icon={<Icon className="size-5" />}
                  title={PROJECT_KIND_LABEL[id]}
                  detail={detail}
                />
              ))}
            </div>

            <Field
              label="Give it a name"
              htmlFor="project-name"
              hint="Optional — we will name it after the type if you skip this."
              className="mt-6"
            >
              <Input
                id="project-name"
                value={draft.name}
                onChange={(e) => set({ name: e.target.value })}
                placeholder={defaultName(draft.kind)}
              />
            </Field>
          </Question>
        )}

        {step === 1 && (
          <Question
            title="How big is it?"
            detail="Built-up area in square feet. It is only used to sanity-check quantities."
          >
            <Field label="Area" htmlFor="project-size">
              <Input
                id="project-size"
                type="number"
                inputMode="numeric"
                min={0}
                value={draft.sizeSqft}
                onChange={(e) => set({ sizeSqft: e.target.value })}
                placeholder="1200"
                trailing={<span className="text-caption">sq.ft.</span>}
                className="nums"
              />
            </Field>
          </Question>
        )}

        {step === 2 && (
          <Question
            title="Where is the site?"
            detail="Delivery times are worked out from here."
          >
            <div className="flex flex-wrap gap-2">
              {areas.map((area) => (
                <button
                  key={area.slug}
                  type="button"
                  onClick={() => set({ location: area.name })}
                  aria-pressed={draft.location === area.name}
                  className={cn(
                    "min-h-11 rounded-lg border px-4 text-body transition-colors",
                    draft.location === area.name
                      ? "border-accent bg-accent-wash text-accent"
                      : "border-line bg-surface text-ink hover:border-line-strong",
                  )}
                >
                  {area.name}
                </button>
              ))}
            </div>

            <Field
              label="Or type it"
              htmlFor="project-location"
              className="mt-5"
              hint="Anywhere — Quoin delivers to the areas above, but a project can be anywhere."
            >
              <Input
                id="project-location"
                value={draft.location}
                onChange={(e) => set({ location: e.target.value })}
                placeholder="Sector 47, Gurugram"
              />
            </Field>
          </Question>
        )}

        {step === 3 && (
          <Question
            title="What is the budget?"
            detail="A working figure. The dashboard tracks spend against it and tells you when it is close."
          >
            <div className="flex flex-wrap gap-2">
              {BUDGETS.map((amount) => (
                <button
                  key={amount}
                  type="button"
                  onClick={() => set({ budget: String(amount) })}
                  aria-pressed={draft.budget === String(amount)}
                  className={cn(
                    "nums min-h-11 rounded-lg border px-4 text-body transition-colors",
                    draft.budget === String(amount)
                      ? "border-accent bg-accent-wash text-accent"
                      : "border-line bg-surface text-ink hover:border-line-strong",
                  )}
                >
                  {compactRupees(amount)}
                </button>
              ))}
            </div>

            <Field label="Or an exact figure" htmlFor="project-budget" className="mt-5">
              <Input
                id="project-budget"
                type="number"
                inputMode="numeric"
                min={0}
                value={draft.budget}
                onChange={(e) => set({ budget: e.target.value })}
                leading={<span className="text-body">₹</span>}
                className="nums"
              />
            </Field>
          </Question>
        )}

        {step === 4 && (
          <Question
            title="When does it run?"
            detail="Rough dates are fine — they drive the timeline, not a contract."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Starting" htmlFor="project-start">
                <Input
                  id="project-start"
                  type="date"
                  value={draft.startDate}
                  onChange={(e) => set({ startDate: e.target.value })}
                  className="nums"
                />
              </Field>
              <Field label="Hoping to finish" htmlFor="project-target">
                <Input
                  id="project-target"
                  type="date"
                  value={draft.targetDate}
                  onChange={(e) => set({ targetDate: e.target.value })}
                  className="nums"
                />
              </Field>
            </div>
          </Question>
        )}

        {step === 5 && (
          <Question
            title="What does it need?"
            detail="Each one becomes a task on the board. Pick as many as apply."
          >
            <div className="grid gap-2 sm:grid-cols-2">
              {REQUIREMENTS.map(({ id, Icon }) => {
                const on = draft.requirements.includes(id);
                return (
                  <Choice
                    key={id}
                    selected={on}
                    onClick={() =>
                      set({
                        requirements: on
                          ? draft.requirements.filter((r) => r !== id)
                          : [...draft.requirements, id],
                      })
                    }
                    icon={<Icon className="size-5" />}
                    title={id}
                  />
                );
              })}
            </div>
          </Question>
        )}
      </div>

      <div className="mt-8 flex items-center gap-3">
        {step > 0 && (
          <Button variant="ghost" onClick={() => go(step - 1)}>
            <Back className="size-4" />
            Back
          </Button>
        )}

        {step < STEP_LABELS.length - 1 ? (
          <Button className="ml-auto" disabled={!canContinue} onClick={() => go(step + 1)}>
            Continue
            <ArrowRight className="size-4" />
          </Button>
        ) : (
          <Button className="ml-auto" size="lg" onClick={finish} loading={submitting}>
            Create the project
            <ArrowRight className="size-4" />
          </Button>
        )}
      </div>

      {submitError && (
        <div className="mt-4">
          <InlineError>{submitError}</InlineError>
        </div>
      )}

      {step > 0 && step < STEP_LABELS.length - 1 && (
        <button
          type="button"
          onClick={() => go(step + 1)}
          className="mx-auto mt-4 block text-caption text-muted transition-colors hover:text-accent"
        >
          Skip this
        </button>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- parts */

function Question({
  title,
  detail,
  children,
}: {
  title: string;
  detail: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-headline font-semibold text-ink">{title}</h2>
      <p className="mt-2 text-body leading-relaxed text-muted">{detail}</p>
      <div className="mt-6">{children}</div>
    </section>
  );
}

/**
 * A large touch-friendly choice.
 *
 * 64px tall, the whole tile a target. The tick is drawn rather than
 * implied by colour alone — a selected state carried only by a tint fails
 * for anyone who cannot see the tint.
 */
function Choice({
  selected,
  onClick,
  icon,
  title,
  detail,
}: {
  selected: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  detail?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "flex min-h-16 items-center gap-3 rounded-card border p-4 text-left transition-[border-color,background-color,transform] duration-150",
        selected
          ? "border-accent bg-accent-wash"
          : "border-line bg-surface hover:border-line-strong active:scale-[0.99]",
      )}
    >
      <span
        className={cn(
          "grid size-10 shrink-0 place-items-center rounded-lg transition-colors",
          selected ? "bg-accent text-on-accent" : "bg-raised text-muted",
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-body font-medium text-ink">{title}</span>
        {detail && (
          <span className="mt-0.5 block text-micro leading-snug text-muted">
            {detail}
          </span>
        )}
      </span>
      {selected && <Check className="size-4 shrink-0 text-accent" />}
    </button>
  );
}

function defaultName(kind: ProjectKind | null): string {
  return kind ? `My ${PROJECT_KIND_LABEL[kind].toLowerCase()}` : "My project";
}

/** "₹5L", "₹25L", "₹1Cr" — how budgets are actually spoken about here. */
function compactRupees(rupees: number): string {
  if (rupees >= 10_000_000) return `₹${rupees / 10_000_000}Cr`;
  if (rupees >= 100_000) return `₹${rupees / 100_000}L`;
  return `₹${(rupees / 1000).toFixed(0)}k`;
}

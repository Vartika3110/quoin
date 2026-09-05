import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Project } from "@/lib/store/projects";

/* Unlike the other suites, nothing here needs `DATABASE_URL`/`AUTH_SECRET`
   set before importing: `projects.tsx` takes only *type* imports from
   `@/lib/data/projects` (erased at compile time — see the file-level
   comment there on why), so `@/lib/db` and `@/lib/env` are never actually
   loaded by this test. */
const {
  isLegacyProject,
  shouldOfferLocalImport,
  startingTaskSeeds,
  summarise,
} = await import("@/lib/store/projects");

/** A minimally complete project — every test overrides only what it
    actually varies, so a field nobody here cares about cannot make a test
    fail for the wrong reason. */
function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: "proj_1",
    name: "Test project",
    kind: "renovation",
    sizeSqft: 0,
    location: "",
    budgetPaise: 0,
    startDate: null,
    targetDate: null,
    requirements: [],
    notes: "",
    isSample: false,
    archivedAt: null,
    createdAt: Date.now(),
    tasks: [],
    materials: [],
    milestones: [],
    documents: [],
    orders: [],
    ...overrides,
  } as Project;
}

describe("summarise: budget arithmetic", () => {
  it("splits materials into committed (ordered/delivered) and planned", () => {
    const project = makeProject({
      budgetPaise: 100_000,
      materials: [
        { id: "m1", title: "Cement", qty: 10, unit: "bags", unitPricePaise: 1_000, status: "ordered", productSlug: null, variantId: null, brand: null, expectedOn: null },
        { id: "m2", title: "Tiles", qty: 5, unit: "sq.ft.", unitPricePaise: 2_000, status: "delivered", productSlug: null, variantId: null, brand: null, expectedOn: null },
        { id: "m3", title: "Paint", qty: 2, unit: "L", unitPricePaise: 3_000, status: "planned", productSlug: null, variantId: null, brand: null, expectedOn: null },
      ],
    });

    const summary = summarise(project);

    assert.equal(summary.spentPaise, 10 * 1_000 + 5 * 2_000);
    assert.equal(summary.plannedPaise, 2 * 3_000);
    assert.equal(summary.remainingPaise, 100_000 - summary.spentPaise);
    assert.equal(summary.overBudget, summary.spentPaise > 100_000);
  });

  it("shows overspend as a negative remainder rather than clamping to zero", () => {
    const project = makeProject({
      budgetPaise: 1_000,
      materials: [
        { id: "m1", title: "Steel", qty: 1, unit: "kg", unitPricePaise: 5_000, status: "ordered", productSlug: null, variantId: null, brand: null, expectedOn: null },
      ],
    });

    const summary = summarise(project);

    assert.equal(summary.remainingPaise, 1_000 - 5_000);
    assert.equal(summary.overBudget, true);
  });
});

describe("summarise: progress arithmetic", () => {
  it("is null with no tasks, rather than 0%", () => {
    assert.equal(summarise(makeProject({ tasks: [] })).progressPct, null);
  });

  it("rounds the done fraction to a whole percent", () => {
    const project = makeProject({
      tasks: [
        { id: "t1", title: "A", status: "done", phase: null, dueDate: null },
        { id: "t2", title: "B", status: "done", phase: null, dueDate: null },
        { id: "t3", title: "C", status: "todo", phase: null, dueDate: null },
      ],
    });

    const summary = summarise(project);
    assert.equal(summary.tasksDone, 2);
    assert.equal(summary.tasksTotal, 3);
    assert.equal(summary.progressPct, 67); // 2/3 rounds up
  });

  it("is 100 when every task is done", () => {
    const project = makeProject({
      tasks: [{ id: "t1", title: "A", status: "done", phase: null, dueDate: null }],
    });
    assert.equal(summarise(project).progressPct, 100);
  });
});

describe("summarise: upcoming deliveries", () => {
  it("includes only ordered materials with a future-or-today expected date", () => {
    const today = new Date().toISOString().slice(0, 10);
    const future = "2999-01-01";
    const past = "2000-01-01";

    const project = makeProject({
      materials: [
        { id: "m1", title: "Due today, ordered", qty: 1, unit: "u", unitPricePaise: 0, status: "ordered", productSlug: null, variantId: null, brand: null, expectedOn: today },
        { id: "m2", title: "Future, ordered", qty: 1, unit: "u", unitPricePaise: 0, status: "ordered", productSlug: null, variantId: null, brand: null, expectedOn: future },
        { id: "m3", title: "Past, ordered", qty: 1, unit: "u", unitPricePaise: 0, status: "ordered", productSlug: null, variantId: null, brand: null, expectedOn: past },
        { id: "m4", title: "Future, but only planned", qty: 1, unit: "u", unitPricePaise: 0, status: "planned", productSlug: null, variantId: null, brand: null, expectedOn: future },
        { id: "m5", title: "Future, delivered already", qty: 1, unit: "u", unitPricePaise: 0, status: "delivered", productSlug: null, variantId: null, brand: null, expectedOn: future },
        { id: "m6", title: "No date, ordered", qty: 1, unit: "u", unitPricePaise: 0, status: "ordered", productSlug: null, variantId: null, brand: null, expectedOn: null },
      ],
    });

    const upcoming = summarise(project).upcoming.map((m) => m.id);
    assert.deepEqual(upcoming.sort(), ["m1", "m2"].sort());
  });

  it("sorts soonest first", () => {
    const project = makeProject({
      materials: [
        { id: "later", title: "Later", qty: 1, unit: "u", unitPricePaise: 0, status: "ordered", productSlug: null, variantId: null, brand: null, expectedOn: "2999-06-01" },
        { id: "sooner", title: "Sooner", qty: 1, unit: "u", unitPricePaise: 0, status: "ordered", productSlug: null, variantId: null, brand: null, expectedOn: "2999-01-01" },
      ],
    });

    assert.deepEqual(
      summarise(project).upcoming.map((m) => m.id),
      ["sooner", "later"],
    );
  });
});

describe("shouldOfferLocalImport", () => {
  it("offers when legacy projects exist and this browser has not decided", () => {
    assert.equal(shouldOfferLocalImport(1, false), true);
    assert.equal(shouldOfferLocalImport(3, false), true);
  });

  it("stays quiet once a decision is already recorded", () => {
    assert.equal(shouldOfferLocalImport(1, true), false);
    assert.equal(shouldOfferLocalImport(5, true), false);
  });

  it("stays quiet when there is nothing to import, decided or not", () => {
    assert.equal(shouldOfferLocalImport(0, false), false);
    assert.equal(shouldOfferLocalImport(0, true), false);
  });
});

describe("isLegacyProject", () => {
  const valid = {
    id: "p1",
    name: "Old project",
    kind: "kitchen",
    sizeSqft: 100,
    location: "Gurugram",
    budgetPaise: 500_000,
    startDate: "2025-01-01",
    targetDate: "2025-06-01",
    requirements: ["Flooring"],
    tasks: [],
    materials: [],
    milestones: [],
    notes: "",
  };

  it("accepts a well-shaped legacy row", () => {
    assert.equal(isLegacyProject(valid), true);
  });

  it("rejects anything that is not an object", () => {
    assert.equal(isLegacyProject(null), false);
    assert.equal(isLegacyProject(undefined), false);
    assert.equal(isLegacyProject("a project"), false);
    assert.equal(isLegacyProject(42), false);
  });

  it("rejects a kind outside the known vocabulary", () => {
    assert.equal(isLegacyProject({ ...valid, kind: "mansion" }), false);
  });

  it("rejects a row missing required array fields", () => {
    const withoutTasks: Record<string, unknown> = { ...valid };
    delete withoutTasks.tasks;
    assert.equal(isLegacyProject(withoutTasks), false);
  });

  it("rejects a row where tasks/materials/milestones are not arrays", () => {
    assert.equal(isLegacyProject({ ...valid, tasks: "not an array" }), false);
  });
});

describe("startingTaskSeeds", () => {
  const draft = {
    name: "New kitchen",
    kind: "kitchen" as const,
    sizeSqft: 120,
    location: "Pune",
    budgetPaise: 200_000,
    requirements: ["Plumbing", "Electrical"],
  };

  it("always includes the two planning tasks", () => {
    const seeds = startingTaskSeeds({ ...draft, requirements: [] });
    assert.deepEqual(
      seeds.map((s) => s.title),
      ["Confirm scope and drawings", "Set the working budget"],
    );
  });

  it("adds one task per chosen requirement, phased under that requirement", () => {
    const seeds = startingTaskSeeds(draft);
    const fromRequirements = seeds.slice(2);
    assert.deepEqual(
      fromRequirements.map((s) => ({ title: s.title, phase: s.phase, status: s.status })),
      [
        { title: "Plan plumbing", phase: "Plumbing", status: "todo" },
        { title: "Plan electrical", phase: "Electrical", status: "todo" },
      ],
    );
  });

  it("never assigns ids — the server does, for every seed alike", () => {
    for (const seed of startingTaskSeeds(draft)) {
      assert.equal("id" in seed, false);
    }
  });
});

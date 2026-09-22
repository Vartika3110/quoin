import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Progress } from "@/components/ui/Progress";
import { Layers } from "@/components/icons";
import { formatPrice } from "@/lib/types/catalog";
import { plural } from "@/lib/account/greeting";
import { DashboardCardHead } from "@/components/storefront/account/dashboard/DashboardCardHead";
import type { AccountOverviewProject } from "@/lib/data/account-overview";

/** `ProjectMilestone.date` is a `@db.Date` column, stored at midnight
    UTC — `timeZone: "UTC"` reads the calendar day back exactly as it was
    written, the same reasoning `formatConsultDay`
    (`src/lib/types/consult.ts`) gives for the technique. */
const MILESTONE_DATE_FORMAT = new Intl.DateTimeFormat("en-IN", {
  timeZone: "UTC",
  day: "numeric",
  month: "short",
});

export function ProjectsCard({
  activeProjectCount,
  top,
}: {
  activeProjectCount: number;
  top: AccountOverviewProject[];
}) {
  return (
    <Card padding="lg" className="anim-rise flex h-full flex-col">
      <DashboardCardHead icon={<Layers className="size-4.5" />} title="Projects" />

      {activeProjectCount === 0 ? (
        <>
          <p className="mt-3 flex-1 text-body-sm leading-relaxed text-muted">
            Your projects will live here.
          </p>
          <Button href="/projects/new" variant="outline" size="sm" className="mt-4 self-start">
            Create Project
          </Button>
        </>
      ) : (
        <>
          <p className="nums mt-3 text-title-sm font-semibold text-ink">
            {activeProjectCount} {plural(activeProjectCount, "Active Project", "Active Projects")}
          </p>

          <ul className="mt-4 flex-1 space-y-4">
            {top.map((project) => (
              <li key={project.id} className="border-t border-line-hair pt-4 first:border-t-0 first:pt-0">
                <p className="truncate text-body-sm font-medium text-ink">{project.name}</p>

                {project.progressPct != null ? (
                  <div className="mt-2">
                    <Progress
                      value={project.progressPct}
                      label={`${project.name} progress`}
                      size="sm"
                    />
                  </div>
                ) : (
                  <p className="mt-2 text-micro text-faint">No tasks yet</p>
                )}

                <div className="nums mt-2 flex flex-wrap gap-x-4 gap-y-1 text-micro text-muted">
                  <span>
                    Budget <span className="text-ink">{formatPrice(project.money.budgetPaise)}</span>
                  </span>
                  <span>
                    Spent <span className="text-ink">{formatPrice(project.money.spentPaise)}</span>
                  </span>
                </div>

                {project.nextMilestone && (
                  <p className="mt-1 truncate text-micro text-muted">
                    Next: {project.nextMilestone.title} ·{" "}
                    {MILESTONE_DATE_FORMAT.format(project.nextMilestone.date)}
                  </p>
                )}
              </li>
            ))}
          </ul>

          <Button href="/account/projects" variant="outline" size="sm" className="mt-4 self-start">
            View Projects
          </Button>
        </>
      )}
    </Card>
  );
}

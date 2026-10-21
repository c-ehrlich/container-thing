import { cn } from "@repo/ui/lib/utils";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { Link, createFileRoute, getRouteApi } from "@tanstack/react-router";
import { ArrowUpRightIcon, CircleCheckIcon } from "lucide-react";

import { AddServiceDialog } from "../../../add-service/add-service-dialog";
import { useDismissed } from "../../../overview/dismissed";
import { DotGrid } from "../../../overview/dot-grid";
import { KIND_DOT, healthOf, primaryEnvironment, verdictOf } from "../../../overview/health";
import { insightsFor } from "../../../overview/insights";
import { InsightItem } from "../../../overview/insights-panel";
import { MonthlyCost } from "../../../overview/monthly-cost";
import { TopologyDiagram } from "../../../overview/topology-diagram";
import { ServiceTable } from "../../../project/service-table";
import { projectOverviewQuery, projectUsageQuery } from "../../../railway/overview";

export const Route = createFileRoute("/projects/$projectId/")({
  component: ProjectPage,
});

const projectRoute = getRouteApi("/projects/$projectId");
const rootRoute = getRouteApi("__root__");

/**
 * One project, one environment at a time: what's wrong and what to do about it, the shape of the
 * environment, and every service with its numbers. A service opens its own page.
 */
function ProjectPage() {
  const { projectId } = projectRoute.useParams();
  const { environmentId } = projectRoute.useSearch();
  const { dismissed: initiallyDismissed } = projectRoute.useLoaderData();
  const { viewer } = rootRoute.useLoaderData();
  const { data: project } = useSuspenseQuery(projectOverviewQuery(projectId));
  const { data: usage } = useQuery(projectUsageQuery(projectId));
  const dismissed = useDismissed(initiallyDismissed);

  const environment =
    project.environments.find((e) => e.id === environmentId) ?? primaryEnvironment(project);
  const workspace = viewer?.workspaces.find((w) => w.projects.some((p) => p.id === projectId));
  const insights = insightsFor([{ project, usage }]);
  const shown = insights.filter(
    (i) =>
      !dismissed.isDismissed(i.key) && (!i.service || i.service.environment.id === environment?.id),
  );
  const domains = environment?.services.flatMap((s) => s.domains) ?? [];
  const verdict = verdictOf(healthOf(project, environment));

  return (
    <div className="mx-auto grid w-full max-w-7xl gap-8 p-8">
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div className="grid gap-1">
          {workspace && <p className="text-sm text-muted-foreground">{workspace.name}</p>}
          <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className={cn("size-2 rounded-full", KIND_DOT[verdict.kind])} />
            {verdict.label}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          {domains.slice(0, 3).map((domain) => (
            <a
              key={domain}
              href={`https://${domain}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
            >
              {domain}
              <ArrowUpRightIcon className="size-3.5" />
            </a>
          ))}
          <MonthlyCost usage={usage} />
        </div>
      </header>

      {project.environments.length > 1 && (
        <nav className="-mt-2 flex flex-wrap gap-1 border-b">
          {project.environments.map((env) => (
            <Link
              key={env.id}
              to="/projects/$projectId"
              params={{ projectId }}
              search={{ environmentId: env.id }}
              className={cn(
                "-mb-px flex items-center gap-2 border-b-2 border-transparent px-3 py-2 text-sm text-muted-foreground hover:text-foreground",
                env.id === environment?.id && "border-primary font-medium text-foreground",
              )}
            >
              <span
                className={cn("size-1.5 rounded-full", KIND_DOT[healthOf(project, env).kind])}
              />
              {env.name}
              <span className="text-xs text-muted-foreground tabular-nums">
                {env.services.length}
              </span>
            </Link>
          ))}
        </nav>
      )}

      {environment && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <DotGrid className="relative min-h-80 rounded-xl border">
            <TopologyDiagram
              project={project}
              environment={environment}
              usage={usage}
              highlight={highlightFor(shown)}
            />
            <div className="absolute top-3 right-3">
              <AddServiceDialog projectId={projectId} environmentId={environment.id} />
            </div>
          </DotGrid>

          <section className="grid content-start gap-2">
            <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Insights
            </h2>
            {shown.length === 0 ? (
              <p className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
                <CircleCheckIcon className="size-4 text-success" />
                Nothing needs you in {environment.name}.
              </p>
            ) : (
              shown.map((insight) => (
                <InsightItem
                  key={insight.key}
                  insight={insight}
                  onDismiss={() => dismissed.dismiss(insight.key)}
                />
              ))
            )}
          </section>
        </div>
      )}

      {/* An empty environment says so on the canvas above. */}
      {environment && environment.services.length > 0 && (
        <ServiceTable
          project={project}
          environment={environment}
          usage={usage}
          insights={insights}
        />
      )}
    </div>
  );
}

/** The first failure on screen and what depends on it, so the diagram points at it. */
function highlightFor(insights: ReturnType<typeof insightsFor>) {
  const failure = insights.find((i) => i.severity === "critical" && i.service);
  return failure?.service
    ? { failed: failure.service.name, affected: failure.impact?.dependents ?? [] }
    : undefined;
}

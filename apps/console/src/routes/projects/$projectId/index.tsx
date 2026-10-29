import { cn } from "@repo/ui/lib/utils";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { Link, createFileRoute, getRouteApi } from "@tanstack/react-router";
import { ArrowUpRightIcon, CircleCheckIcon } from "lucide-react";

import { AddServiceDialog } from "../../../components/add-service/add-service-dialog";
import { DotGrid } from "../../../components/overview/dot-grid";
import { InsightItem } from "../../../components/overview/insights-panel";
import { MonthlyCost } from "../../../components/overview/monthly-cost";
import { TopologyDiagram } from "../../../components/overview/topology-diagram";
import { ServiceTable } from "../../../components/project/service-table";
import { KIND_DOT } from "../../../components/status-colors";
import { useDismissed } from "../../../domains/insights/dismissed";
import { healthOf } from "../../../domains/insights/health";
import { insightsFor } from "../../../domains/insights/insights";
import { pickEnvironment } from "../../../domains/project/environments";
import { projectQuery } from "../../../domains/project/project";
import { projectUsageQuery } from "../../../domains/project/usage";

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
  const { data: project } = useSuspenseQuery(projectQuery(projectId));
  const { data: usage } = useQuery(projectUsageQuery(projectId));
  const dismissed = useDismissed(initiallyDismissed);

  const environment = pickEnvironment(project, environmentId);
  const workspace = viewer?.workspaces.find((w) => w.projects.some((p) => p.id === projectId));
  const insights = insightsFor([{ project, usage }]);
  const shown = insights.filter(
    (i) =>
      !dismissed.isDismissed(i.key) && (!i.service || i.service.environment.id === environment?.id),
  );
  const domains = environment?.services.flatMap((s) => s.domains) ?? [];

  return (
    <div className="mx-auto grid w-full max-w-7xl gap-8 p-8">
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div className="grid gap-1">
          {workspace && <p className="text-sm text-muted-foreground">{workspace.name}</p>}
          {/* No status line under the name: the environment tabs' dots and the insights say it. */}
          <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          {domains.slice(0, 3).map((domain) => (
            <a
              key={domain}
              href={`https://${domain}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-muted-foreground/80 hover:text-foreground"
            >
              {domain}
              <ArrowUpRightIcon className="size-3 opacity-60" />
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
                env.id === environment?.id && "border-primary-accent font-medium text-foreground",
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
        // items-start: the diagram keeps its own height instead of stretching to the insights'.
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <DotGrid className="relative h-80 rounded-xl bg-muted/20">
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
            <h2 className="flex items-baseline gap-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Insights
              {shown.length > 0 && (
                <span className="text-muted-foreground/60 tabular-nums">{shown.length}</span>
              )}
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

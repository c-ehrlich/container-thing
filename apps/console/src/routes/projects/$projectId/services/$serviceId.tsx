import { cn } from "@repo/ui/lib/utils";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@repo/ui/primitives/empty";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { Link, createFileRoute, getRouteApi } from "@tanstack/react-router";
import { GlobeIcon } from "lucide-react";
import { useState } from "react";

import { InsightItem } from "../../../../components/overview/insights-panel";
import { ServiceStatusBadge } from "../../../../components/service-status-badge";
import { DeploymentList } from "../../../../components/service/deployment-list";
import { LogViewer } from "../../../../components/service/log-viewer";
import { MetricChart, formatCpu, formatMemory } from "../../../../components/service/metric-chart";
import { ServiceActions } from "../../../../components/service/service-actions";
import { KIND_DOT } from "../../../../components/status-colors";
import { useDismissed } from "../../../../domains/insights/dismissed";
import { ago } from "../../../../domains/insights/health";
import { insightsFor } from "../../../../domains/insights/insights";
import { deploymentState } from "../../../../domains/project/deployment-state";
import { primaryEnvironment } from "../../../../domains/project/environments";
import { projectQuery } from "../../../../domains/project/project";
import type { Project } from "../../../../domains/project/project";
import { serviceQuery } from "../../../../domains/project/service";

/** The environment asked for, else the project's primary one if the service is in it, else the first that has it. */
function environmentOf(project: Project, serviceId: string, environmentId?: string) {
  const withService = project.environments.filter((e) =>
    e.services.some((s) => s.id === serviceId),
  );
  return (
    withService.find((e) => e.id === environmentId) ??
    withService.find((e) => e.id === primaryEnvironment(project)?.id) ??
    withService[0]
  );
}

export const Route = createFileRoute("/projects/$projectId/services/$serviceId")({
  loaderDeps: ({ search }) => ({ environmentId: search.environmentId }),
  loader: async ({ context, params, deps }) => {
    const project = await context.queryClient.ensureQueryData(projectQuery(params.projectId));
    const environment = environmentOf(project, params.serviceId, deps.environmentId);
    if (environment) {
      await context.queryClient.ensureQueryData(
        serviceQuery({ ...params, environmentId: environment.id }),
      );
    }
  },
  component: ServicePage,
});

const projectRoute = getRouteApi("/projects/$projectId");

/** One service in one environment: what it's doing, its logs and deploys, and what to do about it. */
function ServicePage() {
  const { projectId, serviceId } = Route.useParams();
  const search = Route.useSearch();
  const { data: project } = useSuspenseQuery(projectQuery(projectId));
  const dismissed = useDismissed(projectRoute.useLoaderData().dismissed);
  const environment = environmentOf(project, serviceId, search.environmentId);
  const service = environment?.services.find((s) => s.id === serviceId);

  if (!environment || !service) {
    return (
      <Empty className="min-h-[60svh]">
        <EmptyHeader>
          <EmptyTitle>Service not found</EmptyTitle>
          <EmptyDescription>It may have been removed from {project.name}.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const environments = project.environments.filter((e) =>
    e.services.some((s) => s.id === serviceId),
  );
  const insights = insightsFor([{ project }]).filter(
    (i) =>
      i.service?.id === serviceId &&
      i.service.environment.id === environment.id &&
      !dismissed.isDismissed(i.key),
  );

  return (
    <div className="mx-auto grid w-full max-w-7xl gap-8 p-8">
      <header className="grid gap-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="grid gap-2">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">{service.name}</h1>
              <ServiceStatusBadge deployment={service.deployment} />
            </div>
            <p className="text-sm text-muted-foreground">
              {project.name} / {environment.name}
              {service.deployment && ` · deployed ${ago(service.deployment.createdAt)}`}
            </p>
          </div>
          <ServiceActions
            projectId={projectId}
            serviceId={serviceId}
            serviceName={service.name}
            environmentId={environment.id}
            environmentName={environment.name}
            deployment={service.deployment}
          />
        </div>
        {environments.length > 1 && (
          <nav className="flex flex-wrap gap-1" aria-label="Environments">
            {environments.map((e) => {
              const kind = deploymentState(
                e.services.find((s) => s.id === serviceId)?.deployment ?? null,
              ).kind;
              return (
                <Link
                  key={e.id}
                  to="/projects/$projectId/services/$serviceId"
                  params={{ projectId, serviceId }}
                  search={{ environmentId: e.id }}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm text-muted-foreground hover:bg-muted hover:text-foreground",
                    e.id === environment.id && "bg-muted text-foreground",
                  )}
                >
                  <span className={cn("size-1.5 rounded-full", KIND_DOT[kind])} />
                  {e.name}
                </Link>
              );
            })}
          </nav>
        )}
      </header>

      {insights.map((insight) => (
        <InsightItem
          key={insight.key}
          insight={insight}
          onDismiss={() => dismissed.dismiss(insight.key)}
        />
      ))}

      <ServiceBody
        projectId={projectId}
        serviceId={serviceId}
        environmentId={environment.id}
        currentDeploymentId={service.deployment?.id}
      />
    </div>
  );
}

/** The parts that come from the service's own query: metrics, logs, deploys and settings. */
function ServiceBody(props: {
  projectId: string;
  serviceId: string;
  environmentId: string;
  currentDeploymentId: string | undefined;
}) {
  const { data: detail } = useQuery(serviceQuery(props));
  const [selectedId, setSelectedId] = useState<string>();
  if (!detail) return null;

  const current = detail.deployments.find((d) => d.id === props.currentDeploymentId);
  const selected =
    detail.deployments.find((d) => d.id === selectedId) ?? current ?? detail.deployments[0];
  const selectedKind = selected ? deploymentState(selected).kind : "stopped";

  const where = [
    detail.replicas !== null &&
      `${detail.replicas} ${detail.replicas === 1 ? "replica" : "replicas"}`,
    detail.region && `in ${detail.region}`,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="grid min-w-0 content-start gap-8">
        {selected ? (
          <LogViewer
            key={selected.id}
            deploymentId={selected.id}
            live={
              selected.id === current?.id &&
              (selectedKind === "running" || selectedKind === "pending")
            }
            defaultKind={
              selected.status === "FAILED" || selected.status === "BUILDING" ? "build" : "deploy"
            }
            caption={
              selected.id === current?.id
                ? "Current deployment"
                : `Deployment from ${ago(selected.createdAt)}`
            }
          />
        ) : (
          <p className="text-sm text-muted-foreground">No deployments, so no logs yet.</p>
        )}
        <div className="grid gap-4 md:grid-cols-2">
          <MetricChart
            label="CPU"
            samples={detail.metrics.cpu}
            limit={detail.metrics.cpuLimit}
            format={formatCpu}
            color="var(--chart-2)"
          />
          <MetricChart
            label="Memory"
            samples={detail.metrics.memoryGb}
            limit={detail.metrics.memoryLimitGb}
            format={formatMemory}
            color="var(--chart-3)"
          />
        </div>
      </div>

      <aside className="grid content-start gap-8">
        <section className="grid gap-3">
          <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Deployments
          </h2>
          <DeploymentList
            projectId={props.projectId}
            deployments={detail.deployments}
            currentId={current?.id}
            selectedId={selected?.id}
            onSelect={setSelectedId}
          />
        </section>
        <section className="grid gap-3 text-sm">
          <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Settings
          </h2>
          <p className="truncate font-mono text-xs">{detail.source ?? "No source"}</p>
          <p>
            {where && <span>{where} · </span>}
            <span className="text-muted-foreground">
              {detail.sleepApplication ? "sleeps when idle" : "always on"}
            </span>
          </p>
          {detail.cronSchedule && (
            <p>
              Runs on <span className="font-mono text-xs">{detail.cronSchedule}</span>
              {detail.nextCronRunAt && (
                <span className="text-muted-foreground">
                  {" "}
                  · next{" "}
                  {new Date(detail.nextCronRunAt).toLocaleString([], {
                    dateStyle: "short",
                    timeStyle: "short",
                  })}
                </span>
              )}
            </p>
          )}
          {detail.domains.length === 0 ? (
            <p className="text-muted-foreground">No public domain</p>
          ) : (
            <ul className="grid gap-1">
              {detail.domains.map((domain) => (
                <li key={domain}>
                  <a
                    href={`https://${domain}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex min-w-0 items-center gap-1.5 hover:underline"
                  >
                    <GlobeIcon className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">{domain}</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
      </aside>
    </div>
  );
}

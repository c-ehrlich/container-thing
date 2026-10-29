import { cn } from "@repo/ui/lib/utils";
import { Link } from "@tanstack/react-router";
import { ChevronRightIcon, DatabaseIcon } from "lucide-react";

import { KIND_ORDER, ago, isDatastore, servicesOf } from "../../domains/insights/health";
import type { ServiceWithState } from "../../domains/insights/health";
import type { Insight } from "../../domains/insights/insights";
import { primaryActionFor } from "../../domains/insights/primary-action";
import type { Environment, Project } from "../../domains/project/project";
import { serviceUsageKey } from "../../domains/project/usage";
import type { ProjectUsage } from "../../domains/project/usage";
import { InsightActionButton } from "../overview/insight-action";
import { Sparkline, formatCpu, formatMemory } from "../overview/sparkline";
import { ServiceStatusBadge } from "../service-status-badge";

/** The table's columns. Rows are subgrids of it, so the action column fits its widest button. */
const TABLE =
  "grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,0.6fr)_minmax(0,1.5fr)_auto_1rem] gap-x-4";
const COLUMNS = "col-span-full grid grid-cols-subgrid items-center";

/**
 * Every service in one environment, broken ones first: status, the last day of CPU, memory now, the
 * last deploy, and the one action that fits. A row opens the service.
 */
export function ServiceTable(props: {
  project: Project;
  environment: Environment;
  usage?: ProjectUsage;
  insights: Insight[];
}) {
  const { project, environment, usage, insights } = props;
  const services = servicesOf(project, environment).toSorted(
    (a, b) =>
      KIND_ORDER.indexOf(a.state.kind) - KIND_ORDER.indexOf(b.state.kind) ||
      a.name.localeCompare(b.name),
  );

  return (
    // Sized to the page, not the window: the sparklines drop out when the assistant narrows it,
    // so the row's fix stays visible instead of scrolling off to the right.
    <div className="@container overflow-x-auto rounded-xl bg-card/60">
      <div className={cn(TABLE, "min-w-[40rem]")}>
        <div
          className={cn(COLUMNS, "border-b px-4 py-2.5 text-xs font-medium text-muted-foreground")}
        >
          <span>Service</span>
          <span>Status</span>
          <span>CPU · 24h</span>
          <span className="text-right">Memory</span>
          <span>Last deploy</span>
          <span />
          <span />
        </div>
        {services.map((service) => (
          <ServiceRow
            key={service.id}
            project={project}
            service={service}
            usage={usage?.services[serviceUsageKey(environment.id, service.id)]}
            insight={insights.find(
              (i) => i.service?.id === service.id && i.service.environment.id === environment.id,
            )}
          />
        ))}
      </div>
    </div>
  );
}

function ServiceRow(props: {
  project: Project;
  service: ServiceWithState;
  usage?: ProjectUsage["services"][string];
  insight?: Insight;
}) {
  const { project, service, usage, insight } = props;
  const { deployment } = service;
  const action = primaryActionFor(service, insight);
  const cpu = usage?.cpu.at(-1);
  const memory = usage?.memoryGb.at(-1);
  const live = service.state.kind === "running" || service.state.kind === "pending";

  return (
    <div
      className={cn(
        COLUMNS,
        "group relative isolate border-b px-4 py-3 text-sm transition-colors last:border-b-0 hover:bg-muted/30",
        service.state.kind === "failed" && "bg-destructive/6",
      )}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        {isDatastore(service) && (
          <DatabaseIcon className="size-3.5 shrink-0 text-muted-foreground" />
        )}
        <div className="grid min-w-0">
          <Link
            to="/projects/$projectId/services/$serviceId"
            params={{ projectId: project.id, serviceId: service.id }}
            search={{ environmentId: service.environment.id }}
            className="truncate font-medium outline-none after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-inset"
          >
            {service.name}
          </Link>
          {service.source && (
            <span className="truncate text-xs text-muted-foreground">{service.source}</span>
          )}
        </div>
      </div>

      <div>
        <ServiceStatusBadge deployment={service.deployment} />
      </div>

      <div className="flex items-center gap-2 text-muted-foreground">
        {live && cpu !== undefined ? (
          <>
            {/* A line needs two samples; a service started minutes ago may only have one. */}
            {usage && usage.cpu.length > 1 && (
              <Sparkline values={usage.cpu} className="hidden text-primary-accent @4xl:block" />
            )}
            <span className="ml-auto text-xs whitespace-nowrap tabular-nums">{formatCpu(cpu)}</span>
          </>
        ) : (
          <span className="text-xs text-muted-foreground/60">—</span>
        )}
      </div>

      <span className="text-right text-xs whitespace-nowrap text-muted-foreground tabular-nums">
        {live && memory !== undefined ? formatMemory(memory) : "—"}
      </span>

      <div className="grid min-w-0 text-xs">
        {deployment ? (
          <>
            <span className="truncate">
              {deployment.commitMessage ? `“${deployment.commitMessage}”` : "Deployed"}
            </span>
            <span className="truncate text-muted-foreground">
              {deployment.creator ? `${deployment.creator} · ` : ""}
              {ago(deployment.createdAt)}
            </span>
          </>
        ) : (
          !service.hasEverDeployed && <span className="text-muted-foreground">Never deployed</span>
        )}
      </div>

      {/* Above the row's link, so the button doesn't open the service. A broken row shows its fix;
          on healthy rows it's routine (Restart), so it waits for hover or focus. */}
      <div
        className={cn(
          "relative z-10 justify-self-end",
          service.state.kind !== "failed" &&
            "opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100",
        )}
      >
        {action && (
          <InsightActionButton
            action={action}
            projectId={project.id}
            // The insight above the table already holds the page's one primary button.
            variant="outline"
          />
        )}
      </div>
      <ChevronRightIcon className="size-4 text-muted-foreground" />
    </div>
  );
}

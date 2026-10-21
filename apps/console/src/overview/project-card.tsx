import { cn } from "@repo/ui/lib/utils";
import { ToggleGroup, ToggleGroupItem } from "@repo/ui/primitives/toggle-group";
import { Link } from "@tanstack/react-router";
import { GlobeIcon } from "lucide-react";
import { useState } from "react";

import { AddServiceDialog } from "../add-service/add-service-dialog";
import type { ProjectOverview, ProjectUsage } from "../railway/overview";
import { DotGrid } from "./dot-grid";
import { healthOf, primaryEnvironment, servicesOf, timeAgo } from "./health";
import type { Health, Kind } from "./health";
import { TopologyDiagram } from "./topology-diagram";

const TEXT: Record<Kind, string> = {
  running: "text-success",
  sleeping: "text-muted-foreground",
  pending: "text-warning",
  failed: "text-destructive",
  stopped: "text-muted-foreground/60",
};

const DOT: Record<Kind, string> = {
  running: "bg-success",
  sleeping: "bg-muted-foreground/60",
  pending: "bg-warning",
  failed: "bg-destructive",
  stopped: "bg-muted-foreground/30",
};

/**
 * A project as a card whose thumbnail is its architecture. Switching environments redraws the diagram;
 * the rest of the card opens the project in that environment.
 */
export function ProjectCard(props: { project: ProjectOverview; usage?: ProjectUsage }) {
  const { project, usage } = props;
  const [environmentId, setEnvironmentId] = useState(primaryEnvironment(project)?.id);
  const environment = project.environments.find((e) => e.id === environmentId);
  const health = healthOf(project, environment);
  const verdict = verdictOf(health);
  const domains = primaryEnvironment(project)?.services.flatMap((s) => s.domains) ?? [];

  return (
    <article className="group relative overflow-hidden rounded-xl border bg-card transition-[border-color,translate,box-shadow] hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-lg hover:shadow-black/30">
      {/* Above the card-wide link so services can be hovered and opened, and services added;
          clicks elsewhere fall through to the link. */}
      <DotGrid className="pointer-events-none relative z-10 h-44 border-b">
        {environment && (
          <TopologyDiagram project={project} environment={environment} usage={usage} />
        )}
        {environment && (
          <div className="pointer-events-auto absolute top-2 right-2">
            <AddServiceDialog projectId={project.id} environmentId={environment.id} />
          </div>
        )}
        {environment && (
          <span className="sr-only">
            {environment.name}:{" "}
            {servicesOf(project, environment)
              .map((s) => `${s.name} ${s.state.label}`)
              .join(", ")}
          </span>
        )}
      </DotGrid>

      <div className="grid gap-3 p-4">
        <div className="flex items-baseline justify-between gap-3">
          <Link
            to="/projects/$projectId"
            params={{ projectId: project.id }}
            search={{ environmentId }}
            className="truncate font-medium outline-none after:absolute after:inset-0 focus-visible:after:rounded-xl focus-visible:after:ring-2 focus-visible:after:ring-ring"
          >
            {project.name}
          </Link>
          <span className={cn("shrink-0 text-xs", TEXT[verdict.kind])}>{verdict.label}</span>
        </div>

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {domains[0] ? (
            <span className="flex min-w-0 items-center gap-1.5">
              <GlobeIcon className="size-3.5 shrink-0" />
              <span className="truncate">{domains[0]}</span>
              {domains.length > 1 && (
                <span className="shrink-0 text-muted-foreground/60">+{domains.length - 1}</span>
              )}
            </span>
          ) : (
            <span className="text-muted-foreground/60">No public domain</span>
          )}
          {usage?.estimatedMonthlyUsd !== undefined && (
            <span
              className="ml-auto shrink-0 tabular-nums"
              title="This month's usage so far, projected to the end of the month at Railway's list prices. Plan credits aren't included."
            >
              ≈ ${usage.estimatedMonthlyUsd.toFixed(usage.estimatedMonthlyUsd < 10 ? 2 : 0)}/mo
            </span>
          )}
        </div>

        {project.environments.length > 1 && (
          // Above the card-wide link, so switching environments doesn't open the project.
          <ToggleGroup
            size="sm"
            spacing={1}
            className="relative z-10 flex-wrap"
            value={environmentId ? [environmentId] : []}
            onValueChange={(value) => value[0] && setEnvironmentId(value[0])}
          >
            {project.environments.map((env) => (
              <ToggleGroupItem key={env.id} value={env.id} className="h-6 gap-1.5 px-2 text-xs">
                <span className={cn("size-1.5 rounded-full", DOT[healthOf(project, env).kind])} />
                {env.name}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        )}
      </div>
    </article>
  );
}

function verdictOf(health: Health): { kind: Kind; label: string } {
  const worst = health.attention[0];
  if (health.kind === "failed" && worst) {
    const ago = worst.deployment ? ` ${timeAgo(worst.deployment.createdAt)} ago` : "";
    return { kind: "failed", label: `${worst.name} ${worst.state.label.toLowerCase()}${ago}` };
  }
  if (health.kind === "pending" && worst) {
    return { kind: "pending", label: `${worst.state.label} ${worst.name}` };
  }
  if (health.counts.running > 0) return { kind: "running", label: "Healthy" };
  if (health.counts.sleeping > 0) return { kind: "sleeping", label: "Asleep" };
  return { kind: "stopped", label: "Off" };
}

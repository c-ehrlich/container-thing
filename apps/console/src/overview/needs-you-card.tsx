import { cn } from "@repo/ui/lib/utils";
import { Button } from "@repo/ui/primitives/button";
import { Link } from "@tanstack/react-router";
import { CircleXIcon, TriangleAlertIcon, XIcon } from "lucide-react";

import type { ProjectUsage } from "../railway/overview";
import { DotGrid } from "./dot-grid";
import { timeAgo } from "./health";
import { InsightActionButton } from "./insight-action";
import type { Insight } from "./insights";
import { TopologyDiagram } from "./topology-diagram";

/**
 * A broken service: what happened, the fix the rules picked, and its environment's diagram with the
 * service and everything that depends on it highlighted.
 */
export function NeedsYouCard(props: {
  insight: Insight & { service: NonNullable<Insight["service"]> };
  usage?: ProjectUsage;
  onDismiss: () => void;
}) {
  const { insight, onDismiss } = props;
  const { project, service, impact } = insight;
  const dependents = impact?.dependents ?? [];

  return (
    <article className="relative grid overflow-hidden rounded-xl border border-destructive/30 bg-destructive/5 @2xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="grid content-start gap-3 p-4">
        <div className="flex gap-3">
          <CircleXIcon className="mt-0.5 size-5 shrink-0 text-destructive" />
          <div className="grid min-w-0 gap-1 pr-6">
            <p className="font-medium text-pretty">{insight.headline}</p>
            <p className="text-sm text-muted-foreground">
              <Link
                to="/projects/$projectId"
                params={{ projectId: project.id }}
                search={{ environmentId: service.environment.id }}
                className="hover:text-foreground hover:underline"
              >
                {project.name} / {service.environment.name}
              </Link>
              {service.deployment && ` · ${timeAgo(service.deployment.createdAt)} ago`}
            </p>
            <p className="text-sm text-pretty text-muted-foreground">{insight.evidence}</p>
            {impact && (
              <p
                className={cn(
                  "flex items-center gap-1.5 text-sm",
                  dependents.length > 0 ? "text-warning" : "text-muted-foreground",
                )}
              >
                {dependents.length > 0 && <TriangleAlertIcon className="size-3.5 shrink-0" />}
                {impact.text}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 pl-8">
          <InsightActionButton action={insight.primary} projectId={project.id} variant="default" />
          {insight.secondary && (
            <InsightActionButton
              action={insight.secondary}
              projectId={project.id}
              variant="outline"
            />
          )}
        </div>
      </div>
      <DotGrid className="relative min-h-44 border-t border-destructive/20 @2xl:border-t-0 @2xl:border-l">
        <TopologyDiagram
          project={project}
          environment={service.environment}
          usage={props.usage}
          highlight={{ failed: service.name, affected: dependents }}
        />
      </DotGrid>
      <DismissButton onDismiss={onDismiss} className="top-3 right-3 @2xl:right-[332px]" />
    </article>
  );
}

/** Hides an insight until its situation changes. */
export function DismissButton(props: { onDismiss: () => void; className?: string }) {
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      aria-label="Dismiss until something changes"
      title="Dismiss until something changes"
      onClick={props.onDismiss}
      className={cn("absolute text-muted-foreground hover:text-foreground", props.className)}
    >
      <XIcon />
    </Button>
  );
}

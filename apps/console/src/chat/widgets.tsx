import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@repo/ui/primitives/item";
import { Skeleton } from "@repo/ui/primitives/skeleton";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { useWatchEnvironment } from "../railway/live/watch-environment";
import { projectQuery } from "../railway/project";
import type { Service } from "../railway/project";
import { ServiceStatusBadge } from "../railway/service-status-badge";

/**
 * Chat widgets get IDs from the tool call and everything else from `projectQuery`, the cache entry the
 * project page uses too. Watching the environment keeps it live even when the page isn't open.
 */
function useEnvironment(projectId: string, environmentId: string) {
  useWatchEnvironment(projectId, environmentId);
  const { data: project, isPending, error } = useQuery(projectQuery(projectId));
  return {
    project,
    environment: project?.environments.find((e) => e.id === environmentId),
    isPending,
    error,
  };
}

export function ServiceWidget(props: {
  projectId: string;
  environmentId: string;
  serviceId: string;
}) {
  const { projectId, environmentId, serviceId } = props;
  const { project, environment, isPending, error } = useEnvironment(projectId, environmentId);
  const service = environment?.services.find((s) => s.id === serviceId);

  if (isPending) return <Skeleton className="h-14" />;
  if (error || !project || !environment || !service) {
    return <WidgetError>{error?.message ?? "Couldn't find this service."}</WidgetError>;
  }
  return (
    <Item variant="outline" size="sm">
      <ServiceSummary
        service={service}
        context={`${project.name} · ${environment.name}`}
        projectId={projectId}
        environmentId={environmentId}
      />
    </Item>
  );
}

export function ServiceListWidget(props: { projectId: string; environmentId: string }) {
  const { projectId, environmentId } = props;
  const { project, environment, isPending, error } = useEnvironment(projectId, environmentId);

  if (isPending) return <Skeleton className="h-28" />;
  if (error || !project || !environment) {
    return <WidgetError>{error?.message ?? "Couldn't find this environment."}</WidgetError>;
  }
  return (
    <ItemGroup className="gap-1 rounded-lg border p-1">
      {environment.services.map((service) => (
        <Item key={service.id} size="xs">
          <ServiceSummary
            service={service}
            context={service.source ?? undefined}
            projectId={projectId}
            environmentId={environmentId}
          />
        </Item>
      ))}
    </ItemGroup>
  );
}

function ServiceSummary(props: {
  service: Service;
  context: string | undefined;
  projectId: string;
  environmentId: string;
}) {
  const { service, context, projectId, environmentId } = props;
  return (
    <>
      <ItemContent className="min-w-0">
        <ItemTitle>
          <Link
            to="/projects/$projectId"
            params={{ projectId }}
            search={{ environmentId }}
            className="hover:underline"
          >
            {service.name}
          </Link>
        </ItemTitle>
        {context && <ItemDescription className="truncate">{context}</ItemDescription>}
      </ItemContent>
      <ItemActions>
        <ServiceStatusBadge deployment={service.deployment} />
      </ItemActions>
    </>
  );
}

export function WidgetError(props: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-destructive/30 px-3 py-2 text-sm text-destructive">
      {props.children}
    </p>
  );
}

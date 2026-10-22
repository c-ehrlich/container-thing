import { Alert, AlertDescription } from "@repo/ui/primitives/alert";
import { Card } from "@repo/ui/primitives/card";
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
import { CircleAlertIcon } from "lucide-react";
import type { ReactNode } from "react";

import { useWatchEnvironments } from "../../domains/live";
import { projectOverviewQuery } from "../../domains/project/overview";
import type { OverviewService } from "../../domains/project/overview";
import { ServiceStatusBadge } from "../service-status-badge";

/**
 * Chat widgets get IDs from the tool call and everything else from `projectOverviewQuery`, the cache
 * entry the pages use too. Watching the environment keeps it live even when no page shows it; when one
 * does, they share the same watch.
 */
function useEnvironment(projectId: string, environmentId: string) {
  useWatchEnvironments([{ projectId, environmentIds: [environmentId] }]);
  const { data: project, isPending, error } = useQuery(projectOverviewQuery(projectId));
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
    <WidgetCard>
      <Item size="xs">
        <ServiceSummary
          service={service}
          context={`${project.name} · ${environment.name}`}
          projectId={projectId}
          environmentId={environmentId}
        />
      </Item>
    </WidgetCard>
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
    <WidgetCard>
      <ItemGroup className="gap-0">
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
    </WidgetCard>
  );
}

function ServiceSummary(props: {
  service: OverviewService;
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

/** The surface chat widgets sit on, so they stand out from the conversation around them. */
export function WidgetCard(props: { children: ReactNode }) {
  return (
    <Card size="sm" className="py-1">
      {props.children}
    </Card>
  );
}

export function WidgetError(props: { children: ReactNode }) {
  return (
    <Alert variant="destructive">
      <CircleAlertIcon />
      <AlertDescription>{props.children}</AlertDescription>
    </Alert>
  );
}

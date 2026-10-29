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

import { KIND_ORDER } from "../../domains/insights/health";
import { useWatchEnvironments } from "../../domains/live";
import { deploymentState } from "../../domains/project/deployment-state";
import { projectQuery } from "../../domains/project/project";
import type { Service } from "../../domains/project/project";
import { ServiceStatusBadge } from "../service-status-badge";

/**
 * Chat widgets get IDs from the tool call and everything else from `projectQuery`, the cache
 * entry the pages use too. Watching the environment keeps it live even when no page shows it; when one
 * does, they share the same watch.
 */
function useEnvironment(projectId: string, environmentId: string) {
  useWatchEnvironments([{ projectId, environmentIds: [environmentId] }]);
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

type ServiceTarget = { projectId: string; environmentId: string; serviceId: string };

/** Services picked by the assistant, which may span projects: one section per environment. */
export function ServicesWidget(props: { services: ServiceTarget[] }) {
  const { services } = props;
  const environments = [
    ...new Map(services.map((s) => [`${s.projectId}/${s.environmentId}`, s])).entries(),
  ];
  return (
    <WidgetCard>
      {environments.map(([key, { projectId, environmentId }]) => (
        <ServiceGroup
          key={key}
          projectId={projectId}
          environmentId={environmentId}
          serviceIds={services
            .filter((s) => s.projectId === projectId && s.environmentId === environmentId)
            .map((s) => s.serviceId)}
        />
      ))}
    </WidgetCard>
  );
}

function ServiceGroup(props: { projectId: string; environmentId: string; serviceIds: string[] }) {
  const { projectId, environmentId, serviceIds } = props;
  const { project, environment, isPending, error } = useEnvironment(projectId, environmentId);

  if (isPending) return <Skeleton className="m-1 h-20" />;
  if (error || !project || !environment) {
    return <WidgetError>{error?.message ?? "Couldn't find this environment."}</WidgetError>;
  }
  return (
    <ItemGroup className="gap-0">
      <WidgetHeading>
        <Link
          to="/projects/$projectId"
          params={{ projectId }}
          search={{ environmentId }}
          className="hover:underline"
        >
          {project.name} · {environment.name}
        </Link>
      </WidgetHeading>
      {/* Broken first, like the project page: a crash shouldn't sit between four healthy rows. */}
      {environment.services
        .filter((service) => serviceIds.includes(service.id))
        .toSorted(
          (a, b) =>
            KIND_ORDER.indexOf(deploymentState(a.deployment).kind) -
            KIND_ORDER.indexOf(deploymentState(b.deployment).kind),
        )
        .map((service) => (
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

/** The surface chat widgets sit on, so they stand out from the conversation around them. */
export function WidgetCard(props: { children: ReactNode }) {
  return (
    <Card size="sm" className="py-1">
      {props.children}
    </Card>
  );
}

/** Names a section of a widget, like the project and environment its services are in. */
export function WidgetHeading(props: { children: ReactNode }) {
  return <h3 className="px-2.5 pt-2 text-xs text-muted-foreground">{props.children}</h3>;
}

export function WidgetError(props: { children: ReactNode }) {
  return (
    <Alert variant="destructive">
      <CircleAlertIcon />
      <AlertDescription>{props.children}</AlertDescription>
    </Alert>
  );
}

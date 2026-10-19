import { Badge } from "@repo/ui/primitives/badge";
import { Button, buttonVariants } from "@repo/ui/primitives/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@repo/ui/primitives/item";
import { Spinner } from "@repo/ui/primitives/spinner";
import {
  queryOptions,
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import type { ResultOf } from "gql.tada";
import { useSyncExternalStore } from "react";
import { z } from "zod";

import { graphql } from "../../graphql/graphql";
import { useEnvironmentLive } from "../../live/use-environment-live";
import { requireRailway } from "../../server/require-railway";

const ProjectQuery = graphql(`
  query Project($id: String!) {
    project(id: $id) {
      id
      name
      environments {
        edges {
          node {
            id
            name
            serviceInstances {
              edges {
                node {
                  serviceId
                  serviceName
                  source {
                    image
                    repo
                  }
                  latestDeployment {
                    id
                    status
                    createdAt
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`);

type Deployment = NonNullable<
  ResultOf<
    typeof ProjectQuery
  >["project"]["environments"]["edges"][number]["node"]["serviceInstances"]["edges"][number]["node"]["latestDeployment"]
>;

const getProject = createServerFn({ method: "GET" })
  .middleware([requireRailway])
  .validator(z.object({ projectId: z.string() }))
  .handler(async ({ data, context }) => {
    const { project } = await context.railway(ProjectQuery, {
      id: data.projectId,
    });
    return {
      id: project.id,
      name: project.name,
      environments: project.environments.edges.map(({ node: environment }) => ({
        id: environment.id,
        name: environment.name,
        services: environment.serviceInstances.edges.map(
          ({ node: instance }) => ({
            id: instance.serviceId,
            name: instance.serviceName,
            source: instance.source?.image ?? instance.source?.repo ?? null,
            deployment: instance.latestDeployment,
          }),
        ),
      })),
    };
  });

const DeployMutation = graphql(`
  mutation Deploy($serviceId: String!, $environmentId: String!) {
    serviceInstanceDeployV2(
      serviceId: $serviceId
      environmentId: $environmentId
    )
  }
`);

const deployService = createServerFn({ method: "POST" })
  .middleware([requireRailway])
  .validator(z.object({ serviceId: z.string(), environmentId: z.string() }))
  .handler(async ({ data, context }) => {
    await context.railway(DeployMutation, data);
  });

const RemoveMutation = graphql(`
  mutation Remove($id: String!) {
    deploymentRemove(id: $id)
  }
`);

const removeDeployment = createServerFn({ method: "POST" })
  .middleware([requireRailway])
  .validator(z.object({ deploymentId: z.string() }))
  .handler(async ({ data, context }) => {
    await context.railway(RemoveMutation, { id: data.deploymentId });
  });

const projectQuery = (projectId: string) =>
  queryOptions({
    queryKey: ["project", projectId],
    queryFn: () => getProject({ data: { projectId } }),
  });

export const Route = createFileRoute("/projects/$projectId")({
  validateSearch: z.object({ environmentId: z.string().optional() }),
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(projectQuery(params.projectId)),
  component: ProjectPage,
});

function ProjectPage() {
  const { projectId } = Route.useParams();
  const { environmentId } = Route.useSearch();
  const query = projectQuery(projectId);
  const { data: project } = useSuspenseQuery(query);

  const environment =
    project.environments.find((e) => e.id === environmentId) ??
    project.environments.find((e) => e.name === "production") ??
    project.environments[0];

  const live = useEnvironmentLive({
    query,
    environmentId: environment?.id ?? "",
    deploymentIds:
      environment?.services.flatMap((s) =>
        s.deployment ? [s.deployment.id] : [],
      ) ?? [],
  });

  return (
    <main className="mx-auto grid max-w-2xl gap-6 p-8">
      <header className="grid gap-2">
        <Link to="/" className="text-sm text-muted-foreground hover:underline">
          ← Projects
        </Link>
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold tracking-tight">
            {project.name}
          </h1>
          <Badge variant="outline" title={`Connection: ${live.connection}`}>
            {live.mode === "live" ? "● Live" : "Polling every 30s"}
          </Badge>
        </div>
        {project.environments.length > 1 && (
          <nav className="flex gap-2">
            {project.environments.map((e) => (
              <Link
                key={e.id}
                to="/projects/$projectId"
                params={{ projectId }}
                search={{ environmentId: e.id }}
                className={buttonVariants({
                  size: "sm",
                  variant: e.id === environment?.id ? "secondary" : "ghost",
                })}
              >
                {e.name}
              </Link>
            ))}
          </nav>
        )}
      </header>

      {environment && (
        <ItemGroup className="gap-2">
          {environment.services.map((service) => (
            <ServiceRow
              key={service.id}
              projectId={projectId}
              environmentId={environment.id}
              service={service}
            />
          ))}
        </ItemGroup>
      )}
    </main>
  );
}

function ServiceRow(props: {
  projectId: string;
  environmentId: string;
  service: {
    id: string;
    name: string;
    source: string | null;
    deployment: Deployment | null;
  };
}) {
  const { projectId, environmentId, service } = props;
  const queryClient = useQueryClient();
  const onSuccess = () =>
    queryClient.invalidateQueries({
      queryKey: projectQuery(projectId).queryKey,
    });
  const deploy = useMutation({
    mutationFn: () =>
      deployService({ data: { serviceId: service.id, environmentId } }),
    onSuccess,
  });
  const remove = useMutation({
    mutationFn: (deploymentId: string) =>
      removeDeployment({ data: { deploymentId } }),
    onSuccess,
  });

  const state = deploymentState(service.deployment);
  const busy = deploy.isPending || remove.isPending || state.kind === "pending";

  return (
    <Item variant="outline">
      <ItemContent>
        <ItemTitle>{service.name}</ItemTitle>
        {service.source && <ItemDescription>{service.source}</ItemDescription>}
      </ItemContent>
      <ItemActions>
        <Badge
          variant={
            state.kind === "failed"
              ? "destructive"
              : state.kind === "running"
                ? "default"
                : "secondary"
          }
        >
          {state.kind === "pending" && <Spinner />}
          {state.label}
          {state.kind === "pending" && service.deployment && (
            <Elapsed since={service.deployment.createdAt} />
          )}
        </Badge>
        {service.deployment && state.kind !== "stopped" ? (
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() =>
              service.deployment && remove.mutate(service.deployment.id)
            }
          >
            Stop
          </Button>
        ) : (
          <Button size="sm" disabled={busy} onClick={() => deploy.mutate()}>
            Start
          </Button>
        )}
      </ItemActions>
    </Item>
  );
}

type DeploymentState = {
  kind: "running" | "pending" | "failed" | "stopped";
  label: string;
};

function deploymentState(deployment: Deployment | null): DeploymentState {
  switch (deployment?.status) {
    case undefined:
    case "REMOVED":
    case "SKIPPED":
      return { kind: "stopped", label: "Stopped" };
    case "SUCCESS":
      return { kind: "running", label: "Running" };
    case "SLEEPING":
      return { kind: "stopped", label: "Sleeping" };
    case "FAILED":
    case "CRASHED":
      return {
        kind: "failed",
        label: deployment.status === "FAILED" ? "Failed" : "Crashed",
      };
    case "REMOVING":
      return { kind: "pending", label: "Stopping" };
    default:
      // QUEUED, WAITING, NEEDS_APPROVAL, INITIALIZING, BUILDING, DEPLOYING
      return { kind: "pending", label: "Deploying" };
  }
}

/**
 * Railway pushes deploy progress in bursts (nothing for ~14 s, then several steps at once), so the
 * elapsed time ticks locally instead of waiting for events.
 */
function Elapsed(props: { since: string }) {
  const now = useNow();
  if (now === null) return null;
  return (
    <span className="tabular-nums">
      {Math.max(0, Math.round((now - Date.parse(props.since)) / 1000))}s
    </span>
  );
}

/** A clock shared by every `Elapsed`, ticking once a second while any is mounted. */
let clockNow = Date.now();
let clockInterval: ReturnType<typeof setInterval> | undefined;
const clockListeners = new Set<() => void>();

function subscribeToClock(listener: () => void) {
  clockListeners.add(listener);
  clockInterval ??= setInterval(() => {
    clockNow = Date.now();
    for (const l of clockListeners) l();
  }, 1000);
  return () => {
    clockListeners.delete(listener);
    if (clockListeners.size === 0) {
      clearInterval(clockInterval);
      clockInterval = undefined;
    }
  };
}

/** Current time in the browser; null during server rendering and hydration. */
function useNow(): number | null {
  return useSyncExternalStore(
    subscribeToClock,
    () => clockNow,
    () => null,
  );
}

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
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { deploymentState } from "../../railway/deployment-state";
import { useWatchEnvironment } from "../../railway/live/watch-environment";
import {
  deployServiceFn,
  pickEnvironment,
  projectQuery,
  removeDeploymentFn,
} from "../../railway/project";
import type { Service } from "../../railway/project";
import { ServiceStatusBadge } from "../../railway/service-status-badge";

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

  const environment = pickEnvironment(project, environmentId);

  const live = useWatchEnvironment(projectId, environment?.id);

  return (
    <main className="mx-auto grid max-w-2xl gap-6 p-8">
      <header className="grid gap-2">
        <Link to="/" className="text-sm text-muted-foreground hover:underline">
          ← Projects
        </Link>
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
          <Badge variant="outline" title={`Connection: ${live?.connection ?? "connecting"}`}>
            {live?.mode === "live" ? "● Live" : "Polling every 30s"}
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

function ServiceRow(props: { projectId: string; environmentId: string; service: Service }) {
  const { projectId, environmentId, service } = props;
  const queryClient = useQueryClient();
  const onSuccess = () =>
    queryClient.invalidateQueries({
      queryKey: projectQuery(projectId).queryKey,
    });
  const deploy = useMutation({
    mutationFn: () => deployServiceFn({ data: { serviceId: service.id, environmentId } }),
    onSuccess,
  });
  const remove = useMutation({
    mutationFn: (deploymentId: string) => removeDeploymentFn({ data: { deploymentId } }),
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
        <ServiceStatusBadge deployment={service.deployment} />
        {service.deployment && state.kind !== "stopped" ? (
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => service.deployment && remove.mutate(service.deployment.id)}
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

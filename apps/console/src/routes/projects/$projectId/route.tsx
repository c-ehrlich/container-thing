import { useSuspenseQuery } from "@tanstack/react-query";
import { Outlet, createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { getDismissedFn } from "../../../domains/insights/dismissed";
import { useWatchEnvironments } from "../../../domains/live/watch-environment";
import { projectOverviewQuery } from "../../../domains/project/overview";

/**
 * A project and its services. Both the project page and a service's page read the project's
 * overview, kept live here for as long as either is open.
 */
export const Route = createFileRoute("/projects/$projectId")({
  validateSearch: z.object({ environmentId: z.string().optional() }),
  loader: async ({ context, params }) => {
    await context.queryClient.ensureQueryData(projectOverviewQuery(params.projectId));
    return { dismissed: await getDismissedFn() };
  },
  component: ProjectLayout,
});

function ProjectLayout() {
  const { projectId } = Route.useParams();
  const { data: project } = useSuspenseQuery(projectOverviewQuery(projectId));
  useWatchEnvironments([{ projectId, environmentIds: project.environments.map((e) => e.id) }]);
  return <Outlet />;
}

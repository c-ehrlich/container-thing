import { Button, buttonVariants } from "@repo/ui/primitives/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@repo/ui/primitives/empty";
import { Spinner } from "@repo/ui/primitives/spinner";
import { useQueries } from "@tanstack/react-query";
import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { CircleCheckIcon } from "lucide-react";

import { InsightsPanel } from "../components/overview/insights-panel";
import { NeedsYouCard } from "../components/overview/needs-you-card";
import { ProjectCard } from "../components/overview/project-card";
import { getDismissedFn, useDismissed } from "../domains/insights/dismissed";
import { healthOf, timeAgo } from "../domains/insights/health";
import { FAILURE_RULES, insightsFor } from "../domains/insights/insights";
import type { Insight } from "../domains/insights/insights";
import { useWatchEnvironments } from "../domains/live/watch-environment";
import { projectOverviewQuery, projectUsageQuery } from "../domains/project/overview";
import type { ProjectOverview, ProjectUsage } from "../domains/project/overview";
import type { Viewer } from "../domains/project/viewer";

export const Route = createFileRoute("/")({
  loader: async ({ context, parentMatchPromise }) => {
    const { loaderData } = await parentMatchPromise;
    const projects = loaderData?.viewer?.workspaces.flatMap((w) => w.projects) ?? [];
    // Rendered on the server so the page arrives complete. One project failing to load shouldn't
    // take the page down, so failures are left to the card. Usage is slow and only decorates the
    // cards, so it loads afterwards in the browser.
    await Promise.allSettled(
      projects.map((p) => context.queryClient.ensureQueryData(projectOverviewQuery(p.id))),
    );
    return { dismissed: await getDismissedFn() };
  },
  component: Home,
});

const rootRoute = getRouteApi("__root__");

function Home() {
  const { viewer } = rootRoute.useLoaderData();

  if (!viewer) {
    return (
      <main className="grid min-h-svh place-content-center gap-4 text-center">
        <a href="/auth/login" className={buttonVariants()}>
          Login with Railway
        </a>
      </main>
    );
  }

  if (viewer.workspaces.every((w) => w.projects.length === 0)) {
    return (
      <Empty className="min-h-[60svh]">
        <EmptyHeader>
          <EmptyTitle>No projects yet</EmptyTitle>
          <EmptyDescription>Log in again and pick projects to share.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return <Overview viewer={viewer} />;
}

type Loaded = { project: ProjectOverview; usage?: ProjectUsage; workspace: string };

/**
 * Triage first: broken services with the fix on the card, then deploys in flight, then every other
 * project as a card with its architecture. The rail holds insights that aren't outages.
 */
function Overview(props: { viewer: Viewer }) {
  const listed = props.viewer.workspaces.flatMap((workspace) =>
    workspace.projects.map((project) => ({ ...project, workspace: workspace.name })),
  );
  const overviews = useQueries({ queries: listed.map((p) => projectOverviewQuery(p.id)) });
  const usages = useQueries({ queries: listed.map((p) => projectUsageQuery(p.id)) });
  const { dismissed: initiallyDismissed } = Route.useLoaderData();
  const dismissed = useDismissed(initiallyDismissed);

  const loaded: Loaded[] = listed.flatMap((p, i) => {
    const project = overviews[i]?.data;
    return project ? [{ project, usage: usages[i]?.data, workspace: p.workspace }] : [];
  });
  // Railway's live pushes refetch a project's overview when anything changes in it: a deploy from the
  // chat, the dashboard, the CLI or a git push.
  useWatchEnvironments(
    loaded.map(({ project }) => ({
      projectId: project.id,
      environmentIds: project.environments.map((e) => e.id),
    })),
  );
  const insights = insightsFor(loaded);
  const visible = insights.filter((i) => !dismissed.isDismissed(i.key));
  const hidden = insights.filter((i) => dismissed.isDismissed(i.key));
  const hiddenFailures = hidden.filter((i) => FAILURE_RULES.has(i.rule));
  const hiddenOthers = hidden.filter((i) => !FAILURE_RULES.has(i.rule));
  const failures = visible.filter(
    (i): i is Insight & { service: NonNullable<Insight["service"]> } =>
      FAILURE_RULES.has(i.rule) && i.service !== undefined,
  );
  const inFlight = loaded.flatMap(({ project }) =>
    healthOf(project)
      .attention.filter((s) => s.state.kind === "pending")
      .map((service) => ({ project, service })),
  );
  // A project with a card under "Needs you" isn't repeated below. Dismissing the card brings it back.
  const brokenProjects = new Set(failures.map((i) => i.project.id));

  return (
    <div className="mx-auto grid w-full max-w-7xl gap-10 p-8 xl:grid-cols-[minmax(0,1fr)_320px]">
      <main className="@container grid content-start gap-10">
        <header className="grid gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="text-muted-foreground">
            {summary(failures.length, inFlight.length, listed.length)}
          </p>
        </header>

        <section className="grid gap-3">
          {failures.length > 0 ? (
            <>
              <SectionLabel>Needs you</SectionLabel>
              {failures.map((insight) => (
                <NeedsYouCard
                  key={insight.key}
                  insight={insight}
                  usage={loaded.find((l) => l.project.id === insight.project.id)?.usage}
                  onDismiss={() => dismissed.dismiss(insight.key)}
                />
              ))}
            </>
          ) : (
            <div className="flex items-center gap-3 rounded-xl border border-dashed p-5 text-muted-foreground">
              <CircleCheckIcon className="size-5 text-success" />
              Nothing needs you right now.
            </div>
          )}
          <ShowDismissed insights={hiddenFailures} onRestore={dismissed.restore} />
        </section>

        {inFlight.length > 0 && (
          <section className="grid gap-2">
            <SectionLabel>In flight</SectionLabel>
            {inFlight.map(({ project, service }) => {
              const commit = service.deployment?.commitMessage;
              return (
                <div
                  key={`${service.environment.id}-${service.id}`}
                  className="flex items-center gap-3 px-1 text-sm"
                >
                  <Spinner className="size-4 text-warning" />
                  <span className="font-medium">{service.name}</span>
                  <span className="shrink-0 text-muted-foreground">
                    {service.state.label.toLowerCase()} in {project.name} /{" "}
                    {service.environment.name}
                  </span>
                  {commit && <span className="truncate text-muted-foreground/70">“{commit}”</span>}
                  {service.deployment && (
                    <span className="ml-auto shrink-0 text-muted-foreground tabular-nums">
                      {timeAgo(service.deployment.createdAt)}
                    </span>
                  )}
                </div>
              );
            })}
          </section>
        )}

        {props.viewer.workspaces.map((workspace) => {
          const cards = workspace.projects.filter((p) => !brokenProjects.has(p.id));
          if (cards.length === 0) return null;
          return (
            <section key={workspace.id} className="grid gap-3">
              <SectionLabel>{workspace.name}</SectionLabel>
              <div className="grid gap-4 @xl:grid-cols-2 @5xl:grid-cols-3">
                {cards.map((listedProject) => {
                  const index = listed.findIndex((p) => p.id === listedProject.id);
                  const overview = overviews[index];
                  return overview?.data ? (
                    <ProjectCard
                      key={listedProject.id}
                      project={overview.data}
                      usage={usages[index]?.data}
                    />
                  ) : (
                    <UnavailableCard
                      key={listedProject.id}
                      name={listedProject.name}
                      error={overview?.error?.message}
                    />
                  );
                })}
              </div>
            </section>
          );
        })}
      </main>

      <InsightsPanel
        insights={visible.filter((i) => !FAILURE_RULES.has(i.rule))}
        onDismiss={(insight) => dismissed.dismiss(insight.key)}
        className="xl:sticky xl:top-20 xl:self-start"
        footer={<ShowDismissed insights={hiddenOthers} onRestore={dismissed.restore} />}
      />
    </div>
  );
}

function ShowDismissed(props: { insights: Insight[]; onRestore: (keys: string[]) => void }) {
  if (props.insights.length === 0) return null;
  return (
    <Button
      variant="link"
      size="sm"
      className="justify-self-start px-0 text-muted-foreground"
      onClick={() => props.onRestore(props.insights.map((i) => i.key))}
    >
      Show {props.insights.length} dismissed
    </Button>
  );
}

/** A project whose overview didn't load: still listed, so it doesn't silently disappear. */
function UnavailableCard(props: { name: string; error?: string }) {
  return (
    <article className="grid min-h-72 content-center justify-items-center gap-2 rounded-xl border border-dashed p-6 text-center">
      <p className="font-medium">{props.name}</p>
      <p className="text-sm text-muted-foreground">
        {props.error ? "Couldn't load this project." : "Loading…"}
      </p>
    </article>
  );
}

function summary(broken: number, inFlight: number, total: number) {
  const parts = [];
  if (broken > 0) parts.push(`${broken} ${broken === 1 ? "thing needs" : "things need"} you`);
  if (inFlight > 0) parts.push(`${inFlight} ${inFlight === 1 ? "deploy" : "deploys"} in flight`);
  parts.push(
    broken + inFlight === 0
      ? `${total === 1 ? "your project is" : `all ${total} projects are`} fine`
      : "everything else is fine",
  );
  const sentence = parts.join(", ");
  return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.`;
}

function SectionLabel(props: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
      {props.children}
    </h2>
  );
}

import { Button, buttonVariants } from "@repo/ui/primitives/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/primitives/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@repo/ui/primitives/empty";
import { Link, createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

import { createRailwayClient } from "../railway/railway-api";
import { getFreshSession } from "../railway/railway-oauth";
import { fetchViewer } from "../railway/viewer";

/** The signed-in user and the Railway projects they shared with this app, or null when signed out. */
const getViewer = createServerFn({ method: "GET" }).handler(async () => {
  const session = await getFreshSession();
  if (!session) return null;

  return fetchViewer(createRailwayClient(session.accessToken));
});

export const Route = createFileRoute("/")({
  loader: () => getViewer(),
  component: Home,
});

function Home() {
  const viewer = Route.useLoaderData();

  if (!viewer) {
    return (
      <main className="grid min-h-svh place-content-center gap-4 text-center">
        <h1 className="text-4xl font-semibold tracking-tight">Console</h1>
        <a href="/auth/login" className={buttonVariants()}>
          Login with Railway
        </a>
      </main>
    );
  }

  return (
    <main className="mx-auto grid max-w-xl gap-6 p-8">
      <header className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Signed in as</p>
          <p className="font-medium">{viewer.user.name ?? viewer.user.email}</p>
        </div>
        <form method="post" action="/auth/logout">
          <Button type="submit" variant="outline">
            Log out
          </Button>
        </form>
      </header>
      <section className="grid gap-4">
        <h2 className="font-medium">Projects shared with this app</h2>
        {viewer.workspaces.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>No projects yet</EmptyTitle>
              <EmptyDescription>Log in again and pick projects to share.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          viewer.workspaces.map((workspace) => (
            <Card key={workspace.id}>
              <CardHeader>
                <CardTitle>{workspace.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="grid gap-1 text-sm">
                  {workspace.projects.map((project) => (
                    <li key={project.id}>
                      <Link
                        to="/projects/$projectId"
                        params={{ projectId: project.id }}
                        className="hover:underline"
                      >
                        {project.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))
        )}
      </section>
    </main>
  );
}

import { buttonVariants } from "@repo/ui/primitives/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/primitives/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@repo/ui/primitives/empty";
import { Item, ItemActions, ItemContent, ItemGroup, ItemTitle } from "@repo/ui/primitives/item";
import { Link, createFileRoute, getRouteApi } from "@tanstack/react-router";
import { ChevronRightIcon } from "lucide-react";

export const Route = createFileRoute("/")({
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

  return (
    <div className="mx-auto grid w-full max-w-xl gap-6 p-8">
      <section className="grid gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Projects shared with this app</h1>
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
                <ItemGroup className="gap-1">
                  {workspace.projects.map((project) => (
                    <Item
                      key={project.id}
                      size="sm"
                      render={<Link to="/projects/$projectId" params={{ projectId: project.id }} />}
                    >
                      <ItemContent>
                        <ItemTitle>{project.name}</ItemTitle>
                      </ItemContent>
                      <ItemActions>
                        <ChevronRightIcon className="size-4 text-muted-foreground" />
                      </ItemActions>
                    </Item>
                  ))}
                </ItemGroup>
              </CardContent>
            </Card>
          ))
        )}
      </section>
    </div>
  );
}

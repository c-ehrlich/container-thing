import { buttonVariants } from "@repo/ui/primitives/button";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: () => (
    <main className="grid min-h-svh place-content-center gap-4 text-center">
      <h1 className="text-4xl font-semibold tracking-tight">Hello, world</h1>
      <a href="/api/hello" className={buttonVariants()}>
        Say hello to the API
      </a>
    </main>
  ),
});

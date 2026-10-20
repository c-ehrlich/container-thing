import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRouteWithContext,
} from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import type { ReactNode } from "react";

import { ChatPanel } from "../chat/chat-panel";
import { LiveEnvironments } from "../railway/live/watch-environment";
import { getFreshSession } from "../railway/railway-oauth";
import type { RouterContext } from "../router";

import css from "../styles.css?url";

const getSignedIn = createServerFn({ method: "GET" }).handler(
  async () => (await getFreshSession()) !== null,
);

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Console" },
    ],
    links: [{ rel: "stylesheet", href: css }],
  }),
  // Signing in and out are full page loads, so there's no need to check again on navigation.
  loader: () => getSignedIn(),
  staleTime: Number.POSITIVE_INFINITY,
  shellComponent: ({ children }: { children: ReactNode }) => (
    <html lang="en" className="dark scheme-dark">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  ),
  component: RootLayout,
});

function RootLayout() {
  const signedIn = Route.useLoaderData();
  return (
    <div className="flex">
      <div className="h-svh min-w-0 flex-1 overflow-y-auto">
        <Outlet />
      </div>
      {signedIn && <ChatPanel />}
      <LiveEnvironments />
    </div>
  );
}

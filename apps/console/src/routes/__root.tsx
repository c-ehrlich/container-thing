import { SidebarInset, SidebarProvider } from "@repo/ui/primitives/sidebar";
import { HeadContent, Outlet, Scripts, createRootRouteWithContext } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import { ChatPanel } from "../chat/chat-panel";
import { createRailwayClient } from "../railway/railway-api";
import { getFreshSession } from "../railway/railway-oauth";
import { fetchViewer } from "../railway/viewer";
import type { RouterContext } from "../router";
import { AppHeader } from "../shell/app-header";
import { AppSidebar } from "../shell/app-sidebar";

import css from "../styles.css?url";

/**
 * The signed-in user and the Railway projects they shared with this app (null when signed out),
 * plus whether the sidebar was left open, so the first render doesn't flicker.
 */
const getShell = createServerFn({ method: "GET" }).handler(async () => {
  const session = await getFreshSession();
  const viewer = session ? await fetchViewer(createRailwayClient(session.accessToken)) : null;
  // Written by SidebarProvider whenever the sidebar is toggled.
  return { viewer, sidebarOpen: getCookie("sidebar_state") !== "false" };
});

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Console" },
    ],
    links: [{ rel: "stylesheet", href: css }],
  }),
  // Signing in and out are full page loads, and the shared projects only change on sign-in,
  // so there's no need to fetch again on navigation.
  loader: () => getShell(),
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
  const { viewer, sidebarOpen } = Route.useLoaderData();
  const [chatOpen, setChatOpen] = useState(true);

  // ⌘I toggles the assistant, next to the sidebar's ⌘B.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "i" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setChatOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  if (!viewer) return <Outlet />;

  return (
    <SidebarProvider defaultOpen={sidebarOpen}>
      <AppSidebar viewer={viewer} />
      <SidebarInset className="min-w-0">
        <AppHeader viewer={viewer} chatOpen={chatOpen} onOpenChat={() => setChatOpen(true)} />
        <Outlet />
      </SidebarInset>
      <ChatPanel open={chatOpen} onClose={() => setChatOpen(false)} />
    </SidebarProvider>
  );
}

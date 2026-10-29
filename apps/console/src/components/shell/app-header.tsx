import { Badge } from "@repo/ui/primitives/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@repo/ui/primitives/breadcrumb";
import { Button } from "@repo/ui/primitives/button";
import { useSidebar } from "@repo/ui/primitives/sidebar";
import { useQuery } from "@tanstack/react-query";
import { Link, useMatch } from "@tanstack/react-router";
import { PanelLeftCloseIcon, PanelLeftOpenIcon, SparklesIcon } from "lucide-react";

import { projectQuery } from "../../domains/project/project";
import type { Viewer } from "../../domains/project/viewer";
import type { Backend } from "../../server/railway/backend";
import { ProjectSwitcher } from "./project-switcher";
import { ShortcutTooltip } from "./shortcut-tooltip";

/**
 * Top bar: sidebar toggle, where you are, whether this is mock data, and, while the assistant is
 * closed, the button that opens it. Once open, the assistant closes from its own header.
 */
export function AppHeader(props: {
  viewer: Viewer;
  backend: Backend;
  chatOpen: boolean;
  onOpenChat: () => void;
}) {
  const { viewer, backend, chatOpen, onOpenChat } = props;

  return (
    <header className="sticky top-0 z-10 flex h-12 shrink-0 items-center gap-2 border-b bg-background px-4">
      <SidebarToggle />
      <Crumbs viewer={viewer} />
      <div className="ml-auto flex items-center gap-2">
        {backend === "mock" && <Badge variant="outline">Mock data</Badge>}
        {!chatOpen && (
          <ShortcutTooltip label="Open assistant" shortcut="⌘I">
            <Button variant="outline" size="sm" onClick={onOpenChat}>
              <SparklesIcon />
              Assistant
            </Button>
          </ShortcutTooltip>
        )}
      </div>
    </header>
  );
}

/**
 * Where you are: Projects › project › service. Every crumb but the last links to its page, and the
 * project's also switches to another project.
 */
function Crumbs({ viewer }: { viewer: Viewer }) {
  const match = useMatch({ from: "/projects/$projectId", shouldThrow: false });
  const serviceMatch = useMatch({
    from: "/projects/$projectId/services/$serviceId",
    shouldThrow: false,
  });
  const project = viewer.workspaces
    .flatMap((workspace) => workspace.projects)
    .find((p) => p.id === match?.params.projectId);
  // Already loaded by the project's pages, so this reads the cache.
  const { data: overview } = useQuery({
    ...projectQuery(match?.params.projectId ?? ""),
    enabled: serviceMatch !== undefined,
  });
  const service = overview?.environments
    .flatMap((e) => e.services)
    .find((s) => s.id === serviceMatch?.params.serviceId);

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          {project ? (
            <BreadcrumbLink render={<Link to="/" />}>Projects</BreadcrumbLink>
          ) : (
            <BreadcrumbPage>Projects</BreadcrumbPage>
          )}
        </BreadcrumbItem>
        {project && (
          <>
            <BreadcrumbSeparator />
            <BreadcrumbItem className="gap-0.5">
              {serviceMatch ? (
                <BreadcrumbLink
                  render={
                    <Link
                      to="/projects/$projectId"
                      params={{ projectId: project.id }}
                      search={{ environmentId: serviceMatch.search.environmentId }}
                    />
                  }
                >
                  {project.name}
                </BreadcrumbLink>
              ) : (
                <BreadcrumbPage>{project.name}</BreadcrumbPage>
              )}
              <ProjectSwitcher viewer={viewer} projectId={project.id} />
            </BreadcrumbItem>
          </>
        )}
        {serviceMatch && (
          <>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{service?.name ?? "Service"}</BreadcrumbPage>
            </BreadcrumbItem>
          </>
        )}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

/** The icon shows whether the sidebar is open, so it reads as "close" or "open". */
function SidebarToggle() {
  const { open, openMobile, isMobile, toggleSidebar } = useSidebar();
  const isOpen = isMobile ? openMobile : open;
  const label = isOpen ? "Close sidebar" : "Open sidebar";
  const Icon = isOpen ? PanelLeftCloseIcon : PanelLeftOpenIcon;

  return (
    <ShortcutTooltip label={label} shortcut="⌘B">
      <Button variant="ghost" size="icon-sm" className="-ml-1" onClick={toggleSidebar}>
        <Icon />
        <span className="sr-only">{label}</span>
      </Button>
    </ShortcutTooltip>
  );
}

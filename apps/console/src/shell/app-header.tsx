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
import { Link, useMatch } from "@tanstack/react-router";
import { PanelLeftCloseIcon, PanelLeftOpenIcon, SparklesIcon } from "lucide-react";

import type { Viewer } from "../railway/viewer";
import { ShortcutTooltip } from "./shortcut-tooltip";

/**
 * Top bar: sidebar toggle, where you are, and, while the assistant is closed, the button that
 * opens it. Once open, the assistant closes from its own header.
 */
export function AppHeader(props: { viewer: Viewer; chatOpen: boolean; onOpenChat: () => void }) {
  const { viewer, chatOpen, onOpenChat } = props;
  const match = useMatch({ from: "/projects/$projectId", shouldThrow: false });
  const project = viewer.workspaces
    .flatMap((workspace) => workspace.projects)
    .find((p) => p.id === match?.params.projectId);

  return (
    <header className="sticky top-0 z-10 flex h-12 shrink-0 items-center gap-2 border-b bg-background px-4">
      <SidebarToggle />
      <Breadcrumb>
        <BreadcrumbList>
          {project ? (
            <>
              <BreadcrumbItem>
                <BreadcrumbLink render={<Link to="/" />}>Projects</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{project.name}</BreadcrumbPage>
              </BreadcrumbItem>
            </>
          ) : (
            <BreadcrumbItem>
              <BreadcrumbPage>Projects</BreadcrumbPage>
            </BreadcrumbItem>
          )}
        </BreadcrumbList>
      </Breadcrumb>
      {!chatOpen && (
        <ShortcutTooltip label="Open assistant" shortcut="⌘I">
          <Button variant="outline" size="sm" className="ml-auto" onClick={onOpenChat}>
            <SparklesIcon />
            Assistant
          </Button>
        </ShortcutTooltip>
      )}
    </header>
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

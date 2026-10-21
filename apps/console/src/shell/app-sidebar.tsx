import { Avatar, AvatarFallback } from "@repo/ui/primitives/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@repo/ui/primitives/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@repo/ui/primitives/sidebar";
import { Link, useMatch } from "@tanstack/react-router";
import { BoxesIcon, ChevronsUpDownIcon, LayoutGridIcon, LogOutIcon } from "lucide-react";

import type { Viewer } from "../railway/viewer";

/**
 * Collapsing to icons shrinks every menu button to 32px square, which would pull the nav up when
 * the large header and footer buttons lose 16px. They keep their height so nothing moves.
 */
const KEEP_HEIGHT = "group-data-[collapsible=icon]:h-12!";

/** Left navigation: switch projects, jump between pages, and the signed-in user. */
export function AppSidebar({ viewer }: { viewer: Viewer }) {
  const match = useMatch({ from: "/projects/$projectId", shouldThrow: false });
  const home = useMatch({ from: "/", shouldThrow: false });
  const projectId = match?.params.projectId;

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <ProjectSwitcher viewer={viewer} projectId={projectId} />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton isActive={!!home} tooltip="Projects" render={<Link to="/" />}>
                <LayoutGridIcon />
                <span>Projects</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            {projectId && (
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive
                  tooltip="Services"
                  render={<Link to="/projects/$projectId" params={{ projectId }} />}
                >
                  <BoxesIcon />
                  <span>Services</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <UserMenu user={viewer.user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function ProjectSwitcher({ viewer, projectId }: { viewer: Viewer; projectId?: string }) {
  const projects = viewer.workspaces.flatMap((workspace) =>
    workspace.projects.map((project) => ({ ...project, workspace: workspace.name })),
  );
  const current = projects.find((project) => project.id === projectId);

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger render={<SidebarMenuButton size="lg" className={KEEP_HEIGHT} />}>
            <Monogram name={current?.name ?? "?"} />
            <div className="grid flex-1 text-left leading-tight">
              <span className="truncate font-medium">{current?.name ?? "Select a project"}</span>
              {current && (
                <span className="truncate text-xs text-muted-foreground">{current.workspace}</span>
              )}
            </div>
            <ChevronsUpDownIcon className="ml-auto" />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="min-w-56">
            {viewer.workspaces.map((workspace) => (
              <DropdownMenuGroup key={workspace.id}>
                <DropdownMenuLabel>{workspace.name}</DropdownMenuLabel>
                {workspace.projects.map((project) => (
                  <DropdownMenuItem
                    key={project.id}
                    render={<Link to="/projects/$projectId" params={{ projectId: project.id }} />}
                  >
                    <Monogram name={project.name} size="sm" />
                    {project.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            ))}
            {projects.length === 0 && (
              <DropdownMenuLabel>Log in again and pick projects to share.</DropdownMenuLabel>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

function UserMenu({ user }: { user: Viewer["user"] }) {
  const name = user.name ?? user.email;

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger render={<SidebarMenuButton size="lg" className={KEEP_HEIGHT} />}>
            <Avatar>
              <AvatarFallback>{name.slice(0, 1).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left leading-tight">
              <span className="truncate font-medium">{name}</span>
              {user.name && (
                <span className="truncate text-xs text-muted-foreground">{user.email}</span>
              )}
            </div>
            <ChevronsUpDownIcon className="ml-auto" />
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" className="min-w-56">
            <form method="post" action="/auth/logout">
              {/* Same as the visible text; the linter can't see children passed through `render`. */}
              <DropdownMenuItem
                nativeButton
                render={<button type="submit" aria-label="Log out" className="w-full" />}
              >
                <LogOutIcon />
                Log out
              </DropdownMenuItem>
            </form>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

function Monogram({ name, size = "default" }: { name: string; size?: "default" | "sm" }) {
  return (
    <span
      className={
        size === "sm"
          ? "flex size-5 shrink-0 items-center justify-center rounded bg-muted text-[0.625rem] font-medium"
          : "flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary font-medium text-primary-foreground"
      }
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

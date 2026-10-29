import { Avatar, AvatarFallback, AvatarImage } from "@repo/ui/primitives/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
  SidebarSeparator,
} from "@repo/ui/primitives/sidebar";
import { Link } from "@tanstack/react-router";
import {
  ArrowUpRightIcon,
  ChevronsUpDownIcon,
  FileTextIcon,
  LayoutGridIcon,
  LogOutIcon,
  TrainFrontIcon,
} from "lucide-react";

import type { Viewer } from "../../domains/project/viewer";
import type { Backend } from "../../server/railway/backend";
import { BackendMenu } from "./backend-menu";

/**
 * Collapsing to icons shrinks the menu buttons to 32px squares, so the header and footer have fixed
 * heights and center their button: nothing moves, and the hover area hugs the icon. The header is
 * as tall as the top bar so its icon lines up with the sidebar toggle there.
 */
const HEADER_HEIGHT = "h-12 justify-center py-0";
const FOOTER_HEIGHT = "h-14 justify-center py-0";
/**
 * Collapsed, these buttons drop their padding so the 32px icon fills the strip's 32px slot. Expanded,
 * they drop only the left padding, so the icon stays in the same spot instead of sliding by 8px.
 */
const ICON_BUTTON = "h-10 pl-0";

/** Railway's own help, opened in a new tab and set apart from the console's pages. */
const RESOURCES = [
  { label: "Docs", href: "https://docs.railway.com", icon: FileTextIcon },
  { label: "Central Station", href: "https://station.railway.com", icon: TrainFrontIcon },
];

/**
 * Left navigation: the console's screens, Railway's help, the data source, and the signed-in user.
 * It's the same on every page; which project you're in is the top bar's job.
 */
export function AppSidebar({ viewer, backend }: { viewer: Viewer; backend: Backend }) {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className={HEADER_HEIGHT}>
        <Brand />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem>
              {/* The only screen so far: every project and service page sits under it. */}
              <SidebarMenuButton isActive tooltip="Projects" render={<Link to="/" />}>
                <LayoutGridIcon />
                <span>Projects</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
        <SidebarSeparator />
        <SidebarGroup>
          <SidebarMenu>
            {RESOURCES.map((resource) => (
              <SidebarMenuItem key={resource.href}>
                <SidebarMenuButton
                  tooltip={resource.label}
                  className="text-muted-foreground"
                  render={
                    <a
                      href={resource.href}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`${resource.label} (opens in a new tab)`}
                    />
                  }
                >
                  <resource.icon />
                  <span>{resource.label}</span>
                  <ArrowUpRightIcon className="size-3!" />
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
        <SidebarGroup className="mt-auto">
          <BackendMenu backend={backend} />
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className={FOOTER_HEIGHT}>
        <UserMenu user={viewer.user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function Brand() {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton size="lg" className={ICON_BUTTON} render={<Link to="/" />}>
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <TrainFrontIcon className="size-4" />
          </span>
          <span className="truncate font-medium">Container Thing</span>
        </SidebarMenuButton>
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
          <DropdownMenuTrigger render={<SidebarMenuButton size="lg" className={ICON_BUTTON} />}>
            <Avatar>
              {user.avatar && <AvatarImage src={user.avatar} alt="" />}
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

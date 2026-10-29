import { Button } from "@repo/ui/primitives/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@repo/ui/primitives/dropdown-menu";
import { Link } from "@tanstack/react-router";
import { CheckIcon, ChevronsUpDownIcon } from "lucide-react";

import type { Viewer } from "../../domains/project/viewer";

/**
 * Sits beside the project's breadcrumb: the name stays a link to the project, and this opens every
 * shared project by workspace, with a check on the one you're in.
 */
export function ProjectSwitcher({ viewer, projectId }: { viewer: Viewer; projectId: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            className="text-muted-foreground"
            aria-label="Switch project"
          />
        }
      >
        <ChevronsUpDownIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-[70svh] min-w-56">
        {viewer.workspaces.map((workspace) => (
          <DropdownMenuGroup key={workspace.id}>
            <DropdownMenuLabel>{workspace.name}</DropdownMenuLabel>
            {workspace.projects.map((project) => (
              <DropdownMenuItem
                key={project.id}
                render={<Link to="/projects/$projectId" params={{ projectId: project.id }} />}
              >
                <Monogram name={project.name} />
                {project.name}
                {project.id === projectId && <CheckIcon className="ml-auto" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Monogram({ name }: { name: string }) {
  return (
    <span className="flex size-5 shrink-0 items-center justify-center rounded bg-muted text-[0.625rem] font-medium">
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

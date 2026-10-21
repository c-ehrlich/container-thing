import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/ui/primitives/alert-dialog";
import { Button } from "@repo/ui/primitives/button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@repo/ui/primitives/popover";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@repo/ui/primitives/sidebar";
import { Spinner } from "@repo/ui/primitives/spinner";
import { StatusDot } from "@repo/ui/primitives/status-dot";
import { ToggleGroup, ToggleGroupItem } from "@repo/ui/primitives/toggle-group";
import { useMutation, useQuery } from "@tanstack/react-query";
import { DatabaseIcon, RotateCcwIcon } from "lucide-react";
import { useState } from "react";

import type { Backend } from "../railway/backend";
import { mockStatsQuery, resetMockFn, setBackendFn } from "../railway/backend-switch";

/**
 * Switches between the real Railway and the mock, and resets the mock. Every cached query and the
 * live connection belong to one backend, so both reload the page.
 */
export function BackendMenu({ backend }: { backend: Backend }) {
  const [open, setOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const mock = backend === "mock";

  const switchTo = useMutation({
    mutationFn: (next: Backend) => setBackendFn({ data: { backend: next } }),
    // Real project IDs don't exist in the mock and the other way round, so start from the overview.
    onSuccess: () => window.location.assign("/"),
  });
  const reset = useMutation({
    mutationFn: () => resetMockFn(),
    onSuccess: () => window.location.reload(),
  });

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger
            render={<SidebarMenuButton tooltip={mock ? "Mock data" : "Railway data"} />}
          >
            <DatabaseIcon />
            <span>{mock ? "Mock data" : "Railway data"}</span>
            {mock && <StatusDot tone="warning" className="ml-auto" />}
          </PopoverTrigger>
          <PopoverContent side="right" align="end" className="w-72">
            <PopoverHeader>
              <PopoverTitle>Data source</PopoverTitle>
              <PopoverDescription>
                The mock has many more projects. Changes there only happen in this app; nothing is
                deployed.
              </PopoverDescription>
            </PopoverHeader>
            <ToggleGroup
              size="sm"
              variant="outline"
              className="w-full"
              value={[backend]}
              disabled={switchTo.isPending}
              onValueChange={(value) => {
                const next = value[0] === "mock" ? "mock" : "railway";
                if (value[0] && next !== backend) switchTo.mutate(next);
              }}
            >
              <ToggleGroupItem value="railway" className="flex-1">
                Railway
              </ToggleGroupItem>
              <ToggleGroupItem value="mock" className="flex-1">
                Mock
              </ToggleGroupItem>
            </ToggleGroup>
            {switchTo.isError && (
              <p className="text-xs text-destructive">{switchTo.error.message}</p>
            )}
            {mock && (
              <MockControls
                onReset={() => {
                  setOpen(false);
                  setConfirmReset(true);
                }}
              />
            )}
          </PopoverContent>
        </Popover>
        {/* Outside the popover, which closes when the dialog takes focus. */}
        <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reset the mock data?</AlertDialogTitle>
              <AlertDialogDescription>
                Everyone on the mock gets the starting data back: services added since are gone and
                deploys in flight are dropped.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                disabled={reset.isPending}
                onClick={() => reset.mutate()}
              >
                {reset.isPending && <Spinner data-icon="inline-start" />}
                Reset
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

function MockControls(props: { onReset: () => void }) {
  const { data: stats } = useQuery(mockStatsQuery());

  return (
    <div className="flex items-center justify-between gap-2 border-t pt-2.5">
      <span className="text-xs text-muted-foreground tabular-nums">
        {stats
          ? `${stats.projects} projects · ${stats.services} services${stats.deploying > 0 ? ` · ${stats.deploying} deploying` : ""}`
          : "Loading…"}
      </span>
      <Button size="sm" variant="outline" onClick={props.onReset}>
        <RotateCcwIcon data-icon="inline-start" />
        Reset
      </Button>
    </div>
  );
}

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { projectScope } from "../project/project";
import { runActionFn } from "./actions";
import type { RailwayAction } from "./actions";

/**
 * A mutation that changes something in a project. Once it succeeds, everything about the project is
 * refetched wherever it's shown (all of it is keyed under `projectScope`), and the mutation only
 * settles after that, so callers can rely on fresh data.
 */
export function useProjectMutation<TVariables, TData>(
  projectId: string,
  mutationFn: (variables: TVariables) => Promise<TData>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: projectScope(projectId) }),
  });
}

/** Runs `RailwayAction`s in one project. */
export function useRailwayAction(projectId: string) {
  return useProjectMutation(projectId, (action: RailwayAction) => runActionFn({ data: action }));
}

/**
 * For changes made on the server, like the chat's tools: the browser's cache doesn't know a start or
 * stop just happened, so once `done`, refresh the project the same way `useProjectMutation` does.
 * Railway's live push would also get there, but it can take a few seconds.
 */
export function useRefreshProjectWhen(done: boolean, projectId: string | undefined) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (done && projectId) {
      void queryClient.invalidateQueries({ queryKey: projectScope(projectId) });
    }
  }, [done, projectId, queryClient]);
}

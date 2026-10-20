import { useQuery } from "@tanstack/react-query";
import { useEffect, useSyncExternalStore } from "react";

import { projectQuery } from "../project";
import type { LiveConnection } from "./live-client";
import { useEnvironmentLive } from "./use-environment-live";
import type { LiveMode } from "./use-environment-live";

/**
 * Environments currently on screen (project page, chat widgets, ...), each kept live exactly once by
 * `<LiveEnvironments />`. Without this, every widget for the same environment would open its own
 * subscriptions and fire its own refetches.
 */
interface Watch {
  key: string;
  projectId: string;
  environmentId: string;
  count: number;
  status?: LiveStatus;
}

const registry = new Map<string, Watch>();
// A stable snapshot for React, rebuilt only when registry membership changes.
let watches: Watch[] = [];
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) {
    listener();
  }
}

function publishWatches() {
  watches = Array.from(registry.values());
  notify();
}

function subscribeToRegistry(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const watchKey = (projectId: string, environmentId: string) => `${projectId}/${environmentId}`;

/** Keeps an environment live while mounted and returns its status once the watcher starts. */
export function useWatchEnvironment(
  projectId: string,
  environmentId: string | undefined,
): LiveStatus | undefined {
  useEffect(
    () => (environmentId ? retainWatch(projectId, environmentId) : undefined),
    [projectId, environmentId],
  );

  return useSyncExternalStore(
    subscribeToRegistry,
    () => (environmentId ? registry.get(watchKey(projectId, environmentId))?.status : undefined),
    () => undefined,
  );
}

/** Adds a watcher for the environment and returns a function that removes it again. */
function retainWatch(projectId: string, environmentId: string): () => void {
  const key = watchKey(projectId, environmentId);
  const entry = registry.get(key) ?? {
    key,
    projectId,
    environmentId,
    count: 0,
  };
  entry.count += 1;
  if (entry.count === 1) {
    registry.set(key, entry);
    publishWatches();
  }
  return () => {
    entry.count -= 1;
    if (entry.count > 0) return;
    registry.delete(key);
    publishWatches();
  };
}

export interface LiveStatus {
  mode: LiveMode;
  connection: LiveConnection;
}

/** Mount once near the root: runs the subscriptions for every watched environment. */
export function LiveEnvironments() {
  const current = useSyncExternalStore(
    subscribeToRegistry,
    () => watches,
    () => watches,
  );
  return current.map((watch) => <EnvironmentWatcher key={watch.key} watch={watch} />);
}

function EnvironmentWatcher(props: { watch: Watch }) {
  const { key, projectId, environmentId } = props.watch;
  const query = projectQuery(projectId);
  const { data: project } = useQuery(query);
  const environment = project?.environments.find((e) => e.id === environmentId);

  const { mode, connection } = useEnvironmentLive({
    query,
    environmentId,
    deploymentIds:
      environment?.services.flatMap((s) => (s.deployment ? [s.deployment.id] : [])) ?? [],
  });

  useEffect(() => {
    const watch = registry.get(key);
    if (!watch) return;
    watch.status = { mode, connection };
    notify();
  }, [key, mode, connection]);

  return null;
}

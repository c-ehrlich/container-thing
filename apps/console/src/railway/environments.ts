type ProjectEnvironments<E> = {
  primaryEnvironmentId: string | null;
  environments: E[];
};

/** Railway's primary environment (the oldest non-ephemeral one), else `production`, else the first. */
export function primaryEnvironment<E extends { id: string; name: string }>(
  project: ProjectEnvironments<E>,
): E | undefined {
  return (
    project.environments.find((e) => e.id === project.primaryEnvironmentId) ??
    project.environments.find((e) => e.name === "production") ??
    project.environments[0]
  );
}

/** The requested environment, else the primary one. */
export function pickEnvironment<E extends { id: string; name: string }>(
  project: ProjectEnvironments<E>,
  environmentId?: string,
): E | undefined {
  return project.environments.find((e) => e.id === environmentId) ?? primaryEnvironment(project);
}

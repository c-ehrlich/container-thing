/**
 * Every query about one project is keyed under this: its overview, a service's page, and so on. So
 * invalidating it refreshes whatever about the project is on screen, after an action or a live push.
 */
export const projectScope = (projectId: string) => ["project", projectId] as const;

import { z } from "zod";

/**
 * Flattening shared by the project's and a service's queries, which ask Railway for the same fields
 * of a service instance and its deployments.
 */

/** The parts of `deployment.meta` we show. It's untyped JSON; commit fields only exist for GitHub deploys. */
const DeploymentMeta = z.object({
  commitMessage: z.string().optional().catch(undefined),
  image: z.string().optional().catch(undefined),
});

export function deploymentMeta(meta: unknown): z.infer<typeof DeploymentMeta> {
  const parsed = DeploymentMeta.safeParse(meta ?? {});
  return parsed.success ? parsed.data : {};
}

/** The image a service runs, else its repo. */
export function sourceOf(source: { image: string | null; repo: string | null } | null) {
  return source?.image ?? source?.repo ?? null;
}

/** Custom domains first: they're the ones people chose. */
export function domainsOf(domains: {
  customDomains: { domain: string }[];
  serviceDomains: { domain: string }[];
}) {
  return [...domains.customDomains, ...domains.serviceDomains].map((d) => d.domain);
}

/** The start of the last day, which the usage charts cover. */
export const oneDayAgo = () => new Date(Date.now() - 24 * 60 * 60_000).toISOString();

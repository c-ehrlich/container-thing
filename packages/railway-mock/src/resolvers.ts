import { buildLogs, deployLogs, deployLogsBetween } from "./logs";
import type { Deployment, MockStore, Project, Service, ServiceInstance } from "./store";
import { stream } from "./stream";
import { estimate, series } from "./usage";
import type { Measurement } from "./usage";

/**
 * Root values for graphql-js, one per operation type. Only the fields the console asks for are
 * here; anything else resolves to null, which Railway's non-null fields turn into an error.
 *
 * Objects are shaped like Railway's types. Fields that cost something to compute are functions,
 * which graphql-js only calls when a query selects them.
 */

const iso = (ms: number) => new Date(ms).toISOString();

const connection = <T>(nodes: T[]) => ({
  edges: nodes.map((node) => ({ node })),
  pageInfo: { hasNextPage: false, hasPreviousPage: false, startCursor: null, endCursor: null },
});

/** Railway's references, without the `${{ }}`: `postgres.DATABASE_URL`. */
const referencesIn = (value: string) =>
  [...value.matchAll(/\$\{\{\s*([\w-]+\.\w+)\s*\}\}/g)].flatMap((m) => (m[1] ? [m[1]] : []));

/** When a daily cron schedule like `0 3 * * *` next runs (UTC); the seed has no other kind. */
function nextCronRun(schedule: string | null) {
  const [minute, hour] = schedule?.split(" ").map(Number) ?? [];
  if (minute === undefined || hour === undefined) return null;
  const next = new Date();
  next.setUTCHours(hour, minute, 0, 0);
  if (next.getTime() <= Date.now()) next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString();
}

const deploymentView = (d: Deployment) => ({
  id: d.id,
  status: d.status,
  createdAt: iso(d.createdAt),
  statusUpdatedAt: iso(d.statusUpdatedAt),
  projectId: d.projectId,
  serviceId: d.serviceId,
  environmentId: d.environmentId,
  canRollback: d.succeeded,
  meta: {
    ...(d.image && { image: d.image }),
    ...(d.commitMessage && { commitMessage: d.commitMessage, branch: "main" }),
  },
  creator: d.creator ? { name: d.creator } : null,
});

const serviceView = (service: Service) => ({
  id: service.id,
  name: service.name,
  projectId: service.projectId,
});

export function createRoots(store: MockStore) {
  const instanceView = (instance: ServiceInstance) => {
    const service = store.service(instance.serviceId);
    const { serviceId, environmentId } = instance;
    return {
      id: `${serviceId}:${environmentId}`,
      serviceId,
      environmentId,
      serviceName: service.name,
      source: service.image || service.repo ? { image: service.image, repo: service.repo } : null,
      region: instance.region,
      numReplicas: instance.numReplicas,
      sleepApplication: instance.sleepApplication,
      cronSchedule: instance.cronSchedule,
      nextCronRunAt: () => nextCronRun(instance.cronSchedule),
      domains: {
        serviceDomains: instance.serviceDomains.map((domain) => ({ domain })),
        customDomains: instance.customDomains.map((domain) => ({ domain })),
      },
      latestDeployment: () => {
        const latest = store.latestDeployment(serviceId, environmentId);
        return latest && deploymentView(latest);
      },
      hasEverDeployed: () => store.deployments({ serviceId, environmentId }).length > 0,
    };
  };

  const environmentView = (environmentId: string) => {
    const environment = store.environment(environmentId);
    return {
      id: environment.id,
      name: environment.name,
      projectId: environment.projectId,
      isEphemeral: environment.isEphemeral,
      serviceInstances: () => connection(store.instancesIn(environment.id).map(instanceView)),
      variables: () =>
        connection(
          store.instancesIn(environment.id).flatMap((instance) =>
            Object.entries(instance.variables).map(([name, value]) => ({
              name,
              serviceId: instance.serviceId,
              environmentId: environment.id,
              references: referencesIn(value),
            })),
          ),
        ),
    };
  };

  const projectView = (project: Project) => ({
    id: project.id,
    name: project.name,
    primaryEnvironmentId: () => store.primaryEnvironmentOf(project.id)?.id ?? null,
    environments: () =>
      connection(store.environmentsOf(project.id).map((e) => environmentView(e.id))),
  });

  type MetricsArgs = {
    projectId?: string;
    serviceId?: string;
    environmentId?: string;
    startDate: string;
    endDate?: string;
    sampleRateSeconds?: number;
    measurements: Measurement[];
    groupBy?: string[];
  };

  const query = {
    me: () => ({ id: "demo-user", ...store.user }),
    externalWorkspaces: () =>
      store.workspaces().map((workspace) => ({
        id: workspace.id,
        name: workspace.name,
        projects: store.projectsIn(workspace.id).map(projectView),
      })),
    project: ({ id }: { id: string }) => projectView(store.project(id)),
    serviceInstance: (args: { serviceId: string; environmentId: string }) =>
      instanceView(store.instance(args.serviceId, args.environmentId)),
    deployments: (args: {
      first?: number;
      input: { projectId?: string; serviceId?: string; environmentId?: string };
    }) =>
      connection(
        store
          .deployments(args.input)
          .slice(0, args.first ?? 50)
          .map(deploymentView),
      ),
    deploymentLogs: (args: { deploymentId: string; limit?: number }) =>
      deployLogs(store, args.deploymentId, args.limit ?? 100),
    buildLogs: (args: { deploymentId: string; limit?: number }) =>
      buildLogs(store, args.deploymentId).slice(-(args.limit ?? 100)),
    metrics: (args: MetricsArgs) => {
      const range = {
        from: Date.parse(args.startDate),
        to: args.endDate ? Date.parse(args.endDate) : Date.now(),
        sampleSeconds: args.sampleRateSeconds ?? 3600,
      };
      const projectId =
        args.projectId ?? (args.serviceId && store.service(args.serviceId).projectId);
      if (!projectId) throw new Error("Either projectId or serviceId is required");
      const instances = store
        .instancesOfProject(projectId)
        .filter(
          (i) =>
            (!args.serviceId || i.serviceId === args.serviceId) &&
            (!args.environmentId || i.environmentId === args.environmentId),
        );

      const perInstance = Boolean(args.serviceId) || args.groupBy?.includes("SERVICE_ID");
      if (perInstance) {
        return instances.flatMap((instance) =>
          args.measurements.flatMap((measurement) => {
            const values = series(store, instance, measurement, range);
            // Railway leaves out services that have no samples.
            if (values.length === 0 && !args.serviceId) return [];
            return [
              {
                measurement,
                tags: {
                  projectId,
                  serviceId: instance.serviceId,
                  environmentId: instance.environmentId,
                },
                values,
              },
            ];
          }),
        );
      }
      return args.measurements.map((measurement) => {
        const totals = new Map<number, number>();
        for (const instance of instances) {
          for (const v of series(store, instance, measurement, range)) {
            totals.set(v.ts, (totals.get(v.ts) ?? 0) + v.value);
          }
        }
        return {
          measurement,
          tags: { projectId },
          values: [...totals].toSorted(([a], [b]) => a - b).map(([ts, value]) => ({ ts, value })),
        };
      });
    },
    estimatedUsage: (args: { projectId: string; measurements: string[] }) =>
      args.measurements.map((measurement) => ({
        measurement,
        projectId: args.projectId,
        estimatedValue: estimate(store, store.project(args.projectId).id, measurement),
      })),
  };

  const mutation = {
    serviceInstanceDeployV2: (args: { serviceId: string; environmentId: string }) =>
      store.deploy(args.serviceId, args.environmentId),
    deploymentRemove: ({ id }: { id: string }) => {
      store.remove(id);
      return true;
    },
    deploymentRestart: ({ id }: { id: string }) => {
      store.restart(id);
      return true;
    },
    deploymentRollback: ({ id }: { id: string }) => {
      store.rollback(id);
      return true;
    },
    deploymentCancel: ({ id }: { id: string }) => {
      store.cancel(id);
      return true;
    },
    serviceDelete: (args: { id: string; environmentId?: string }) => {
      const environments = args.environmentId
        ? [args.environmentId]
        : store
            .environmentsOf(store.service(args.id).projectId)
            .filter((e) => !e.isEphemeral)
            .map((e) => e.id);
      for (const environmentId of environments) store.deleteService(args.id, environmentId);
      return true;
    },
    serviceCreate: ({
      input,
    }: {
      input: {
        projectId: string;
        environmentId?: string;
        name?: string;
        source?: { image?: string; repo?: string };
        variables?: Record<string, string>;
      };
    }) =>
      serviceView(
        store.createService({
          ...input,
          image: input.source?.image,
          repo: input.source?.repo,
        }),
      ),
  };

  /** Each yields `{ [field]: value }`, which graphql-js then resolves the selection against. */
  const subscription = {
    canvasInvalidation: ({ environmentId }: { environmentId: string }) =>
      stream((push) => {
        const send = () => push({ canvasInvalidation: { id: store.versionOf(environmentId) } });
        // Like Railway: the current hash right away, then again every few seconds and on changes.
        send();
        const heartbeat = setInterval(send, 5_000);
        const off = store.onChange((change) => {
          if (change.environmentId === environmentId) send();
        });
        return () => {
          clearInterval(heartbeat);
          off();
        };
      }),
    deployment: ({ id }: { id: string }) =>
      stream((push) =>
        store.onChange((change) => {
          if (change.deploymentId !== id) return;
          push({ deployment: deploymentView(store.deployment(id)) });
        }),
      ),
    deploymentLogs: ({ deploymentId }: { deploymentId: string }) =>
      stream((push) => {
        let since = Date.now();
        const timer = setInterval(() => {
          const now = Date.now();
          // The deployment is gone after a reset or once its service is deleted.
          const lines = store.hasDeployment(deploymentId)
            ? deployLogsBetween(store, deploymentId, since, now)
            : [];
          since = now;
          if (lines.length > 0) push({ deploymentLogs: lines });
        }, 1_000);
        return () => clearInterval(timer);
      }),
  };

  return { query, mutation, subscription };
}

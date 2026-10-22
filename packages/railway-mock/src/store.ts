/**
 * The mock's world: Railway's entities as plain tables, the calls that change them, and the timers
 * that move deployments along like Railway would. Everything else (GraphQL, logs, metrics) reads
 * from here.
 */

export type DeploymentStatus =
  | "BUILDING"
  | "CRASHED"
  | "DEPLOYING"
  | "FAILED"
  | "INITIALIZING"
  | "NEEDS_APPROVAL"
  | "QUEUED"
  | "REMOVED"
  | "REMOVING"
  | "SKIPPED"
  | "SLEEPING"
  | "SUCCESS"
  | "WAITING";

export interface User {
  name: string;
  email: string;
  avatar: string | null;
}

export interface Workspace {
  id: string;
  name: string;
}

export interface Project {
  id: string;
  workspaceId: string;
  name: string;
}

export interface Environment {
  id: string;
  projectId: string;
  name: string;
  isEphemeral: boolean;
}

export interface Service {
  id: string;
  projectId: string;
  name: string;
  image: string | null;
  repo: string | null;
}

/** What a running service uses, which the metrics and cost estimates are generated from. */
export interface Usage {
  /** Typical vCPU. */
  cpu: number;
  memoryGb: number;
  /** How many times its usual CPU it has used over the last few hours. */
  spike?: number;
  diskGb?: number;
  egressGbPerMonth?: number;
}

/** A service in one environment, with that environment's settings. */
export interface ServiceInstance {
  serviceId: string;
  environmentId: string;
  region: string;
  numReplicas: number;
  sleepApplication: boolean;
  cronSchedule: string | null;
  serviceDomains: string[];
  customDomains: string[];
  /** Values may reference other services, like `${{ postgres.DATABASE_URL }}`. */
  variables: Record<string, string>;
  usage: Usage;
}

export interface Deployment {
  id: string;
  projectId: string;
  serviceId: string;
  environmentId: string;
  status: DeploymentStatus;
  /** Epoch milliseconds. */
  createdAt: number;
  statusUpdatedAt: number;
  image: string | null;
  commitMessage: string | null;
  creator: string | null;
  /** Whether it ever came up. Only those can be rolled back to. */
  succeeded: boolean;
  /** Never finishes on its own, so the overview has a stuck deploy to show. */
  stuck?: boolean;
}

export interface World {
  user: User;
  workspaces: Workspace[];
  projects: Project[];
  environments: Environment[];
  services: Service[];
  instances: ServiceInstance[];
  /** Oldest first. */
  deployments: Deployment[];
}

/** Something changed in an environment; `deploymentId` if it was that deployment's status. */
export interface Change {
  environmentId: string;
  deploymentId?: string;
}

const PENDING = new Set<DeploymentStatus>([
  "QUEUED",
  "WAITING",
  "NEEDS_APPROVAL",
  "INITIALIZING",
  "BUILDING",
  "DEPLOYING",
]);
/** Statuses with a container up, which a newer successful deploy replaces. */
const ACTIVE = new Set<DeploymentStatus>(["SUCCESS", "SLEEPING", "CRASHED"]);

/** How long each step of a deploy takes, in milliseconds. */
export const TIMINGS = {
  queued: 1_500,
  building: 6_000,
  deploying: 4_000,
  removing: 2_000,
  /** How long an image tagged `:crash` stays up. */
  crashAfter: 8_000,
};

const DATASTORE = /postgres|mysql|mariadb|redis|valkey|mongo|clickhouse|kafka|minio/;

export function isDatastore(service: Pick<Service, "name" | "image">) {
  return DATASTORE.test((service.image ?? service.name).split(":")[0] ?? "");
}

/** `:broken` fails to build and `:crash` crashes soon after it's up, to try out failures. */
function outcomeOf(image: string | null): "success" | "fail" | "crash" {
  const tag = image?.match(/:([^:/]+)$/)?.[1];
  return tag === "broken" ? "fail" : tag === "crash" ? "crash" : "success";
}

export class MockStore {
  #world: World;
  #versions = new Map<string, number>();
  #generation = 0;
  #timers = new Set<ReturnType<typeof setTimeout>>();
  #listeners = new Set<(change: Change) => void>();

  constructor(world: World) {
    this.#world = world;
    this.#resumePending();
  }

  get user() {
    return this.#world.user;
  }

  /** Replaces the whole world, e.g. with a fresh seed, and tells every subscriber. */
  replace(world: World) {
    for (const timer of this.#timers) clearTimeout(timer);
    this.#timers.clear();
    const previous = this.#world.environments;
    this.#world = world;
    this.#generation += 1;
    this.#versions.clear();
    this.#resumePending();
    for (const environment of [...previous, ...world.environments]) {
      this.#emit({ environmentId: environment.id });
    }
  }

  onChange(listener: (change: Change) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /** Changes whenever anything in the environment does, like Railway's `canvasInvalidation`. */
  versionOf(environmentId: string) {
    return `${this.#generation}.${this.#versions.get(environmentId) ?? 0}`;
  }

  // Reads

  workspaces() {
    return this.#world.workspaces;
  }

  projectsIn(workspaceId: string) {
    return this.#world.projects.filter((p) => p.workspaceId === workspaceId);
  }

  project(id: string) {
    const project = this.#world.projects.find((p) => p.id === id);
    if (!project) throw new Error("Project not found");
    return project;
  }

  environmentsOf(projectId: string) {
    return this.#world.environments.filter((e) => e.projectId === projectId);
  }

  environment(id: string) {
    const environment = this.#world.environments.find((e) => e.id === id);
    if (!environment) throw new Error("Environment not found");
    return environment;
  }

  /** The oldest environment that isn't a PR environment, like Railway's. */
  primaryEnvironmentOf(projectId: string) {
    return this.environmentsOf(projectId).find((e) => !e.isEphemeral);
  }

  service(id: string) {
    const service = this.#world.services.find((s) => s.id === id);
    if (!service) throw new Error("Service not found");
    return service;
  }

  servicesOf(projectId: string) {
    return this.#world.services.filter((s) => s.projectId === projectId);
  }

  instancesIn(environmentId: string) {
    return this.#world.instances.filter((i) => i.environmentId === environmentId);
  }

  instancesOfProject(projectId: string) {
    const environments = new Set(this.environmentsOf(projectId).map((e) => e.id));
    return this.#world.instances.filter((i) => environments.has(i.environmentId));
  }

  instance(serviceId: string, environmentId: string) {
    const instance = this.#world.instances.find(
      (i) => i.serviceId === serviceId && i.environmentId === environmentId,
    );
    if (!instance) throw new Error("ServiceInstance not found");
    return instance;
  }

  hasDeployment(id: string) {
    return this.#world.deployments.some((d) => d.id === id);
  }

  deployment(id: string) {
    const deployment = this.#world.deployments.find((d) => d.id === id);
    if (!deployment) throw new Error("Deployment not found");
    return deployment;
  }

  /** Newest first. */
  deployments(filter: { projectId?: string; serviceId?: string; environmentId?: string }) {
    return this.#world.deployments
      .filter(
        (d) =>
          (!filter.projectId || d.projectId === filter.projectId) &&
          (!filter.serviceId || d.serviceId === filter.serviceId) &&
          (!filter.environmentId || d.environmentId === filter.environmentId),
      )
      .toReversed();
  }

  /** Like Railway: the newest deployment that wasn't removed, so null for a stopped service. */
  latestDeployment(serviceId: string, environmentId: string) {
    return (
      this.deployments({ serviceId, environmentId }).find((d) => d.status !== "REMOVED") ?? null
    );
  }

  /** The deployment whose container is up, if any. */
  runningDeployment(serviceId: string, environmentId: string) {
    return (
      this.deployments({ serviceId, environmentId }).find(
        (d) => d.status === "SUCCESS" || d.status === "SLEEPING",
      ) ?? null
    );
  }

  stats() {
    return {
      projects: this.#world.projects.length,
      services: this.#world.instances.length,
      deploying: this.#world.deployments.filter((d) => PENDING.has(d.status)).length,
    };
  }

  // Writes

  /** Deploys the service's current source and returns the new deployment's ID. */
  deploy(serviceId: string, environmentId: string) {
    const service = this.service(serviceId);
    this.instance(serviceId, environmentId);
    const previous = this.deployments({ serviceId, environmentId })[0];
    const deployment = this.#create({
      projectId: service.projectId,
      serviceId,
      environmentId,
      image: service.image,
      // A redeploy of a repo builds the same commit again.
      commitMessage: service.repo ? (previous?.commitMessage ?? null) : null,
    });
    this.#run(deployment, true);
    return deployment.id;
  }

  remove(deploymentId: string) {
    const deployment = this.deployment(deploymentId);
    if (deployment.status === "REMOVED" || deployment.status === "REMOVING") return;
    this.#setStatus(deployment, "REMOVING");
    this.#after(TIMINGS.removing, deployment, "REMOVING", () =>
      this.#setStatus(deployment, "REMOVED"),
    );
  }

  /** Restarts the container without building, which also brings a crashed one back. */
  restart(deploymentId: string) {
    const deployment = this.deployment(deploymentId);
    if (!ACTIVE.has(deployment.status)) throw new Error("Deployment is not running");
    this.#setStatus(deployment, "DEPLOYING");
    this.#after(TIMINGS.deploying, deployment, "DEPLOYING", () => this.#succeed(deployment));
  }

  /** Deploys an earlier deployment's image again, as a new deployment. */
  rollback(deploymentId: string) {
    const source = this.deployment(deploymentId);
    if (!source.succeeded) throw new Error("Cannot rollback to this deployment");
    const deployment = this.#create({
      projectId: source.projectId,
      serviceId: source.serviceId,
      environmentId: source.environmentId,
      image: source.image,
      commitMessage: source.commitMessage,
    });
    this.#run(deployment, false);
  }

  cancel(deploymentId: string) {
    const deployment = this.deployment(deploymentId);
    if (!PENDING.has(deployment.status)) throw new Error("Deployment is not in progress");
    this.#setStatus(deployment, "REMOVED");
  }

  createService(input: {
    projectId: string;
    environmentId?: string | null;
    name?: string | null;
    image?: string | null;
    repo?: string | null;
    variables?: Record<string, string> | null;
  }) {
    const project = this.project(input.projectId);
    const environment = input.environmentId
      ? this.environment(input.environmentId)
      : this.primaryEnvironmentOf(project.id);
    if (!environment || environment.projectId !== project.id) {
      throw new Error("Environment not found");
    }
    const service: Service = {
      id: crypto.randomUUID(),
      projectId: project.id,
      name: input.name || input.image?.split("/").at(-1)?.split(":")[0] || "service",
      image: input.image ?? null,
      repo: input.repo ?? null,
    };
    const datastore = isDatastore(service);
    this.#world.services.push(service);
    this.#world.instances.push({
      serviceId: service.id,
      environmentId: environment.id,
      region: "us-west2",
      numReplicas: 1,
      sleepApplication: false,
      cronSchedule: null,
      serviceDomains: [],
      customDomains: [],
      variables: input.variables ?? {},
      usage: datastore
        ? { cpu: 0.03, memoryGb: 0.25, diskGb: 0.5 }
        : { cpu: 0.05, memoryGb: 0.15, egressGbPerMonth: 1 },
    });
    this.deploy(service.id, environment.id);
    return service;
  }

  /** Removes the service from one environment, and the service itself once no environment has it. */
  deleteService(serviceId: string, environmentId: string) {
    this.instance(serviceId, environmentId);
    const world = this.#world;
    world.instances = world.instances.filter(
      (i) => !(i.serviceId === serviceId && i.environmentId === environmentId),
    );
    world.deployments = world.deployments.filter(
      (d) => !(d.serviceId === serviceId && d.environmentId === environmentId),
    );
    if (!world.instances.some((i) => i.serviceId === serviceId)) {
      world.services = world.services.filter((s) => s.id !== serviceId);
    }
    this.#emit({ environmentId });
  }

  // Lifecycle

  #create(
    fields: Omit<
      Deployment,
      "id" | "status" | "createdAt" | "statusUpdatedAt" | "creator" | "succeeded"
    >,
  ) {
    const now = Date.now();
    const deployment: Deployment = {
      ...fields,
      id: crypto.randomUUID(),
      status: "QUEUED",
      createdAt: now,
      statusUpdatedAt: now,
      creator: this.#world.user.name,
      succeeded: false,
    };
    this.#world.deployments.push(deployment);
    this.#emit({ environmentId: deployment.environmentId, deploymentId: deployment.id });
    return deployment;
  }

  /** Takes a new deployment from QUEUED to up (or failed), building first unless it's a rollback. */
  #run(deployment: Deployment, build: boolean) {
    const outcome = outcomeOf(deployment.image);
    const deploy = () => {
      this.#setStatus(deployment, "DEPLOYING");
      this.#after(TIMINGS.deploying, deployment, "DEPLOYING", () => {
        this.#succeed(deployment);
        if (outcome !== "crash") return;
        this.#after(TIMINGS.crashAfter, deployment, "SUCCESS", () =>
          this.#setStatus(deployment, "CRASHED"),
        );
      });
    };
    this.#after(TIMINGS.queued, deployment, "QUEUED", () => {
      if (!build) return deploy();
      this.#setStatus(deployment, "BUILDING");
      this.#after(TIMINGS.building, deployment, "BUILDING", () =>
        outcome === "fail" ? this.#setStatus(deployment, "FAILED") : deploy(),
      );
    });
  }

  /** Picks up deployments that were in flight when the world was built. */
  #resumePending() {
    for (const deployment of this.#world.deployments) {
      if (deployment.stuck || !PENDING.has(deployment.status)) continue;
      // Long enough after a reset to watch them land.
      const remaining = Math.max(5_000, deployment.createdAt + 60_000 - Date.now());
      this.#after(remaining, deployment, deployment.status, () => {
        this.#setStatus(deployment, "DEPLOYING");
        this.#after(TIMINGS.deploying, deployment, "DEPLOYING", () => this.#succeed(deployment));
      });
    }
  }

  /** Up, replacing whatever ran before it. */
  #succeed(deployment: Deployment) {
    for (const other of this.#world.deployments) {
      if (
        other !== deployment &&
        other.serviceId === deployment.serviceId &&
        other.environmentId === deployment.environmentId &&
        (ACTIVE.has(other.status) ||
          (PENDING.has(other.status) && other.createdAt < deployment.createdAt))
      ) {
        this.#setStatus(other, "REMOVED");
      }
    }
    deployment.succeeded = true;
    this.#setStatus(deployment, "SUCCESS");
  }

  /** Runs `step` after `ms`, unless the deployment was changed by something else in the meantime. */
  #after(ms: number, deployment: Deployment, expected: DeploymentStatus, step: () => void) {
    const generation = this.#generation;
    const timer = setTimeout(() => {
      this.#timers.delete(timer);
      if (generation === this.#generation && deployment.status === expected) step();
    }, ms);
    this.#timers.add(timer);
  }

  #setStatus(deployment: Deployment, status: DeploymentStatus) {
    deployment.status = status;
    deployment.statusUpdatedAt = Date.now();
    this.#emit({ environmentId: deployment.environmentId, deploymentId: deployment.id });
  }

  #emit(change: Change) {
    this.#versions.set(change.environmentId, (this.#versions.get(change.environmentId) ?? 0) + 1);
    for (const listener of this.#listeners) listener(change);
  }
}

import { createRandom } from "./random";
import type { Random } from "./random";
import { isDatastore } from "./store";
import type {
  Deployment,
  DeploymentStatus,
  Environment,
  ServiceInstance,
  Usage,
  User,
  World,
} from "./store";

/**
 * The world the mock starts with and resets to: a few workspaces with many more projects than a real
 * account has, where every overview insight has something to show. The same seed always builds the
 * same IDs, so links into the mock keep working after a reset; times are relative to `now`.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const DEMO_USER: User = { name: "Demo User", email: "demo@example.com", avatar: null };

const NORTHWIND = ["Maya Chen", "Jonas Weber", "Priya Raman", "Sam Okafor", "Demo User"];
const PERSONAL = ["Demo User"];
const OPEN_SOURCE = ["Demo User", "Lena Fischer", "Tomás Ortega"];

const COMMITS = [
  "fix: handle empty cart on checkout",
  "feat: add CSV export to reports",
  "chore: bump dependencies",
  "fix: retry webhooks with backoff",
  "feat: dark mode for the dashboard",
  "perf: cache product lookups",
  "refactor: split billing module",
  "fix: timezone in weekly digest",
  "feat: passkey sign-in",
  "chore: upgrade to Node 24",
  "fix: n+1 query on orders page",
  "feat: rate limit public API",
  "docs: document env vars",
  "fix: race in job scheduler",
  "feat: audit log for admin actions",
  "chore: tidy logging",
  "fix: image upload on Safari",
  "feat: Slack notifications",
  "perf: stream large responses",
  "fix: off-by-one in pagination",
];

const REGIONS = ["us-west2", "us-east4-eqdc4a", "europe-west4-drams3a", "asia-southeast1-eqsg3a"];

/** The variable a service gets for each service it references, by the referenced service's name. */
const REFERENCE_VARIABLES: Record<string, [key: string, value: (name: string) => string]> = {
  postgres: ["DATABASE_URL", (n) => `\${{ ${n}.DATABASE_URL }}`],
  redis: ["REDIS_URL", (n) => `\${{ ${n}.REDIS_URL }}`],
  clickhouse: ["CLICKHOUSE_URL", (n) => `\${{ ${n}.CLICKHOUSE_URL }}`],
};

interface ServiceSpec {
  name: string;
  image?: string;
  repo?: string;
  /** Gets a `*.up.railway.app` domain. */
  public?: boolean;
  /** A custom domain in the primary environment. */
  domain?: string;
  /** Names of services in the project whose variables it reads. */
  refs?: string[];
  usage?: Partial<Usage>;
  cron?: string;
  /** Serverless: sleeps when idle, outside production. */
  sleep?: boolean;
  replicas?: number;
}

interface DeploySpec {
  /** How long ago it was created. */
  ago: number;
  /** Defaults to SUCCESS for the newest and REMOVED (replaced) for the rest. */
  status?: DeploymentStatus;
  commit?: string;
  /** How long ago its status last changed; defaults to shortly after it was created. */
  updatedAgo?: number;
  stuck?: boolean;
}

function createBuilder(random: Random, now: number) {
  const world: World = {
    user: DEMO_USER,
    workspaces: [],
    projects: [],
    environments: [],
    services: [],
    instances: [],
    volumes: [],
    deployments: [],
  };

  const workspace = (name: string, authors: string[]) => {
    const workspaceId = random.uuid();
    world.workspaces.push({ id: workspaceId, name });

    const project = (
      projectName: string,
      environments: (string | { name: string; ephemeral: true })[] = ["production"],
    ) => {
      const projectId = random.uuid();
      const region = random.pick(REGIONS);
      world.projects.push({ id: projectId, workspaceId, name: projectName });
      const envs = new Map<string, Environment>();
      for (const spec of environments) {
        const env: Environment = {
          id: random.uuid(),
          projectId,
          name: typeof spec === "string" ? spec : spec.name,
          isEphemeral: typeof spec !== "string",
        };
        envs.set(env.name, env);
        world.environments.push(env);
      }
      const envNamed = (envName: string) => {
        const env = envs.get(envName);
        if (!env) throw new Error(`No environment ${envName} in ${projectName}`);
        return env;
      };

      const service = (spec: ServiceSpec, inEnvironments = [...envs.keys()]) => {
        const serviceId = random.uuid();
        const image = spec.image ?? null;
        world.services.push({
          id: serviceId,
          projectId,
          name: spec.name,
          image,
          repo: spec.repo ?? null,
        });
        const usage = { ...defaultUsage(random, spec), ...spec.usage };

        for (const envName of inEnvironments) {
          const env = envNamed(envName);
          const primary = env.name === "production";
          const suffix = random.uuid().slice(0, 4);
          const instance: ServiceInstance = {
            serviceId,
            environmentId: env.id,
            region,
            numReplicas: primary ? (spec.replicas ?? 1) : 1,
            sleepApplication: Boolean(spec.sleep) && !primary,
            cronSchedule: spec.cron ?? null,
            serviceDomains: spec.public
              ? [`${spec.name}-${env.name}-${suffix}.up.railway.app`]
              : [],
            customDomains: spec.domain && primary ? [spec.domain] : [],
            variables: Object.fromEntries(
              (spec.refs ?? []).map((ref) => {
                const [key, value] = REFERENCE_VARIABLES[ref] ?? [
                  `${ref.toUpperCase().replaceAll("-", "_")}_URL`,
                  (n: string) => `http://\${{ ${n}.RAILWAY_PRIVATE_DOMAIN }}`,
                ];
                return [key, value(ref)];
              }),
            ),
            usage: primary
              ? usage
              : { ...usage, cpu: usage.cpu * 0.3, memoryGb: usage.memoryGb * 0.6 },
          };
          world.instances.push(instance);
        }

        /** Deploys, oldest first. */
        const deploy = (envName: string, deploys: DeploySpec[]) => {
          const env = envNamed(envName);
          const sleeps = world.instances.find(
            (i) => i.serviceId === serviceId && i.environmentId === env.id,
          )?.sleepApplication;
          deploys.forEach((d, index) => {
            const newest = index === deploys.length - 1;
            const status = d.status ?? (newest ? (sleeps ? "SLEEPING" : "SUCCESS") : "REMOVED");
            const createdAt = now - d.ago;
            const deployment: Deployment = {
              id: random.uuid(),
              projectId,
              serviceId,
              environmentId: env.id,
              status,
              createdAt,
              statusUpdatedAt:
                d.updatedAgo === undefined
                  ? Math.min(now, createdAt + random.int(40, 180) * 1000)
                  : now - d.updatedAgo,
              image,
              commitMessage: spec.repo ? (d.commit ?? random.pick(COMMITS)) : null,
              creator: random.pick(authors),
              succeeded: !["FAILED", "QUEUED", "BUILDING", "DEPLOYING", "INITIALIZING"].includes(
                status,
              ),
              stuck: d.stuck,
            };
            world.deployments.push(deployment);
          });
        };

        /** A few weeks of uneventful deploys, now up (or asleep). */
        const healthy = (envName: string, options: { count?: number; latestAgo?: number } = {}) => {
          const count = options.count ?? random.int(2, 7);
          const latestAgo = options.latestAgo ?? random.int(2, 6 * 24) * HOUR;
          const deploys: DeploySpec[] = [];
          let ago = latestAgo;
          for (let i = 0; i < count; i++) {
            deploys.unshift({ ago });
            // Now and then a deploy failed and the next one fixed it.
            if (i > 0 && random.chance(0.12))
              deploys.unshift({ ago: ago + HOUR, status: "FAILED" });
            ago += random.int(6, 96) * HOUR;
          }
          deploy(envName, deploys);
        };

        /** Healthy in every environment it's in. */
        const healthyEverywhere = () => {
          for (const envName of inEnvironments) healthy(envName);
        };

        return { id: serviceId, deploy, healthy, healthyEverywhere };
      };

      return { id: projectId, service };
    };

    return { project };
  };

  return { world, workspace };
}

function defaultUsage(random: Random, spec: ServiceSpec): Usage {
  const between = (min: number, max: number) => min + random.next() * (max - min);
  if (isDatastore({ name: spec.name, image: spec.image ?? null })) {
    return {
      cpu: between(0.03, 0.12),
      memoryGb: between(0.15, 0.9),
      diskGb: between(0.5, 6),
      egressGbPerMonth: between(0.1, 1),
    };
  }
  return {
    cpu: between(0.02, 0.25),
    memoryGb: between(0.1, 0.6),
    egressGbPerMonth: spec.public ? between(2, 40) : between(0.1, 2),
  };
}

const postgres: ServiceSpec = {
  name: "postgres",
  image: "ghcr.io/railwayapp-templates/postgres-ssl:17",
};
const redis: ServiceSpec = { name: "redis", image: "redis:8.2" };

/** Small, healthy projects that make up the bulk of the list. */
type Stack = (repo: string) => ServiceSpec[];

const STACKS = {
  saas: (repo) => [
    { name: "web", repo, public: true, refs: ["api"] },
    { name: "api", repo, public: true, refs: ["postgres", "redis"], replicas: 2 },
    { name: "worker", repo, refs: ["postgres", "redis"] },
    postgres,
    redis,
  ],
  nextjs: (repo) => [
    { name: "web", repo, public: true, refs: ["postgres"], sleep: true },
    postgres,
  ],
  api: (repo) => [
    { name: "api", repo, public: true, refs: ["postgres"] },
    { name: "cleanup", repo, cron: "0 3 * * *", refs: ["postgres"] },
    postgres,
  ],
  static: (repo) => [{ name: "site", repo, public: true, sleep: true }],
  bot: (repo) => [{ name: "bot", repo, refs: ["postgres"] }, postgres],
  queue: (repo) => [
    { name: "producer", repo, public: true, refs: ["redis"] },
    { name: "consumer", repo, refs: ["redis", "postgres"], replicas: 3 },
    redis,
    postgres,
  ],
} satisfies Record<string, Stack>;

export function seedWorld(options: { now?: number; seed?: number } = {}): World {
  const now = options.now ?? Date.now();
  const random = createRandom(options.seed ?? 42);
  const { world, workspace } = createBuilder(random, now);

  // Northwind: a team with the scenarios the overview's insights are about.
  const northwind = workspace("Northwind", NORTHWIND);

  {
    // Crashed right after a deploy that runs fine on staging; plus an idle PR environment.
    const storefront = northwind.project("storefront", [
      "production",
      "staging",
      { name: "pr-482-new-checkout", ephemeral: true },
    ]);
    const repo = "northwind/storefront";
    const change = "feat: move checkout to Stripe Payment Intents";
    const web = storefront.service({
      name: "web",
      repo,
      public: true,
      domain: "shop.northwind.dev",
      refs: ["api"],
      replicas: 2,
    });
    const api = storefront.service({
      name: "api",
      repo,
      public: true,
      domain: "api.northwind.dev",
      refs: ["postgres", "redis"],
      replicas: 2,
    });
    const worker = storefront.service({ name: "worker", repo, refs: ["postgres", "redis"] }, [
      "production",
      "staging",
    ]);
    const db = storefront.service(postgres, ["production", "staging"]);
    const cache = storefront.service(redis, ["production", "staging"]);

    api.deploy("production", [
      { ago: 9 * DAY },
      { ago: 4 * DAY, commit: "fix: idempotency keys on refunds" },
      { ago: 12 * MINUTE, status: "CRASHED", commit: change, updatedAgo: 10 * MINUTE },
    ]);
    api.deploy("staging", [{ ago: 5 * DAY }, { ago: 3 * HOUR, commit: change }]);
    web.healthy("production", { latestAgo: 2 * DAY });
    web.healthy("staging", { latestAgo: 3 * HOUR });
    for (const service of [worker, db, cache]) service.healthyEverywhere();
    web.deploy("pr-482-new-checkout", [{ ago: 4 * DAY, status: "SLEEPING", commit: change }]);
    api.deploy("pr-482-new-checkout", [
      { ago: 4 * DAY, commit: change },
      { ago: 4 * DAY - HOUR, status: "REMOVED", commit: change },
    ]);
  }

  {
    // The same change failing three times in a row.
    const billing = northwind.project("billing", ["production", "staging"]);
    const repo = "northwind/billing";
    const change = "chore: upgrade prisma to v6";
    billing.service({ name: "api", repo, public: true, refs: ["postgres"] }).healthyEverywhere();
    const worker = billing.service({ name: "invoice-worker", repo, refs: ["postgres", "redis"] });
    worker.deploy("production", [
      { ago: 12 * DAY },
      { ago: 5 * DAY, status: "SUCCESS", commit: "feat: dunning emails" },
      { ago: 2 * HOUR, status: "FAILED", commit: change },
      { ago: 50 * MINUTE, status: "FAILED", commit: change },
      { ago: 25 * MINUTE, status: "FAILED", commit: change },
    ]);
    worker.healthy("staging");
    billing.service(postgres).healthyEverywhere();
    billing.service(redis).healthyEverywhere();
  }

  {
    // Crashed days after its last deploy: restarting is the fix.
    const analytics = northwind.project("analytics");
    const repo = "northwind/analytics";
    analytics
      .service({ name: "ingest", repo, public: true, refs: ["clickhouse"], replicas: 2 })
      .deploy("production", [
        { ago: 8 * DAY },
        { ago: 3 * DAY, status: "CRASHED", updatedAgo: 40 * MINUTE },
      ]);
    analytics
      .service({ name: "dashboard", repo, public: true, refs: ["clickhouse", "ingest"] })
      .healthyEverywhere();
    analytics
      .service({
        name: "clickhouse",
        image: "clickhouse/clickhouse-server:25.8",
        usage: { cpu: 0.4, memoryGb: 2.4, diskGb: 40 },
      })
      .healthyEverywhere();
  }

  {
    // A deploy that has been going for far too long.
    const docs = northwind.project("docs");
    docs
      .service({ name: "web", repo: "northwind/docs", public: true, domain: "docs.northwind.dev" })
      .deploy("production", [
        { ago: 6 * DAY },
        { ago: 2 * DAY, status: "SUCCESS" },
        {
          ago: 38 * MINUTE,
          status: "BUILDING",
          stuck: true,
          commit: "docs: regenerate API reference",
        },
      ]);
    docs.service({ name: "search", image: "getmeili/meilisearch:v1.16" }).healthyEverywhere();
  }

  {
    // Housekeeping: added and never deployed, and switched off weeks ago.
    const tools = northwind.project("internal-tools");
    tools
      .service({ name: "admin", repo: "northwind/admin", public: true, refs: ["postgres"] })
      .healthyEverywhere();
    tools.service({ name: "metabase", image: "metabase/metabase:v0.56", public: true });
    tools
      .service({ name: "legacy-sync", repo: "northwind/legacy-sync", refs: ["postgres"] })
      .deploy("production", [{ ago: 40 * DAY }, { ago: 23 * DAY, status: "REMOVED" }]);
    tools.service(postgres).healthyEverywhere();
  }

  {
    // One failed deploy; the previous one is still up.
    const marketing = northwind.project("marketing-site");
    marketing
      .service({ name: "web", repo: "northwind/marketing", public: true, domain: "northwind.dev" })
      .deploy("production", [
        { ago: 10 * DAY },
        { ago: 3 * DAY, status: "SUCCESS" },
        { ago: 2 * HOUR, status: "FAILED", commit: "feat: new pricing page" },
      ]);
  }

  {
    // Busier than usual for the last few hours.
    const search = northwind.project("search", ["production", "staging"]);
    search
      .service({
        name: "meilisearch",
        image: "getmeili/meilisearch:v1.16",
        usage: { cpu: 0.6, memoryGb: 1.8, diskGb: 12, spike: 3.5 },
      })
      .healthyEverywhere();
    search
      .service({ name: "indexer", repo: "northwind/search", refs: ["meilisearch", "postgres"] })
      .healthyEverywhere();
    search.service(postgres).healthyEverywhere();
  }

  {
    // Deploys in flight that finish a few seconds after the mock starts or resets.
    const mobile = northwind.project("mobile-api", ["production", "staging"]);
    const repo = "northwind/mobile-api";
    const change = "feat: push notification preferences";
    const api = mobile.service({ name: "api", repo, public: true, refs: ["postgres", "redis"] });
    api.deploy("production", [
      { ago: 3 * DAY, status: "SUCCESS" },
      { ago: 20_000, status: "BUILDING", commit: change },
    ]);
    api.deploy("staging", [
      { ago: DAY, status: "SUCCESS" },
      { ago: 5_000, status: "DEPLOYING", commit: change },
    ]);
    mobile.service(postgres).healthyEverywhere();
    mobile.service(redis).healthyEverywhere();
  }

  const stacks: [name: string, stack: keyof typeof STACKS, environments?: string[]][] = [
    ["customer-portal", "saas", ["production", "staging"]],
    ["auth", "api", ["production", "staging"]],
    ["notifications", "queue", ["production", "staging"]],
    ["feature-flags", "api"],
    ["status-page", "static"],
    ["image-resizer", "queue"],
    ["warehouse-sync", "api", ["production", "staging"]],
    ["partner-portal", "nextjs", ["production", "staging"]],
    ["email", "queue"],
    ["admin-dashboard", "nextjs"],
  ];
  addStacks(northwind, "northwind", stacks);

  // A personal workspace with the usual self-hosted things.
  const personal = workspace("Demo User's Projects", PERSONAL);
  addStacks(personal, "demo-user", [
    ["portfolio", "static"],
    ["discord-bot", "bot"],
    ["recipes", "nextjs"],
  ]);
  const n8n = personal.project("n8n");
  n8n
    .service({ name: "n8n", image: "n8nio/n8n:1.112.0", public: true, refs: ["postgres"] })
    .healthyEverywhere();
  n8n.service(postgres).healthyEverywhere();
  const umami = personal.project("umami");
  umami
    .service({
      name: "umami",
      image: "ghcr.io/umami-software/umami:postgresql-latest",
      public: true,
      refs: ["postgres"],
    })
    .healthyEverywhere();
  umami.service(postgres).healthyEverywhere();
  const kuma = personal.project("uptime-kuma");
  kuma
    .service({ name: "uptime-kuma", image: "louislam/uptime-kuma:2", public: true })
    .healthyEverywhere();

  // Open source: a small team, mostly preview-heavy.
  const openSource = workspace("Open Source", OPEN_SOURCE);
  addStacks(openSource, "oss", [
    ["bookmarks", "saas", ["production", "staging"]],
    ["rss-reader", "bot"],
    ["pastebin", "api"],
    ["link-shortener", "nextjs", ["production", "staging"]],
    ["chess-engine", "queue"],
  ]);

  addVolumes(world, random);
  return world;
}

/** Where each kind of datastore keeps its data, as Railway's templates mount it. */
const DATA_DIRECTORIES: [image: RegExp, mountPath: string][] = [
  [/postgres/, "/var/lib/postgresql/data"],
  [/redis/, "/data"],
  [/clickhouse/, "/var/lib/clickhouse"],
];

/**
 * Gives every datastore a volume for its data in each of its environments, as it has on Railway.
 * Added last, so the IDs drawn for everything else stay the same.
 */
function addVolumes(world: World, random: Random) {
  for (const instance of world.instances) {
    const service = world.services.find((s) => s.id === instance.serviceId);
    const mountPath = DATA_DIRECTORIES.find(([image]) => image.test(service?.image ?? ""))?.[1];
    if (!service || !mountPath) continue;
    world.volumes.push({
      id: random.uuid(),
      projectId: service.projectId,
      serviceId: service.id,
      environmentId: instance.environmentId,
      name: `${service.name}-volume`,
      mountPath,
    });
  }
}

function addStacks(
  workspace: ReturnType<ReturnType<typeof createBuilder>["workspace"]>,
  org: string,
  stacks: [name: string, stack: keyof typeof STACKS, environments?: string[]][],
) {
  for (const [name, stack, environments] of stacks) {
    const project = workspace.project(name, environments);
    for (const spec of STACKS[stack](`${org}/${name}`)) {
      project.service(spec).healthyEverywhere();
    }
  }
}

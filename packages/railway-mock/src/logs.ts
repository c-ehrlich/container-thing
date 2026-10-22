import { createRandom, hashString } from "./random";
import { isDatastore } from "./store";
import type { Deployment, MockStore, Service } from "./store";

/**
 * Build and runtime logs, made up per deployment. Runtime lines fall on a fixed schedule from the
 * deployment's start, so asking again returns the same lines plus any newer ones, and a stream can
 * send just the lines whose time has come.
 */

export interface LogLine {
  timestamp: string;
  severity: "info" | "warn" | "error";
  message: string;
  attributes: [];
  tags: null;
}

const line = (at: number, message: string, severity: LogLine["severity"] = "info"): LogLine => ({
  timestamp: new Date(at).toISOString(),
  severity,
  message,
  attributes: [],
  tags: null,
});

type Kind = "datastore" | "web" | "worker";

function kindOf(store: MockStore, deployment: Deployment): Kind {
  const service = store.service(deployment.serviceId);
  if (isDatastore(service)) return "datastore";
  const instance = store.instance(deployment.serviceId, deployment.environmentId);
  return instance.serviceDomains.length + instance.customDomains.length > 0 ? "web" : "worker";
}

/** Seconds between runtime lines. */
const PERIOD: Record<Kind, number> = { datastore: 90, web: 3, worker: 8 };

const PATHS = [
  "/",
  "/api/orders",
  "/api/products",
  "/api/session",
  "/health",
  "/api/search",
  "/assets/app.js",
];
const JOBS = [
  "send-email",
  "sync-inventory",
  "generate-invoice",
  "resize-image",
  "webhook-delivery",
];

function runtimeMessage(kind: Kind, service: Service, key: number): [string, LogLine["severity"]] {
  const random = createRandom(key);
  if (kind === "datastore") {
    return /redis|valkey/.test(service.image ?? service.name)
      ? [`1:M ${random.int(1, 9_999)} changes in 60 seconds. Saving...`, "info"]
      : [`LOG:  checkpoint complete: wrote ${random.int(3, 400)} buffers`, "info"];
  }
  if (kind === "worker") {
    const job = random.pick(JOBS);
    return random.chance(0.04)
      ? [`Job ${job}#${random.int(1_000, 99_999)} failed, retrying in 30s`, "warn"]
      : [`Processed ${job}#${random.int(1_000, 99_999)} in ${random.int(8, 900)}ms`, "info"];
  }
  const status = random.chance(0.03) ? 500 : random.chance(0.05) ? 404 : 200;
  const method = random.chance(0.8) ? "GET" : "POST";
  return [
    `${method} ${random.pick(PATHS)} ${status} ${random.int(2, 400)}ms`,
    status === 500 ? "error" : "info",
  ];
}

function startup(kind: Kind, service: Service): string[] {
  if (kind === "datastore") {
    return /redis|valkey/.test(service.image ?? service.name)
      ? ["1:C Redis is starting", "1:M Server initialized", "1:M Ready to accept connections tcp"]
      : [
          "PostgreSQL Database directory appears to contain a database; Skipping initialization",
          "LOG:  starting PostgreSQL 17 on x86_64-pc-linux-gnu",
          'LOG:  listening on IPv6 address "::", port 5432',
          "LOG:  database system is ready to accept connections",
        ];
  }
  return kind === "web"
    ? ["Starting Container", "> node dist/server.js", "Server listening on http://0.0.0.0:8080"]
    : ["Starting Container", "> node dist/worker.js", "Worker started, concurrency=5"];
}

const CRASH = [
  "Error: connect ECONNREFUSED 10.250.12.4:5432",
  "    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1637:16)",
  "Unhandled error, exiting",
];

/** When the container stopped writing: now while it's up, else when its status last changed. */
function endOf(deployment: Deployment) {
  return deployment.status === "SUCCESS" ? Date.now() : deployment.statusUpdatedAt;
}

/** Runtime lines with an index in `(after, until]`, each `period` after the start, plus some jitter. */
function scheduled(store: MockStore, deployment: Deployment, from: number, to: number) {
  const service = store.service(deployment.serviceId);
  const kind = kindOf(store, deployment);
  const period = PERIOD[kind] * 1000;
  // The container starts once the build is done.
  const start = deployment.createdAt + 15_000;
  const lines: LogLine[] = [];
  for (
    let index = Math.max(1, Math.ceil((from - start) / period));
    start + index * period <= to;
    index++
  ) {
    const key = hashString(`${deployment.id}:${index}`);
    const [message, severity] = runtimeMessage(kind, service, key);
    lines.push(line(start + index * period + (key % 1000), message, severity));
  }
  return { lines, start, kind, service };
}

export function deployLogs(store: MockStore, deploymentId: string, limit: number): LogLine[] {
  const deployment = store.deployment(deploymentId);
  if (deployment.status === "FAILED" || !deployment.succeeded) return [];
  const end = endOf(deployment);
  const period = PERIOD[kindOf(store, deployment)] * 1000;
  const { lines, start, kind, service } = scheduled(store, deployment, end - limit * period, end);
  const head = startup(kind, service).map((m, i) => line(start + i * 400, m));
  const tail =
    deployment.status === "CRASHED"
      ? CRASH.map((m, i) => line(deployment.statusUpdatedAt + i, m, "error"))
      : [];
  return [...head, ...lines, ...tail].slice(-limit);
}

/** Runtime lines written in `(from, to]`, for the live stream. */
export function deployLogsBetween(
  store: MockStore,
  deploymentId: string,
  from: number,
  to: number,
) {
  const deployment = store.deployment(deploymentId);
  if (deployment.status !== "SUCCESS") return [];
  return scheduled(store, deployment, from, to).lines.filter((l) => Date.parse(l.timestamp) > from);
}

export function buildLogs(store: MockStore, deploymentId: string): LogLine[] {
  const deployment = store.deployment(deploymentId);
  const service = store.service(deployment.serviceId);
  const at = (seconds: number) => deployment.createdAt + seconds * 1000;
  const lines = service.repo
    ? [
        line(
          at(1),
          `[Region: ${store.instance(deployment.serviceId, deployment.environmentId).region}]`,
        ),
        line(at(2), "╭─────────────────╮\n│ Railpack 0.9.2 │\n╰─────────────────╯"),
        line(at(3), "↳ Detected Node"),
        line(at(4), "↳ Using npm package manager"),
        line(at(8), "$ npm ci"),
        line(at(22), `added ${200 + (hashString(service.id) % 900)} packages in 14s`),
        line(at(23), "$ npm run build"),
      ]
    : [
        line(at(1), `Pulling image ${deployment.image ?? service.name}`),
        line(at(9), "Image pulled"),
      ];
  if (deployment.status === "FAILED") {
    return [
      ...lines,
      line(
        at(41),
        "src/billing/invoice.ts(48,23): error TS2339: Property 'customer' does not exist on type 'Invoice'.",
        "error",
      ),
      line(
        at(42),
        'Build Failed: process "npm run build" did not complete successfully: exit code: 1',
        "error",
      ),
    ];
  }
  const building = deployment.status === "QUEUED" || deployment.status === "BUILDING";
  if (building) return lines.filter((l) => Date.parse(l.timestamp) <= Date.now());
  return [
    ...lines,
    ...(service.repo ? [line(at(45), "✓ Compiled successfully")] : []),
    line(at(47), "=== Successfully Built! ==="),
  ];
}

import { graphql } from "../../lib/graphql/graphql";
import type { LogLine } from "../project/service";
import { subscribeDocument } from "./transport";
import type { LiveTransport } from "./transport";

/**
 * New runtime log lines of one deployment, pushed as they're written. Railway may resend recent lines
 * when subscribing, so `mergeLogLines` dedupes.
 */
const DeploymentLogsSubscription = graphql(`
  subscription DeploymentLogsStream($deploymentId: String!) {
    deploymentLogs(deploymentId: $deploymentId, limit: 100) {
      timestamp
      severity
      message
    }
  }
`);

/** Calls `onLines` with each batch of runtime log lines Railway pushes, until the returned function is called. */
export function streamDeploymentLogs(
  transport: LiveTransport,
  deploymentId: string,
  onLines: (lines: LogLine[]) => void,
): () => void {
  return subscribeDocument(
    transport,
    DeploymentLogsSubscription,
    { deploymentId },
    { next: ({ deploymentLogs }) => onLines(deploymentLogs), error: () => {} },
  );
}

const lineKey = (line: LogLine) => `${line.timestamp}${line.message}`;

/**
 * `current` with the lines of `incoming` it doesn't have yet, oldest first. Returns `current` itself
 * when nothing is new, so a cache update with it doesn't re-render.
 */
export function mergeLogLines(current: LogLine[], incoming: LogLine[]): LogLine[] {
  const seen = new Set(current.map(lineKey));
  const fresh = incoming.filter((line) => !seen.has(lineKey(line)));
  return fresh.length === 0
    ? current
    : [...current, ...fresh].toSorted((a, b) => a.timestamp.localeCompare(b.timestamp));
}

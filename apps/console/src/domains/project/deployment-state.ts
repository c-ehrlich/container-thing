import type { LatestDeployment } from "./overview";

export type DeploymentState = {
  kind: "running" | "sleeping" | "pending" | "failed" | "stopped";
  label: string;
};

/** What a service's latest deployment means for the user: is it up, idle, on its way, broken or off? */
export function deploymentState(
  deployment: Pick<LatestDeployment, "status"> | null,
): DeploymentState {
  const status = deployment?.status;
  switch (status) {
    case undefined:
    case "REMOVED":
    case "SKIPPED":
      return { kind: "stopped", label: "Stopped" };
    case "SUCCESS":
      return { kind: "running", label: "Running" };
    case "SLEEPING":
      // Railway's Serverless: still deployed, just idle. The next request wakes it.
      return { kind: "sleeping", label: "Sleeping" };
    case "FAILED":
    case "CRASHED":
      return {
        kind: "failed",
        label: status === "FAILED" ? "Failed" : "Crashed",
      };
    case "REMOVING":
      return { kind: "pending", label: "Stopping" };
    case "QUEUED":
    case "WAITING":
    case "NEEDS_APPROVAL":
    case "INITIALIZING":
    case "BUILDING":
    case "DEPLOYING":
      return { kind: "pending", label: "Deploying" };
    default:
      // type error if there are unhandled cases
      status satisfies never;
      // Railway can add statuses before the schema is regenerated; treat them as in progress.
      return { kind: "pending", label: "Deploying" };
  }
}

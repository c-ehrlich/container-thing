import type { Deployment } from "./project";

export type DeploymentState = {
  kind: "running" | "sleeping" | "pending" | "failed" | "stopped";
  label: string;
};

/** What a service's latest deployment means for the user: is it up, idle, on its way, broken or off? */
export function deploymentState(deployment: Deployment | null): DeploymentState {
  switch (deployment?.status) {
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
        label: deployment.status === "FAILED" ? "Failed" : "Crashed",
      };
    case "REMOVING":
      return { kind: "pending", label: "Stopping" };
    default:
      // QUEUED, WAITING, NEEDS_APPROVAL, INITIALIZING, BUILDING, DEPLOYING
      return { kind: "pending", label: "Deploying" };
  }
}

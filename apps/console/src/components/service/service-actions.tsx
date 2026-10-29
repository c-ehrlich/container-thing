import { PlayIcon, RotateCcwIcon, RotateCwIcon, SquareIcon, XIcon } from "lucide-react";

import { deploymentState } from "../../domains/project/deployment-state";
import type { LatestDeployment } from "../../domains/project/project";
import { ActionButton } from "../action-button";

type Target = {
  projectId: string;
  serviceId: string;
  serviceName: string;
  environmentId: string;
  environmentName: string;
  deployment: LatestDeployment | null;
};

/**
 * What can be done to a service right now, in the order people reach for them: restart what's
 * there, deploy again, stop it. Only the ones that make sense for its current state show.
 */
export function ServiceActions(props: Target) {
  const { projectId, serviceId, environmentId, deployment } = props;
  const kind = deploymentState(deployment).kind;
  // A container exists to restart or stop: running, asleep, or crashed (failed builds have none).
  const hasContainer =
    deployment?.status === "SUCCESS" ||
    deployment?.status === "SLEEPING" ||
    deployment?.status === "CRASHED";
  const deploy = { kind: "deploy", serviceId, environmentId } as const;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {deployment && hasContainer && (
        <ActionButton
          projectId={projectId}
          label="Restart"
          icon={<RotateCwIcon data-icon="inline-start" />}
          title="Restarts the current deployment without building again"
          action={{ kind: "restart", deploymentId: deployment.id }}
        />
      )}
      {kind === "stopped" ? (
        <ActionButton
          projectId={projectId}
          label="Start"
          pending="Starting…"
          variant="default"
          icon={<PlayIcon data-icon="inline-start" />}
          action={deploy}
        />
      ) : (
        <ActionButton
          projectId={projectId}
          label="Redeploy"
          icon={<RotateCcwIcon data-icon="inline-start" />}
          title="Deploys the latest source again"
          action={deploy}
        />
      )}
      {deployment && kind === "pending" && (
        <ActionButton
          projectId={projectId}
          label="Cancel deploy"
          icon={<XIcon data-icon="inline-start" />}
          action={{ kind: "cancel", deploymentId: deployment.id }}
        />
      )}
      {deployment && hasContainer && (
        <ActionButton
          projectId={projectId}
          label="Stop"
          variant="ghost"
          icon={<SquareIcon data-icon="inline-start" />}
          title="Removes the running deployment. Start deploys it again."
          action={{ kind: "remove", deploymentId: deployment.id }}
        />
      )}
      <ActionButton
        projectId={projectId}
        label="Remove"
        variant="ghost"
        action={{
          kind: "remove-service",
          serviceId,
          serviceName: props.serviceName,
          environmentId,
          environmentName: props.environmentName,
        }}
      />
    </div>
  );
}

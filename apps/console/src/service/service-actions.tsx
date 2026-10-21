import { Button } from "@repo/ui/primitives/button";
import { Spinner } from "@repo/ui/primitives/spinner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PlayIcon, RotateCcwIcon, RotateCwIcon, SquareIcon, XIcon } from "lucide-react";

import { InsightActionButton } from "../overview/insight-action";
import { deploymentState } from "../railway/deployment-state";
import type { Deployment } from "../railway/project";
import {
  cancelDeploymentFn,
  deployServiceFn,
  projectQuery,
  removeDeploymentFn,
  restartDeploymentFn,
} from "../railway/project";

type Target = {
  projectId: string;
  serviceId: string;
  serviceName: string;
  environmentId: string;
  environmentName: string;
  deployment: Deployment | null;
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
  const deploy = () => deployServiceFn({ data: { serviceId, environmentId } });

  return (
    <div className="flex flex-wrap items-center gap-2">
      {deployment && hasContainer && (
        <ActionButton
          projectId={projectId}
          label="Restart"
          pending="Restarting…"
          icon={<RotateCwIcon data-icon="inline-start" />}
          title="Restarts the current deployment without building again"
          run={() => restartDeploymentFn({ data: { deploymentId: deployment.id } })}
        />
      )}
      {kind === "stopped" ? (
        <ActionButton
          projectId={projectId}
          label="Start"
          pending="Starting…"
          variant="default"
          icon={<PlayIcon data-icon="inline-start" />}
          run={deploy}
        />
      ) : (
        <ActionButton
          projectId={projectId}
          label="Redeploy"
          pending="Deploying…"
          icon={<RotateCcwIcon data-icon="inline-start" />}
          title="Deploys the latest source again"
          run={deploy}
        />
      )}
      {deployment && kind === "pending" && (
        <ActionButton
          projectId={projectId}
          label="Cancel deploy"
          pending="Cancelling…"
          icon={<XIcon data-icon="inline-start" />}
          run={() => cancelDeploymentFn({ data: { deploymentId: deployment.id } })}
        />
      )}
      {deployment && hasContainer && (
        <ActionButton
          projectId={projectId}
          label="Stop"
          pending="Stopping…"
          icon={<SquareIcon data-icon="inline-start" />}
          title="Removes the running deployment. Start deploys it again."
          run={() => removeDeploymentFn({ data: { deploymentId: deployment.id } })}
        />
      )}
      <InsightActionButton
        projectId={projectId}
        variant="ghost"
        action={{
          kind: "remove-service",
          label: "Remove",
          serviceId,
          serviceName: props.serviceName,
          environmentId,
          environmentName: props.environmentName,
        }}
      />
    </div>
  );
}

/**
 * A button for one Railway call. Afterwards the project is refetched everywhere it's shown: the
 * overview, project and service queries all live under `projectQuery`'s key.
 */
export function ActionButton(props: {
  projectId: string;
  label: string;
  pending: string;
  run: () => Promise<unknown>;
  icon?: React.ReactNode;
  title?: string;
  variant?: "default" | "outline" | "ghost";
}) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: props.run,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: projectQuery(props.projectId).queryKey }),
  });

  return (
    <Button
      size="sm"
      variant={mutation.isError ? "destructive" : (props.variant ?? "outline")}
      disabled={mutation.isPending}
      title={mutation.error?.message ?? props.title}
      onClick={() => mutation.mutate()}
    >
      {mutation.isPending ? <Spinner data-icon="inline-start" /> : props.icon}
      {mutation.isPending ? props.pending : mutation.isError ? "Try again" : props.label}
    </Button>
  );
}

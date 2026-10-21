import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@repo/ui/primitives/alert-dialog";
import { Button, buttonVariants } from "@repo/ui/primitives/button";
import { Spinner } from "@repo/ui/primitives/spinner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowUpRightIcon, CheckIcon } from "lucide-react";
import { useState } from "react";

import {
  cancelDeploymentFn,
  deployServiceFn,
  projectQuery,
  removeServiceFn,
  restartDeploymentFn,
  rollbackDeploymentFn,
} from "../railway/project";
import type { InsightAction } from "./insights";

type Props = {
  action: InsightAction;
  projectId: string;
  variant: "default" | "outline" | "ghost";
};

/** An insight's button: runs the Railway call it names, or links to where the rest happens. */
export function InsightActionButton(props: Props) {
  const { action, variant } = props;
  const size = "sm";

  if (action.kind === "railway") {
    return (
      <a
        href={action.href}
        target="_blank"
        rel="noreferrer"
        className={buttonVariants({ variant, size })}
      >
        {action.label}
        <ArrowUpRightIcon data-icon="inline-end" />
      </a>
    );
  }
  if (action.kind === "open-project") {
    return (
      <Link
        to="/projects/$projectId"
        params={{ projectId: action.projectId }}
        search={{ environmentId: action.environmentId }}
        className={buttonVariants({ variant, size })}
      >
        {action.label}
      </Link>
    );
  }
  if (action.kind === "remove-service") {
    return <RemoveServiceButton {...props} action={action} />;
  }
  return <MutationButton {...props} action={action} />;
}

/** Refetches the project everywhere it's shown (overview and project page share its key). */
function useRefreshProject(projectId: string) {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: projectQuery(projectId).queryKey });
}

type MutationAction = Extract<
  InsightAction,
  { kind: "restart" | "rollback" | "cancel" | "deploy" }
>;

const PENDING: Record<MutationAction["kind"], string> = {
  restart: "Restarting…",
  rollback: "Rolling back…",
  cancel: "Cancelling…",
  deploy: "Deploying…",
};

async function run(action: MutationAction): Promise<void> {
  if (action.kind === "deploy") {
    await deployServiceFn({
      data: { serviceId: action.serviceId, environmentId: action.environmentId },
    });
    return;
  }
  const call = {
    restart: restartDeploymentFn,
    rollback: rollbackDeploymentFn,
    cancel: cancelDeploymentFn,
  }[action.kind];
  await call({ data: { deploymentId: action.deploymentId } });
}

function MutationButton(props: Props & { action: MutationAction }) {
  const { action, projectId } = props;
  const mutation = useMutation({
    mutationFn: () => run(action),
    // The refetch sees the new deploy as in flight, which keeps the overview polling until it lands.
    onSuccess: useRefreshProject(projectId),
  });

  return (
    <Button
      size="sm"
      variant={mutation.isError ? "destructive" : props.variant}
      disabled={mutation.isPending || mutation.isSuccess}
      title={mutation.error?.message}
      onClick={() => mutation.mutate()}
    >
      {mutation.isPending && <Spinner data-icon="inline-start" />}
      {mutation.isSuccess && <CheckIcon data-icon="inline-start" />}
      {mutation.isPending ? PENDING[action.kind] : mutation.isError ? "Try again" : action.label}
    </Button>
  );
}

/** Deleting can't be undone, so it asks first and says exactly what goes. */
function RemoveServiceButton(
  props: Props & { action: Extract<InsightAction, { kind: "remove-service" }> },
) {
  const { action, projectId } = props;
  const [open, setOpen] = useState(false);
  const mutation = useMutation({
    mutationFn: () =>
      removeServiceFn({
        data: { serviceId: action.serviceId, environmentId: action.environmentId },
      }),
    onSuccess: useRefreshProject(projectId),
  });

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={
          <Button
            size="sm"
            variant={mutation.isError ? "destructive" : props.variant}
            disabled={mutation.isPending || mutation.isSuccess}
            title={mutation.error?.message}
          />
        }
      >
        {mutation.isPending && <Spinner data-icon="inline-start" />}
        {mutation.isPending ? "Removing…" : mutation.isError ? "Try again" : action.label}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Remove {action.serviceName} from {action.environmentName}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Its settings and variables in {action.environmentName} are deleted. Other environments
            keep theirs. This can't be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => {
              setOpen(false);
              mutation.mutate();
            }}
          >
            Remove
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

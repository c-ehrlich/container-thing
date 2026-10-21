import { cn } from "@repo/ui/lib/utils";
import { buttonVariants } from "@repo/ui/primitives/button";
import { Link } from "@tanstack/react-router";
import { ArrowUpRightIcon } from "lucide-react";

import { ActionButton } from "../railway/action-button";
import { deployServiceFn, deploymentActionFn, removeServiceFn } from "../railway/project";
import type { Insight, InsightAction } from "./insights";

type Props = {
  action: InsightAction;
  projectId: string;
  variant: "default" | "outline" | "ghost";
};

/** An insight's fix, and the next thing to try if it has one. */
export function InsightButtons(props: { insight: Insight; className?: string }) {
  const { insight } = props;
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", props.className)}>
      <InsightActionButton
        action={insight.primary}
        projectId={insight.project.id}
        variant={insight.severity === "critical" ? "default" : "outline"}
      />
      {insight.secondary && (
        <InsightActionButton
          action={insight.secondary}
          projectId={insight.project.id}
          variant="ghost"
        />
      )}
    </div>
  );
}

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
    // Deleting can't be undone, so it asks first and says exactly what goes.
    return (
      <ActionButton
        projectId={props.projectId}
        label={action.label}
        pending="Removing…"
        variant={variant}
        run={() =>
          removeServiceFn({
            data: { serviceId: action.serviceId, environmentId: action.environmentId },
          })
        }
        confirm={{
          title: `Remove ${action.serviceName} from ${action.environmentName}?`,
          description: `Its settings and variables in ${action.environmentName} are deleted. Other environments keep theirs. This can't be undone.`,
          action: "Remove",
        }}
      />
    );
  }
  return (
    <ActionButton
      projectId={props.projectId}
      label={action.label}
      pending={PENDING[action.kind]}
      variant={variant}
      run={() => run(action)}
    />
  );
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

/** The refetch afterwards sees the new deploy as in flight, which keeps the overview polling until it lands. */
function run(action: MutationAction) {
  return action.kind === "deploy"
    ? deployServiceFn({
        data: { serviceId: action.serviceId, environmentId: action.environmentId },
      })
    : deploymentActionFn({ data: { deploymentId: action.deploymentId, action: action.kind } });
}

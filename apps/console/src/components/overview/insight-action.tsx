import { cn } from "@repo/ui/lib/utils";
import { buttonVariants } from "@repo/ui/primitives/button";
import { Link } from "@tanstack/react-router";
import { ArrowUpRightIcon } from "lucide-react";

import type { Insight, InsightAction } from "../../domains/insights/insights";
import { ActionButton } from "../action-button";

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
  return (
    <ActionButton
      projectId={props.projectId}
      action={action}
      label={action.label}
      variant={variant}
    />
  );
}

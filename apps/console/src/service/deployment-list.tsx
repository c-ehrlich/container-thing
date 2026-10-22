import { cn } from "@repo/ui/lib/utils";
import { HistoryIcon } from "lucide-react";

import { timeAgo } from "../overview/health";
import { ActionButton } from "../railway/action-button";
import { deploymentActionFn } from "../railway/project";
import type { ServiceDeployment } from "../railway/service";
import { ServiceStatusBadge } from "../railway/service-status-badge";

/**
 * The service's deploys, newest first. Clicking one shows its logs; older ones Railway can still
 * go back to get a "Roll back" button.
 */
export function DeploymentList(props: {
  projectId: string;
  deployments: ServiceDeployment[];
  currentId: string | undefined;
  selectedId: string | undefined;
  onSelect: (deploymentId: string) => void;
}) {
  const { deployments } = props;
  if (deployments.length === 0) {
    return <p className="text-sm text-muted-foreground">No deploys yet.</p>;
  }
  return (
    <ol className="grid gap-1">
      {deployments.map((deployment) => {
        const current = deployment.id === props.currentId;
        return (
          <li
            key={deployment.id}
            className={cn(
              "relative isolate grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-lg px-3 py-2.5 hover:bg-muted/40",
              deployment.id === props.selectedId && "bg-muted/60 hover:bg-muted/60",
            )}
          >
            <button
              type="button"
              onClick={() => props.onSelect(deployment.id)}
              aria-pressed={deployment.id === props.selectedId}
              className="grid min-w-0 gap-1 text-left outline-none after:absolute after:inset-0 after:rounded-lg focus-visible:after:ring-2 focus-visible:after:ring-ring"
            >
              <span className="truncate text-sm">
                {deployment.commitMessage ??
                  (deployment.image ? (
                    <span className="font-mono text-xs">{deployment.image}</span>
                  ) : (
                    "Deploy"
                  ))}
              </span>
              <span className="text-xs text-muted-foreground">
                {deployment.creator ? `${deployment.creator} · ` : ""}
                {timeAgo(deployment.createdAt)} ago
              </span>
            </button>
            <div className="relative z-10 flex items-center gap-2">
              {current && <span className="text-xs text-muted-foreground">Current</span>}
              {/* Replaced deploys end up REMOVED; "Stopped" would suggest someone stopped them. */}
              {!current && deployment.status === "REMOVED" ? (
                <span className="text-xs text-muted-foreground">Removed</span>
              ) : (
                <ServiceStatusBadge deployment={deployment} />
              )}
              {!current && deployment.canRollback && (
                <ActionButton
                  projectId={props.projectId}
                  label="Roll back"
                  pending="Rolling back…"
                  variant="ghost"
                  icon={<HistoryIcon data-icon="inline-start" />}
                  title="Deploys this version again, replacing what's running"
                  run={() =>
                    deploymentActionFn({
                      data: { deploymentId: deployment.id, action: "rollback" },
                    })
                  }
                />
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

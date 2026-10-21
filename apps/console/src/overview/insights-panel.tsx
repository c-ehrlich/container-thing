import { cn } from "@repo/ui/lib/utils";
import {
  CircleAlertIcon,
  CircleCheckIcon,
  CircleXIcon,
  InfoIcon,
  LightbulbIcon,
} from "lucide-react";

import { InsightActionButton } from "./insight-action";
import type { Insight } from "./insights";
import { DismissButton } from "./needs-you-card";

const GROUPS: { severity: Insight["severity"]; label: string }[] = [
  { severity: "warning", label: "Worth a look" },
  { severity: "info", label: "Good to know" },
];

const ICON = {
  critical: { icon: CircleXIcon, className: "text-destructive" },
  warning: { icon: CircleAlertIcon, className: "text-warning" },
  info: { icon: InfoIcon, className: "text-muted-foreground" },
} satisfies Record<Insight["severity"], { icon: typeof InfoIcon; className: string }>;

/** The side rail: insights that aren't outages (stuck deploys, CPU spikes, idle environments). */
export function InsightsPanel(props: {
  insights: Insight[];
  onDismiss: (insight: Insight) => void;
  footer?: React.ReactNode;
  className?: string;
}) {
  const { insights } = props;
  return (
    <aside className={cn("grid content-start gap-5", props.className)}>
      <header className="flex items-center gap-2">
        <LightbulbIcon className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-medium">Insights</h2>
        {insights.length > 0 && (
          <span className="text-xs text-muted-foreground tabular-nums">{insights.length}</span>
        )}
      </header>

      {insights.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <CircleCheckIcon className="size-4 text-success" />
          Nothing else to look at.
        </p>
      ) : (
        GROUPS.map(({ severity, label }) => {
          const items = insights.filter((i) => i.severity === severity);
          if (items.length === 0) return null;
          return (
            <section key={severity} className="grid gap-2">
              <h3 className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                {label}
              </h3>
              {items.map((insight) => (
                <InsightItem
                  key={insight.key}
                  insight={insight}
                  onDismiss={() => props.onDismiss(insight)}
                />
              ))}
            </section>
          );
        })
      )}
      {props.footer}
    </aside>
  );
}

/** One insight as a compact card: what, where, why, and its buttons. */
export function InsightItem(props: { insight: Insight; onDismiss: () => void }) {
  const { insight } = props;
  const { icon: Icon, className } = ICON[insight.severity];
  return (
    <article
      className={cn(
        "relative grid gap-2 rounded-xl border bg-card/60 p-3",
        insight.severity === "critical" && "border-destructive/30 bg-destructive/5",
      )}
    >
      <div className="flex gap-2.5">
        <Icon className={cn("mt-0.5 size-4 shrink-0", className)} />
        <div className="grid min-w-0 gap-1">
          <p className="pr-6 text-sm leading-snug font-medium text-pretty">{insight.headline}</p>
          <p className="text-xs text-muted-foreground">
            {insight.project.name}
            {insight.service && ` / ${insight.service.environment.name}`}
          </p>
          <p className="text-xs leading-relaxed text-pretty text-muted-foreground">
            {insight.evidence}
            {insight.impact && insight.impact.dependents.length > 0 && ` ${insight.impact.text}`}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 pl-6.5">
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
      <DismissButton onDismiss={props.onDismiss} className="top-2 right-2" />
    </article>
  );
}

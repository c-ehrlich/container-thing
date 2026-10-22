import { cn } from "@repo/ui/lib/utils";

import type { ProjectUsage } from "../../domains/project/overview";

/** "≈ $4.20/mo", once Railway has estimated the month. */
export function MonthlyCost(props: { usage?: ProjectUsage; className?: string }) {
  const usd = props.usage?.estimatedMonthlyUsd;
  if (usd === undefined) return null;
  return (
    <span
      className={cn("tabular-nums", props.className)}
      title="This month's usage so far, projected to the end of the month at Railway's list prices. Plan credits aren't included."
    >
      ≈ ${usd.toFixed(usd < 10 ? 2 : 0)}
      <span className="text-muted-foreground">/mo</span>
    </span>
  );
}

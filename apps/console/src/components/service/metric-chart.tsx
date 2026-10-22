import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@repo/ui/primitives/chart";
import type { ChartConfig } from "@repo/ui/primitives/chart";
import { Area, AreaChart, XAxis, YAxis } from "recharts";

/** One metric over the last day: the current value, the plan's limit, and a small area chart. */
export function MetricChart(props: {
  label: string;
  samples: { at: number; value: number }[];
  limit: number | null;
  format: (value: number) => string;
  color: string;
}) {
  const { samples, format } = props;
  const latest = samples.at(-1)?.value;
  const config = { value: { label: props.label, color: props.color } } satisfies ChartConfig;

  return (
    <section className="grid gap-3 rounded-xl border bg-card p-4">
      <header className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm text-muted-foreground">{props.label}</h3>
        <p className="text-sm tabular-nums">
          {latest === undefined ? (
            <span className="text-muted-foreground">No samples</span>
          ) : (
            <>
              <span className="text-base font-medium">{format(latest)}</span>
              {props.limit !== null && (
                <span className="text-muted-foreground"> of {format(props.limit)}</span>
              )}
            </>
          )}
        </p>
      </header>
      {samples.length < 2 ? (
        <p className="grid h-32 place-items-center text-sm text-muted-foreground">
          No samples in the last day: the service isn't running.
        </p>
      ) : (
        <ChartContainer config={config} className="aspect-auto h-32 w-full">
          <AreaChart data={samples} margin={{ left: 0, right: 0, top: 4, bottom: 0 }}>
            <defs>
              <linearGradient id={`fill-${props.label}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-value)" stopOpacity={0.4} />
                <stop offset="95%" stopColor="var(--color-value)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="at"
              type="number"
              scale="time"
              domain={["dataMin", "dataMax"]}
              tickLine={false}
              axisLine={false}
              minTickGap={48}
              tickFormatter={(at: number) =>
                new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
              }
            />
            <YAxis hide domain={[0, "auto"]} />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(_, payload) => {
                    const at: unknown = payload[0]?.payload?.at;
                    return typeof at === "number"
                      ? new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                      : "";
                  }}
                  formatter={(value) => (typeof value === "number" ? format(value) : String(value))}
                />
              }
            />
            <Area
              dataKey="value"
              type="monotone"
              stroke="var(--color-value)"
              strokeWidth={1.5}
              fill={`url(#fill-${props.label})`}
              isAnimationActive={false}
            />
          </AreaChart>
        </ChartContainer>
      )}
    </section>
  );
}

export { formatCpu, formatMemory } from "../overview/sparkline";

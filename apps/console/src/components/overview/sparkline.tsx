import { cn } from "@repo/ui/lib/utils";

/** A tiny line chart stretched to its box; tint it with a text color class. */
export function Sparkline(props: { values: number[]; className?: string }) {
  const { values } = props;
  if (values.length < 2) return null;
  const max = Math.max(...values, 0.0001);
  const points = values
    .map((v, i) => `${(i / (values.length - 1)) * 100},${30 - (v / max) * 28}`)
    .join(" ");
  return (
    <svg
      viewBox="0 0 100 30"
      preserveAspectRatio="none"
      className={cn("h-6 w-20 overflow-visible", props.className)}
      aria-hidden
    >
      <polygon points={`0,30 ${points} 100,30`} className="fill-current opacity-15" />
      <polyline
        points={points}
        fill="none"
        className="stroke-current"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** vCPU with as many decimals as small numbers need, so an idle service doesn't read as zero. */
export const formatCpu = (vcpu: number) =>
  `${
    vcpu > 0 && vcpu < 0.001
      ? "<0.001"
      : vcpu < 0.01
        ? vcpu.toFixed(3)
        : vcpu < 1
          ? vcpu.toFixed(2)
          : vcpu.toFixed(1)
  } vCPU`;

/** Memory in MB below a gigabyte, GB above. */
export const formatMemory = (gb: number) =>
  gb < 1 ? `${Math.round(gb * 1000)} MB` : `${gb.toFixed(gb < 10 ? 1 : 0)} GB`;

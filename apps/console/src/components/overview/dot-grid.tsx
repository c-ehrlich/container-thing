import { cn } from "@repo/ui/lib/utils";

/** The dotted backdrop topology diagrams sit on, like a canvas. */
export function DotGrid(props: { className?: string; children?: React.ReactNode }) {
  return (
    <div
      className={cn(props.className)}
      style={{
        backgroundImage:
          "radial-gradient(color-mix(in oklch, var(--muted-foreground) 20%, transparent) 1px, transparent 1px)",
        backgroundSize: "14px 14px",
      }}
    >
      {props.children}
    </div>
  );
}

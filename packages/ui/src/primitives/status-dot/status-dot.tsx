import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";

const statusDotVariants = cva("relative inline-flex size-2 shrink-0 rounded-full", {
  variants: {
    tone: {
      success: "bg-success",
      warning: "bg-warning",
      destructive: "bg-destructive",
      primary: "bg-primary",
      muted: "bg-muted-foreground",
    },
  },
  defaultVariants: {
    tone: "muted",
  },
});

/**
 * A small colored dot for status next to a label. Decorative: the label next to it carries the
 * meaning, so it's hidden from screen readers.
 */
function StatusDot({
  className,
  tone = "muted",
  pulse = false,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof statusDotVariants> & { pulse?: boolean }) {
  return (
    <span
      data-slot="status-dot"
      aria-hidden
      className={cn(statusDotVariants({ tone }), className)}
      {...props}
    >
      {pulse && (
        <span className="absolute inset-0 animate-ping rounded-full bg-inherit opacity-75 motion-reduce:hidden" />
      )}
    </span>
  );
}

export { StatusDot, statusDotVariants };

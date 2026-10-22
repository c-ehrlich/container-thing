import type { Kind } from "../domains/insights/health";

/** A status dot's color for each kind. */
export const KIND_DOT: Record<Kind, string> = {
  running: "bg-success",
  sleeping: "bg-muted-foreground/60",
  pending: "bg-warning",
  failed: "bg-destructive",
  stopped: "bg-muted-foreground/30",
};

/** Status text's color for each kind. */
export const KIND_TEXT: Record<Kind, string> = {
  running: "text-success",
  sleeping: "text-muted-foreground",
  pending: "text-warning",
  failed: "text-destructive",
  stopped: "text-muted-foreground/60",
};

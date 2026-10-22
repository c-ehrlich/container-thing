import { cn } from "@repo/ui/lib/utils";
import { Input } from "@repo/ui/primitives/input";
import { Spinner } from "@repo/ui/primitives/spinner";
import { StatusDot } from "@repo/ui/primitives/status-dot";
import { ToggleGroup, ToggleGroupItem } from "@repo/ui/primitives/toggle-group";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { SearchIcon } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { subscribe } from "../../domains/live/live-client";
import { DeploymentLogsSubscription, logsQuery } from "../../domains/project/service";
import type { LogKind, LogLine } from "../../domains/project/service";

/**
 * One deployment's build or runtime logs. Runtime logs of a deployment that's still up stream in as
 * they're written; everything else is the newest 500 lines Railway keeps. Key it by deployment, so
 * picking another one starts over with the kind of logs that matters for it.
 */
export function LogViewer(props: {
  deploymentId: string;
  /** Whether the deployment has a running container, so new runtime lines can still arrive. */
  live: boolean;
  defaultKind: LogKind;
  /** Shown above the lines, e.g. which deployment these are. */
  caption: React.ReactNode;
}) {
  const { deploymentId } = props;
  const [kind, setKind] = useState<LogKind>(props.defaultKind);
  const [filter, setFilter] = useState("");
  const query = logsQuery(deploymentId, kind);
  const { data: lines = [], isPending, error } = useQuery(query);
  const streaming = props.live && kind === "deploy";
  useStreamLogs(deploymentId, streaming);

  const needle = filter.trim().toLowerCase();
  const shown = needle ? lines.filter((l) => l.message.toLowerCase().includes(needle)) : lines;

  return (
    <section className="grid gap-3">
      <header className="flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-medium">Logs</h2>
        <ToggleGroup
          size="sm"
          variant="outline"
          value={[kind]}
          onValueChange={(value) => value[0] && setKind(value[0] === "build" ? "build" : "deploy")}
        >
          <ToggleGroupItem value="deploy">Deploy</ToggleGroupItem>
          <ToggleGroupItem value="build">Build</ToggleGroupItem>
        </ToggleGroup>
        {streaming && (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <StatusDot tone="success" pulse />
            Live
          </span>
        )}
        <span className="min-w-0 truncate text-xs text-muted-foreground">{props.caption}</span>
        <div className="relative ml-auto w-56">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter lines"
            aria-label="Filter log lines"
            className="h-8 pl-8 text-sm"
          />
        </div>
      </header>
      <LogLines
        lines={shown}
        empty={
          isPending ? (
            <Spinner />
          ) : error ? (
            `Couldn't load logs: ${error.message}`
          ) : needle ? (
            "No lines match."
          ) : (
            `No ${kind} logs for this deployment.`
          )
        }
      />
    </section>
  );
}

const SEVERITY: Record<string, string> = {
  error: "text-destructive",
  warn: "text-warning",
  warning: "text-warning",
};

/** Monospace lines that stay scrolled to the newest, unless the reader scrolled up to read. */
function LogLines(props: { lines: LogLine[]; empty: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);

  // Runs whenever lines arrive, after they're on screen.
  const { lines } = props;
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && pinned.current && lines.length > 0) el.scrollTop = el.scrollHeight;
  }, [lines]);

  return (
    <div
      ref={ref}
      onScroll={(e) => {
        const el = e.currentTarget;
        pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
      }}
      className="h-96 overflow-auto rounded-xl border bg-black/30 p-3 font-mono text-xs leading-relaxed"
    >
      {props.lines.length === 0 ? (
        <div className="grid h-full place-items-center font-sans text-sm text-muted-foreground">
          {props.empty}
        </div>
      ) : (
        props.lines.map((line) => (
          <div
            key={`${line.timestamp}${line.message}`}
            className={cn(
              "grid grid-cols-[auto_minmax(0,1fr)] gap-3",
              SEVERITY[line.severity?.toLowerCase() ?? ""] ?? "text-foreground/85",
            )}
          >
            <time dateTime={line.timestamp} className="text-muted-foreground/70 tabular-nums">
              {formatTime(line.timestamp)}
            </time>
            <span className="break-words whitespace-pre-wrap">{line.message}</span>
          </div>
        ))
      )}
    </div>
  );
}

/** Local time of day, with the date when it isn't today. */
function formatTime(timestamp: string) {
  const date = new Date(timestamp);
  const time = date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  return date.toDateString() === new Date().toDateString()
    ? time
    : `${date.toLocaleDateString([], { month: "short", day: "numeric" })} ${time}`;
}

/**
 * Appends lines pushed by Railway's `deploymentLogs` subscription to the cached logs. Railway can
 * resend recent lines on subscribe, so lines already shown are skipped.
 */
function useStreamLogs(deploymentId: string, enabled: boolean) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!enabled) return undefined;
    const { queryKey } = logsQuery(deploymentId, "deploy");
    return subscribe(
      DeploymentLogsSubscription,
      { deploymentId },
      {
        next: ({ deploymentLogs }) => {
          queryClient.setQueryData(queryKey, (current = []) => {
            const seen = new Set(current.map((l) => `${l.timestamp}${l.message}`));
            const fresh = deploymentLogs.filter((l) => !seen.has(`${l.timestamp}${l.message}`));
            return fresh.length === 0
              ? current
              : [...current, ...fresh].toSorted((a, b) => a.timestamp.localeCompare(b.timestamp));
          });
        },
        error: () => {},
      },
    );
  }, [deploymentId, enabled, queryClient]);
}

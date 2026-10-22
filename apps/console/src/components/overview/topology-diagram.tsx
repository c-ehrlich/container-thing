import { cn } from "@repo/ui/lib/utils";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/primitives/empty";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@repo/ui/primitives/hover-card";
import { useNavigate } from "@tanstack/react-router";
import { BoxIcon, DatabaseIcon } from "lucide-react";

import { isDatastore, servicesOf, timeAgo } from "../../domains/insights/health";
import type { Kind, ServiceWithState } from "../../domains/insights/health";
import type { Environment, Project } from "../../domains/project/project";
import { serviceUsageKey } from "../../domains/project/usage";
import type { ProjectUsage } from "../../domains/project/usage";
import { KIND_TEXT } from "../status-colors";
import { formatCpu, formatMemory } from "./sparkline";

/**
 * A small picture of an environment: services as nodes, wired up by the variables that reference each
 * other (`${{ postgres.DATABASE_URL }}`), callers on the left and what they depend on to the right.
 * Hovering a service shows what it's doing; clicking opens it. The text around the diagram carries
 * the same information for keyboards and screen readers, so the picture itself is hidden from them.
 * An environment without services says so instead.
 */

const WIDTH = 360;
const HEIGHT = 176;
const NODE_HEIGHT = 28;
const ROW_GAP = 44;

type Node = ServiceWithState & { x: number; y: number; width: number; datastore: boolean };

/** The broken service and whatever depends on it. Everything else fades back. */
export type DiagramHighlight = { failed: string; affected: string[] };

export function TopologyDiagram(props: {
  project: Project;
  environment: Environment;
  usage?: ProjectUsage;
  highlight?: DiagramHighlight;
}) {
  const { project, environment, highlight } = props;
  const involved = highlight && new Set([highlight.failed, ...highlight.affected]);
  const nodes = layout(servicesOf(project, environment), environment.links);
  const byName = new Map(nodes.map((n) => [n.name, n]));
  const navigate = useNavigate();

  if (nodes.length === 0) {
    return <EmptyEnvironment environment={environment} />;
  }

  return (
    // Interactive only on the nodes, so a link under the diagram (a project card's) still works
    // everywhere else.
    <div className="pointer-events-none absolute inset-0">
      <svg
        key={environment.id}
        viewBox={fit(nodes)}
        className="size-full animate-in fade-in-0 duration-300"
        aria-hidden
      >
        <style>{KEYFRAMES}</style>
        {environment.links.map(([from, to]) => {
          const a = byName.get(from);
          const b = byName.get(to);
          if (!a || !b) return null;
          const path = edgePath(a, b);
          const broken = a.state.kind === "failed" || b.state.kind === "failed";
          const live = !broken && isLive(a.state.kind) && isLive(b.state.kind);
          const inChain = involved?.has(from) && involved.has(to);
          return (
            <g key={`${from}-${to}`} className={cn(involved && !inChain && "opacity-25")}>
              <path
                d={path}
                fill="none"
                strokeWidth={1.25}
                strokeDasharray={broken || inChain ? "3 3" : undefined}
                className={
                  broken || inChain ? "stroke-destructive/50" : "stroke-muted-foreground/35"
                }
              />
              {live && (
                <circle r={1.6} className="fill-foreground/70 motion-reduce:hidden">
                  <animateMotion
                    dur={`${1.6 + (from.length % 5) * 0.25}s`}
                    repeatCount="indefinite"
                    path={path}
                  />
                </circle>
              )}
            </g>
          );
        })}
        {nodes.map((node) => (
          <ServiceNode
            key={node.id}
            node={node}
            details={
              <ServiceDetails
                node={node}
                usage={props.usage?.services[serviceUsageKey(environment.id, node.id)]}
              />
            }
            onOpen={() =>
              void navigate({
                to: "/projects/$projectId/services/$serviceId",
                params: { projectId: project.id, serviceId: node.id },
                search: { environmentId: environment.id },
              })
            }
            role={
              !highlight
                ? undefined
                : node.name === highlight.failed
                  ? "failed"
                  : highlight.affected.includes(node.name)
                    ? "affected"
                    : "bystander"
            }
          />
        ))}
      </svg>
    </div>
  );
}

/**
 * Fits a project card's thumbnail as well as the project page; the description only shows when
 * there's room for it.
 */
function EmptyEnvironment(props: { environment: Environment }) {
  return (
    <Empty className="pointer-events-none absolute inset-0 gap-0 p-4 [container-type:size]">
      <EmptyHeader className="gap-1">
        <EmptyMedia variant="icon" className="mb-1 border">
          <BoxIcon />
        </EmptyMedia>
        <EmptyTitle className="text-xs">No services</EmptyTitle>
        <EmptyDescription className="hidden text-xs [@container(min-height:15rem)]:block">
          Add one to {props.environment.name} and it'll show up here.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

/** What a service is doing, shown above it while hovered. */
function ServiceDetails(props: { node: Node; usage?: ProjectUsage["services"][string] }) {
  const { node, usage } = props;
  const { deployment } = node;
  const cpu = usage?.cpu.at(-1);
  const memory = usage?.memoryGb.at(-1);
  return (
    <>
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-sm font-medium">{node.name}</span>
        <span className={cn("shrink-0", KIND_TEXT[node.state.kind])}>
          {node.state.label}
          {node.deployment && ` · ${timeAgo(node.deployment.createdAt)}`}
        </span>
      </div>
      {node.source && <p className="mt-0.5 truncate text-muted-foreground">{node.source}</p>}
      {(cpu !== undefined || memory !== undefined) && (
        <p className="mt-2 flex gap-3 tabular-nums">
          {cpu !== undefined && <span>{formatCpu(cpu)}</span>}
          {memory !== undefined && <span>{formatMemory(memory)}</span>}
        </p>
      )}
      {deployment && (deployment.commitMessage || deployment.creator) && (
        <p className="mt-2 truncate text-muted-foreground">
          {deployment.commitMessage ? `“${deployment.commitMessage}”` : "Deployed"}
          {deployment.creator && ` by ${deployment.creator}`}
        </p>
      )}
      {node.domains[0] && <p className="mt-1 truncate text-muted-foreground">{node.domains[0]}</p>}
    </>
  );
}

const KEYFRAMES = `
@keyframes topology-dash { to { stroke-dashoffset: -7; } }
@keyframes topology-glow { 0%, 100% { opacity: 0.35; } 50% { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { [style*="topology-"] { animation: none !important; } }
`;

const FILL: Record<Kind, string> = {
  running: "fill-success",
  sleeping: "fill-muted-foreground",
  pending: "fill-warning",
  failed: "fill-destructive",
  stopped: "fill-muted-foreground/50",
};

function ServiceNode(props: {
  node: Node;
  role?: "failed" | "affected" | "bystander";
  /** Shown in a card above the node while it's hovered. */
  details: React.ReactNode;
  onOpen: () => void;
}) {
  const { node, role } = props;
  const kind = node.state.kind;
  const left = node.x - node.width / 2;
  const top = node.y - NODE_HEIGHT / 2;
  const halo = { x: left - 4, y: top - 4, width: node.width + 8, height: NODE_HEIGHT + 8, rx: 10 };
  return (
    // The card is portalled out of the canvas, so a project card's edges don't clip it, and it
    // flips or shifts to stay inside the viewport.
    <HoverCard>
      <HoverCardTrigger
        delay={0}
        closeDelay={0}
        render={
          <g
            className={cn(
              "pointer-events-auto cursor-pointer transition-opacity",
              kind === "stopped" && "opacity-45",
              kind === "sleeping" && "opacity-70",
              role === "bystander" && "opacity-40",
            )}
            onClick={props.onOpen}
          />
        }
      >
        {role === "affected" && (
          <rect {...halo} strokeDasharray="3 3" className="fill-warning/10 stroke-warning/60" />
        )}
        {kind === "failed" && (
          <rect
            {...halo}
            className="fill-destructive/15 stroke-destructive/40"
            style={{ animation: "topology-glow 1.6s ease-in-out infinite" }}
          />
        )}
        <rect
          x={left}
          y={top}
          width={node.width}
          height={NODE_HEIGHT}
          rx={7}
          strokeWidth={kind === "failed" ? 1.5 : 1}
          strokeDasharray={kind === "pending" ? "4 3" : undefined}
          className={cn(
            "fill-card",
            kind === "failed"
              ? "stroke-destructive"
              : kind === "pending"
                ? "stroke-warning"
                : "stroke-border",
          )}
          style={
            kind === "pending" ? { animation: "topology-dash 0.8s linear infinite" } : undefined
          }
        />
        <circle
          cx={left + 12}
          cy={node.y}
          r={3.25}
          className={cn(FILL[kind], kind === "pending" && "animate-pulse")}
        />
        {node.datastore && (
          <DatabaseIcon
            x={left + node.width - 18}
            y={node.y - 5.5}
            width={11}
            height={11}
            className="text-muted-foreground"
          />
        )}
        <text
          x={left + 21}
          y={node.y}
          dominantBaseline="central"
          className="fill-foreground text-[11px] font-medium"
        >
          {node.name}
        </text>
      </HoverCardTrigger>
      <HoverCardContent
        side="top"
        sideOffset={8}
        alignOffset={0}
        className="w-60 p-3 text-xs shadow-lg shadow-black/30"
      >
        {props.details}
      </HoverCardContent>
    </HoverCard>
  );
}

function isLive(kind: Kind) {
  return kind === "running" || kind === "pending";
}

/**
 * Layered left to right: a node's column is its longest chain of callers, then callers are pulled
 * right next to what they call so no edge skips a column. Rows within a column follow their
 * neighbours to cut crossings. Without links, services just sit in a row.
 */
function layout(services: ServiceWithState[], links: [string, string][]): Node[] {
  const depth = new Map(services.map((s) => [s.name, 0]));
  if (links.length === 0) {
    services.forEach((s, i) => depth.set(s.name, i));
  } else {
    for (let pass = 0; pass < services.length; pass++) {
      for (const [from, to] of links) {
        depth.set(to, Math.max(depth.get(to) ?? 0, (depth.get(from) ?? 0) + 1));
      }
    }
    for (let pass = 0; pass < services.length; pass++) {
      for (const s of services) {
        const targets = links
          .filter(([from]) => from === s.name)
          .map(([, to]) => depth.get(to) ?? 0);
        if (targets.length > 0) depth.set(s.name, Math.min(...targets) - 1);
      }
    }
  }

  const columns = Math.max(...depth.values(), 0) + 1;
  const placed = new Map<string, number>();
  const nodes: Node[] = [];

  for (let c = 0; c < columns; c++) {
    const column = services
      .filter((s) => depth.get(s.name) === c)
      .map((service) => {
        const neighbours = links
          .filter(([from, to]) => from === service.name || to === service.name)
          .map(([from, to]) => placed.get(from === service.name ? to : from))
          .filter((y) => y !== undefined);
        const target =
          neighbours.length > 0
            ? neighbours.reduce((a, b) => a + b) / neighbours.length
            : HEIGHT / 2;
        return { service, target };
      })
      .toSorted((a, b) => a.target - b.target);

    column.forEach(({ service }, row) => {
      const y = HEIGHT / 2 + (row - (column.length - 1) / 2) * ROW_GAP;
      placed.set(service.name, y);
      const datastore = isDatastore(service);
      nodes.push({
        ...service,
        x: (WIDTH / columns) * (c + 0.5),
        y,
        width: Math.max(64, service.name.length * 6.6 + (datastore ? 44 : 32)),
        datastore,
      });
    });
  }
  return nodes;
}

/** The diagram's frame, widened (keeping its aspect ratio) when wide nodes would spill out. */
function fit(nodes: Node[]) {
  const pad = 14;
  const minX = Math.min(0, ...nodes.map((n) => n.x - n.width / 2 - pad));
  const maxX = Math.max(WIDTH, ...nodes.map((n) => n.x + n.width / 2 + pad));
  const width = maxX - minX;
  const height = (width / WIDTH) * HEIGHT;
  return `${minX} ${HEIGHT / 2 - height / 2} ${width} ${height}`;
}

function edgePath(a: Node, b: Node) {
  const x1 = a.x + a.width / 2;
  const x2 = b.x - b.width / 2;
  const mid = (x1 + x2) / 2;
  return `M ${x1} ${a.y} C ${mid} ${a.y}, ${mid} ${b.y}, ${x2} ${b.y}`;
}

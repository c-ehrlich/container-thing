import { Button } from "@repo/ui/primitives/button";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@repo/ui/primitives/item";
import { Spinner } from "@repo/ui/primitives/spinner";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { isDataUIPart } from "ai";
import { useEffect } from "react";
import type { ReactNode } from "react";
import { Streamdown } from "streamdown";

import type { ChatMessage } from "../../domains/assistant/tools";
import { projectScope } from "../../domains/project/project";
import { ServiceListWidget, ServiceWidget, WidgetCard, WidgetError } from "./widgets";

type Part = ChatMessage["parts"][number];
type ToolPart<Name extends string> = Extract<Part, { type: `tool-${Name}` }>;

export type ApprovalHandler = (approvalId: string, approved: boolean) => void;

export function MessagePart(props: { part: Part; onApproval: ApprovalHandler }) {
  const { part, onApproval } = props;
  // `data-*` parts have template-literal types that a `case` can't rule out, and the chat sends none.
  if (isDataUIPart(part)) return null;

  switch (part.type) {
    case "text":
      return <Streamdown className="text-sm">{part.text}</Streamdown>;
    case "tool-listProjects":
      return <ListProjectsPart part={part} />;
    case "tool-listServices":
      return <ListServicesPart part={part} />;
    case "tool-startService":
      return <StartServicePart part={part} />;
    case "tool-stopService":
      return <StopServicePart part={part} onApproval={onApproval} />;
    case "reasoning":
    case "reasoning-file":
    case "source-url":
    case "source-document":
    case "file":
    case "step-start":
    case "dynamic-tool":
    case "custom":
      return null;
    default:
      // type error if there are unhandled cases
      part satisfies never;
      return null;
  }
}

function ListProjectsPart(props: { part: ToolPart<"listProjects"> }) {
  const { part } = props;
  switch (part.state) {
    case "output-available":
      return (
        <WidgetCard>
          <ItemGroup className="gap-0">
            {part.output.flatMap((workspace) =>
              workspace.projects.map((project) => (
                <Item
                  key={project.id}
                  size="xs"
                  render={<Link to="/projects/$projectId" params={{ projectId: project.id }} />}
                >
                  <ItemContent className="min-w-0">
                    <ItemTitle>{project.name}</ItemTitle>
                    <ItemDescription className="truncate">{workspace.name}</ItemDescription>
                  </ItemContent>
                </Item>
              )),
            )}
          </ItemGroup>
        </WidgetCard>
      );
    case "output-error":
      return <WidgetError>{part.errorText}</WidgetError>;
    case "input-streaming":
    case "input-available":
      return <ToolCaption pending>Looking up projects</ToolCaption>;
    case "approval-requested":
    case "approval-responded":
    case "output-denied":
      // Project lookups do not require approval.
      return null;
    default:
      // type error if there are unhandled cases
      part satisfies never;
      return null;
  }
}

function ListServicesPart(props: { part: ToolPart<"listServices"> }) {
  const { part } = props;
  switch (part.state) {
    case "output-available":
      return (
        <ServiceListWidget
          projectId={part.output.projectId}
          environmentId={part.output.environmentId}
        />
      );
    case "output-error":
      return <WidgetError>{part.errorText}</WidgetError>;
    case "input-streaming":
    case "input-available":
      return <ToolCaption pending>Looking up services</ToolCaption>;
    case "approval-requested":
    case "approval-responded":
    case "output-denied":
      // Service lookups do not require approval.
      return null;
    default:
      // type error if there are unhandled cases
      part satisfies never;
      return null;
  }
}

function StartServicePart(props: { part: ToolPart<"startService"> }) {
  const { part } = props;
  useRefreshProjectWhen(part.state === "output-available", part.input?.projectId);

  switch (part.state) {
    case "input-streaming":
      return <ToolCaption pending>Starting service</ToolCaption>;
    case "output-error":
      return <WidgetError>Couldn't start the service: {part.errorText}</WidgetError>;
    case "input-available":
      // The IDs are known as soon as the input is, so show the service while Railway is asked.
      return (
        <div className="grid gap-1">
          <ToolCaption pending>Start service</ToolCaption>
          <ServiceWidget {...part.input} />
        </div>
      );
    case "output-available":
      return (
        <div className="grid gap-1">
          <ToolCaption>Start service</ToolCaption>
          <ServiceWidget {...part.input} />
        </div>
      );
    case "approval-requested":
    case "approval-responded":
    case "output-denied":
      // Starting a service does not require approval.
      return null;
    default:
      // type error if there are unhandled cases
      part satisfies never;
      return null;
  }
}

function StopServicePart(props: { part: ToolPart<"stopService">; onApproval: ApprovalHandler }) {
  const { part, onApproval } = props;
  useRefreshProjectWhen(part.state === "output-available", part.input?.projectId);

  switch (part.state) {
    case "input-streaming":
      return <ToolCaption pending>Preparing to stop service</ToolCaption>;
    case "output-error":
      return <WidgetError>Couldn't stop the service: {part.errorText}</WidgetError>;
    case "output-denied":
      return <ToolCaption>Cancelled. Nothing was stopped.</ToolCaption>;
    case "approval-requested":
      return (
        <div className="grid gap-2">
          <ToolCaption>Stop this service?</ToolCaption>
          <ServiceWidget {...part.input} />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => onApproval(part.approval.id, false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => onApproval(part.approval.id, true)}
            >
              Stop service
            </Button>
          </div>
        </div>
      );
    case "input-available":
    case "approval-responded":
      return (
        <div className="grid gap-1">
          <ToolCaption pending>Stop service</ToolCaption>
          <ServiceWidget {...part.input} />
        </div>
      );
    case "output-available":
      return (
        <div className="grid gap-1">
          <ToolCaption>
            {part.output.alreadyStopped ? "Already stopped" : "Stop service"}
          </ToolCaption>
          <ServiceWidget {...part.input} />
        </div>
      );
    default:
      // type error if there are unhandled cases
      part satisfies never;
      return null;
  }
}

/**
 * Tools run on the server, so the browser's cache doesn't know a start or stop just happened. Refetch
 * right away instead of waiting for Railway's push, which can take a few seconds.
 */
function useRefreshProjectWhen(done: boolean, projectId: string | undefined) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (done && projectId) {
      void queryClient.invalidateQueries({ queryKey: projectScope(projectId) });
    }
  }, [done, projectId, queryClient]);
}

function ToolCaption(props: { pending?: boolean; children: ReactNode }) {
  return (
    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
      {props.pending && <Spinner className="size-3" />}
      {props.children}
    </p>
  );
}

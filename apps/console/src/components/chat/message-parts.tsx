import { Button } from "@repo/ui/primitives/button";
import { Item, ItemContent, ItemGroup, ItemTitle } from "@repo/ui/primitives/item";
import { Skeleton } from "@repo/ui/primitives/skeleton";
import { Spinner } from "@repo/ui/primitives/spinner";
import { Link } from "@tanstack/react-router";
import { isDataUIPart } from "ai";
import type { ReactNode } from "react";
import { Streamdown } from "streamdown";

import { useRefreshProjectWhen } from "../../domains/actions";
import type { ChatMessage } from "../../domains/assistant/tools";
import { ServicesWidget, ServiceWidget, WidgetCard, WidgetError, WidgetHeading } from "./widgets";

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
    case "tool-showProjects":
      return <ShowProjectsPart part={part} />;
    case "tool-showServices":
      return <ShowServicesPart part={part} />;
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

// Lookups are for the model, so they only leave a note; `show*` parts are what the user reads.

function ListProjectsPart(props: { part: ToolPart<"listProjects"> }) {
  const { part } = props;
  switch (part.state) {
    case "output-available":
      return <ToolCaption>Looked up projects</ToolCaption>;
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
      return <ToolCaption>{checkedServicesCaption(part.output)}</ToolCaption>;
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

function checkedServicesCaption(
  output: Extract<ToolPart<"listServices">, { state: "output-available" }>["output"],
) {
  const [only, ...rest] = output;
  if (only && rest.length === 0 && "projectName" in only) {
    return `Checked services in ${only.projectName}`;
  }
  return `Checked services in ${pluralize(output.length, "project")}`;
}

const pluralize = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;

function ShowProjectsPart(props: { part: ToolPart<"showProjects"> }) {
  const { part } = props;
  switch (part.state) {
    case "output-available":
      return (
        <WidgetCard>
          {[...new Set(part.output.projects.map((p) => p.workspaceName))].map((workspaceName) => (
            <ItemGroup key={workspaceName} className="gap-0">
              <WidgetHeading>{workspaceName}</WidgetHeading>
              {part.output.projects
                .filter((p) => p.workspaceName === workspaceName)
                .map((project) => (
                  <Item
                    key={project.id}
                    size="xs"
                    render={<Link to="/projects/$projectId" params={{ projectId: project.id }} />}
                  >
                    <ItemContent className="min-w-0">
                      <ItemTitle>{project.name}</ItemTitle>
                    </ItemContent>
                  </Item>
                ))}
            </ItemGroup>
          ))}
        </WidgetCard>
      );
    case "output-error":
      return <WidgetError>{part.errorText}</WidgetError>;
    case "input-streaming":
    case "input-available":
      return <Skeleton className="h-14" />;
    case "approval-requested":
    case "approval-responded":
    case "output-denied":
      // Showing projects does not require approval.
      return null;
    default:
      // type error if there are unhandled cases
      part satisfies never;
      return null;
  }
}

function ShowServicesPart(props: { part: ToolPart<"showServices"> }) {
  const { part } = props;
  switch (part.state) {
    case "input-streaming":
    case "input-available":
      return <Skeleton className="h-14" />;
    case "output-error":
      return <WidgetError>{part.errorText}</WidgetError>;
    case "output-available":
      // Nothing to list: the reply says what that means.
      if (part.output.count === 0) return <ToolCaption>No matching services</ToolCaption>;
      return <ServicesWidget services={part.output.services} />;
    case "approval-requested":
    case "approval-responded":
    case "output-denied":
      // Showing services does not require approval.
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

function ToolCaption(props: { pending?: boolean; children: ReactNode }) {
  return (
    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
      {props.pending && <Spinner className="size-3" />}
      {props.children}
    </p>
  );
}

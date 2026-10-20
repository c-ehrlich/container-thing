import { useChat } from "@ai-sdk/react";
import { Button } from "@repo/ui/primitives/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@repo/ui/primitives/input-group";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@repo/ui/primitives/item";
import { Spinner } from "@repo/ui/primitives/spinner";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useMatch } from "@tanstack/react-router";
import { lastAssistantMessageIsCompleteWithApprovalResponses } from "ai";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import { projectQuery } from "../railway/project";
import type { ChatMessage } from "./tools";
import { ServiceListWidget, ServiceWidget, WidgetCard, WidgetError } from "./widgets";

type Part = ChatMessage["parts"][number];
type ToolPart<Name extends string> = Extract<Part, { type: `tool-${Name}` }>;

type ApprovalHandler = (approvalId: string, approved: boolean) => void;

const SUGGESTIONS = ["What projects do I have?", "Which services are running?"];

/** The assistant, docked next to the page. Messages live in memory for this tab only. */
export function ChatPanel() {
  const { messages, setMessages, sendMessage, status, stop, error, addToolApprovalResponse } =
    useChat<ChatMessage>({
      // Once the user confirms or cancels a stop, send that back so the model can continue.
      sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
    });

  // Every request tells the model which project is on screen, so "start the api" just works.
  const match = useMatch({ from: "/projects/$projectId", shouldThrow: false });
  const requestOptions = {
    body: {
      context: { projectId: match?.params.projectId, environmentId: match?.search.environmentId },
    },
  };
  const onApproval: ApprovalHandler = (id, approved) =>
    void addToolApprovalResponse({ id, approved, options: requestOptions });

  const [input, setInput] = useState("");
  const busy = status === "submitted" || status === "streaming";
  const send = (text: string) => {
    if (!text.trim() || busy) return;
    void sendMessage({ text }, requestOptions);
    setInput("");
  };

  return (
    <aside className="flex h-svh w-96 shrink-0 flex-col border-l">
      <header className="flex items-center justify-between gap-2 border-b px-4 py-2">
        <h2 className="font-medium">Assistant</h2>
        <Button
          size="sm"
          variant="ghost"
          disabled={messages.length === 0 || busy}
          onClick={() => setMessages([])}
        >
          New chat
        </Button>
      </header>

      {/* Reversed so the browser keeps it scrolled to the newest message as content streams in. */}
      <div className="flex flex-1 flex-col-reverse overflow-y-auto">
        <div className="grid gap-4 p-4">
          {messages.length === 0 && (
            <div className="grid gap-2 text-sm text-muted-foreground">
              <p>Ask me to list, start or stop your Railway services.</p>
              <div className="flex flex-wrap gap-2">
                {SUGGESTIONS.map((suggestion) => (
                  <Button
                    key={suggestion}
                    size="sm"
                    variant="outline"
                    onClick={() => send(suggestion)}
                  >
                    {suggestion}
                  </Button>
                ))}
              </div>
            </div>
          )}
          {messages.map((message) =>
            message.role === "user" ? (
              <p
                key={message.id}
                className="ml-8 justify-self-end rounded-lg bg-muted px-3 py-2 text-sm whitespace-pre-wrap"
              >
                {message.parts.map((part) => (part.type === "text" ? part.text : "")).join("")}
              </p>
            ) : (
              <div key={message.id} className="grid gap-2">
                {message.parts.map((part, index) => (
                  <MessagePart
                    // Parts never reorder; tool parts also have a stable call ID.
                    key={"toolCallId" in part ? part.toolCallId : index}
                    part={part}
                    onApproval={onApproval}
                  />
                ))}
              </div>
            ),
          )}
          {status === "submitted" && <Spinner />}
          {error && <WidgetError>{error.message}</WidgetError>}
        </div>
      </div>

      <form
        className="border-t p-3"
        onSubmit={(event) => {
          event.preventDefault();
          send(input);
        }}
      >
        <InputGroup>
          <InputGroupTextarea
            value={input}
            placeholder="Start the api service…"
            rows={2}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                send(input);
              }
            }}
          />
          <InputGroupAddon align="block-end" className="justify-end">
            {busy ? (
              <InputGroupButton variant="outline" onClick={() => void stop()}>
                Stop
              </InputGroupButton>
            ) : (
              <InputGroupButton type="submit" variant="default" disabled={!input.trim()}>
                Send
              </InputGroupButton>
            )}
          </InputGroupAddon>
        </InputGroup>
      </form>
    </aside>
  );
}

function MessagePart(props: { part: Part; onApproval: ApprovalHandler }) {
  const { part, onApproval } = props;
  switch (part.type) {
    case "text":
      return <p className="text-sm whitespace-pre-wrap">{part.text}</p>;
    case "tool-listProjects":
      return <ListProjectsPart part={part} />;
    case "tool-listServices":
      return <ListServicesPart part={part} />;
    case "tool-startService":
      return <StartServicePart part={part} />;
    case "tool-stopService":
      return <StopServicePart part={part} onApproval={onApproval} />;
    default:
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
    default:
      return <ToolCaption pending>Looking up projects</ToolCaption>;
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
    default:
      return <ToolCaption pending>Looking up services</ToolCaption>;
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
    default:
      // The IDs are known as soon as the input is, so show the service while Railway is asked.
      return (
        <div className="grid gap-1">
          <ToolCaption pending={part.state === "input-available"}>Start service</ToolCaption>
          <ServiceWidget {...part.input} />
        </div>
      );
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
    default:
      return (
        <div className="grid gap-1">
          <ToolCaption pending={part.state !== "output-available"}>
            {part.state === "output-available" && part.output.alreadyStopped
              ? "Already stopped"
              : "Stop service"}
          </ToolCaption>
          <ServiceWidget {...part.input} />
        </div>
      );
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
      void queryClient.invalidateQueries({ queryKey: projectQuery(projectId).queryKey });
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

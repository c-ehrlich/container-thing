import { useChat } from "@ai-sdk/react";
import { cn } from "@repo/ui/lib/utils";
import { Button } from "@repo/ui/primitives/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@repo/ui/primitives/input-group";
import { Sidebar, SidebarContent, SidebarHeader } from "@repo/ui/primitives/sidebar";
import { Spinner } from "@repo/ui/primitives/spinner";
import { useMatch } from "@tanstack/react-router";
import { lastAssistantMessageIsCompleteWithApprovalResponses } from "ai";
import { XIcon } from "lucide-react";
import { useState } from "react";

import type { ChatMessage } from "../../domains/assistant/tools";
import { ShortcutTooltip } from "../shell/shortcut-tooltip";
import { MessagePart } from "./message-parts";
import type { ApprovalHandler } from "./message-parts";
import { WidgetError } from "./widgets";

const SUGGESTIONS = ["What projects do I have?", "Which services are running?"];

/**
 * The assistant, docked to the right of the page. Messages live in memory for this tab only, so
 * closing the panel only hides it.
 */
export function ChatPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
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
    // Slides like the left sidebar: the outer width animates while the panel keeps its width, so
    // the content moves off-screen instead of reflowing. Inert while closed so it can't take focus.
    <div
      inert={!open}
      className={cn(
        "sticky top-0 h-svh shrink-0 overflow-hidden transition-[width] duration-150 ease-out",
        open ? "w-96" : "w-0",
      )}
    >
      <Sidebar side="right" collapsible="none" className="w-96 border-l">
        <SidebarHeader className="h-12 flex-row items-center gap-2 border-b px-4 py-0">
          <h2 className="mr-auto font-medium">Assistant</h2>
          <Button
            size="sm"
            variant="ghost"
            disabled={messages.length === 0 || busy}
            onClick={() => setMessages([])}
          >
            New chat
          </Button>
          <ShortcutTooltip label="Close assistant" shortcut="⌘I">
            <Button size="icon-sm" variant="ghost" className="-mr-1" onClick={onClose}>
              <XIcon />
              <span className="sr-only">Close assistant</span>
            </Button>
          </ShortcutTooltip>
        </SidebarHeader>

        {/* Reversed so the browser keeps it scrolled to the newest message as content streams in. */}
        <SidebarContent className="flex-col-reverse">
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
        </SidebarContent>

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
      </Sidebar>
    </div>
  );
}

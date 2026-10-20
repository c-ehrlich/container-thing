import { useChat } from "@ai-sdk/react";
import { Button } from "@repo/ui/primitives/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@repo/ui/primitives/input-group";
import { Spinner } from "@repo/ui/primitives/spinner";
import { useMatch } from "@tanstack/react-router";
import { lastAssistantMessageIsCompleteWithApprovalResponses } from "ai";
import { useState } from "react";

import { MessagePart } from "./message-parts";
import type { ApprovalHandler } from "./message-parts";
import type { ChatMessage } from "./tools";
import { WidgetError } from "./widgets";

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

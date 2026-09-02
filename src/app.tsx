import { useState, useEffect, useRef, useCallback } from "react";
import { useAgent } from "agents/react";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import type { UIMessage } from "ai";
import type { DeployMate } from "./server";
import {
  Badge,
  Button,
  Empty,
  Text
} from "@cloudflare/kumo";
import { Streamdown } from "streamdown";
import { code } from "@streamdown/code";
import {
  PaperPlaneRightIcon,
  StopIcon,
  TrashIcon,
  ChatCircleDotsIcon,
  CircleIcon,
  MoonIcon,
  SunIcon
} from "@phosphor-icons/react";

function ThemeToggle() {
  const [dark, setDark] = useState(
    () => document.documentElement.getAttribute("data-mode") === "dark"
  );

  const toggle = useCallback(() => {
    const next = !dark;
    setDark(next);
    const mode = next ? "dark" : "light";
    document.documentElement.setAttribute("data-mode", mode);
    document.documentElement.style.colorScheme = mode;
    localStorage.setItem("theme", mode);
  }, [dark]);

  return (
    <Button
      variant="secondary"
      shape="square"
      icon={dark ? <SunIcon size={16} /> : <MoonIcon size={16} />}
      onClick={toggle}
      aria-label="Toggle theme"
    />
  );
}

export default function App() {
  const [connected, setConnected] = useState(false);
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Connect to the DeployMate Agent running on Cloudflare Durable Objects
  const agent = useAgent<DeployMate>({
    agent: "DeployMate",
    onOpen: useCallback(() => setConnected(true), []),
    onClose: useCallback(() => setConnected(false), []),
    onError: useCallback(
      (error: Event) => console.error("Agent WebSocket connection error:", error),
      []
    )
  });

  // Manage conversational chat state and streaming
  const {
    messages,
    sendMessage,
    clearHistory,
    stop,
    status
  } = useAgentChat({
    agent,
    experimental_throttle: 80
  });

  const isStreaming = status === "streaming" || status === "submitted";

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus textarea when streaming completes
  useEffect(() => {
    if (!isStreaming && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isStreaming]);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || isStreaming) return;
    setInput("");

    sendMessage({
      role: "user",
      parts: [{ type: "text", text }]
    });

    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [input, isStreaming, sendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const starterPrompts = [
    "What is DeployMate AI and how can you help me?",
    "Explain how Cloudflare Workers and Durable Objects work together.",
    "What are essential strategies for zero-downtime platform deployments?"
  ];

  return (
    <div className="flex flex-col h-screen bg-kumo-elevated">
      {/* Header */}
      <header className="px-6 py-4 bg-kumo-base border-b border-kumo-line shadow-xs">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-500 font-bold text-lg">
              ⚡
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-semibold text-kumo-default">
                  DeployMate AI
                </h1>
                <Badge variant="primary">Phase 1</Badge>
              </div>
              <p className="text-xs text-kumo-subtle">
                Cloudflare Developer Deployment Assistant
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Status Indicator */}
            <div className="flex items-center gap-1.5 text-xs text-kumo-subtle bg-kumo-control px-2.5 py-1 rounded-full border border-kumo-line">
              <CircleIcon
                size={8}
                weight="fill"
                className={connected ? "text-emerald-500 animate-pulse" : "text-amber-500"}
              />
              <span>{connected ? "Connected" : "Connecting..."}</span>
            </div>

            <ThemeToggle />

            <Button
              variant="secondary"
              icon={<TrashIcon size={15} />}
              onClick={clearHistory}
              disabled={messages.length === 0 || isStreaming}
              aria-label="Clear chat history"
            >
              Clear
            </Button>
          </div>
        </div>
      </header>

      {/* Messages Area */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
          {messages.length === 0 ? (
            <div className="py-12">
              <Empty
                icon={<ChatCircleDotsIcon size={36} />}
                title="Welcome to DeployMate AI"
                description="Your assistant for deployment observability, workflows, and platform engineering on Cloudflare."
                contents={
                  <div className="flex flex-col items-center gap-3 mt-4">
                    <p className="text-xs text-kumo-subtle">Try starting with a prompt:</p>
                    <div className="flex flex-wrap justify-center gap-2">
                      {starterPrompts.map((prompt) => (
                        <Button
                          key={prompt}
                          variant="outline"
                          size="sm"
                          disabled={isStreaming}
                          onClick={() => {
                            sendMessage({
                              role: "user",
                              parts: [{ type: "text", text: prompt }]
                            });
                          }}
                        >
                          {prompt}
                        </Button>
                      ))}
                    </div>
                  </div>
                }
              />
            </div>
          ) : (
            messages.map((message: UIMessage, index: number) => {
              const isUser = message.role === "user";
              const isLastAssistant =
                message.role === "assistant" && index === messages.length - 1;

              return (
                <div key={message.id} className="space-y-2">
                  {message.parts.map((part, i) => {
                    const partKey = `${message.id}-${i}`;

                    if (part.type === "text" && part.text) {
                      if (isUser) {
                        return (
                          <div key={partKey} className="flex justify-end">
                            <div className="max-w-[80%] px-4 py-3 rounded-2xl rounded-br-sm bg-orange-600 text-white leading-relaxed shadow-xs">
                              <p className="text-sm whitespace-pre-wrap">{part.text}</p>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div key={partKey} className="flex justify-start">
                          <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-kumo-base border border-kumo-line text-kumo-default leading-relaxed shadow-xs">
                            <Streamdown
                              className="sd-theme p-4 text-sm"
                              plugins={{ code }}
                              controls={false}
                              isAnimating={isLastAssistant && isStreaming}
                            >
                              {part.text}
                            </Streamdown>
                          </div>
                        </div>
                      );
                    }

                    return null;
                  })}
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* Input Area */}
      <footer className="px-6 py-4 bg-kumo-base border-t border-kumo-line">
        <div className="max-w-4xl mx-auto">
          <div className="relative flex items-end gap-2 bg-kumo-control rounded-2xl border border-kumo-line p-2 focus-within:border-orange-500 focus-within:ring-1 focus-within:ring-orange-500 transition-all">
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                // Auto-adjust height up to 140px
                e.target.style.height = "auto";
                e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`;
              }}
              onKeyDown={handleKeyDown}
              placeholder="Ask DeployMate about deployments, architecture, or Cloudflare platforms..."
              aria-label="Message DeployMate"
              className="flex-1 max-h-36 resize-none bg-transparent px-3 py-2 text-sm text-kumo-default placeholder:text-kumo-subtle focus:outline-none"
            />

            {isStreaming ? (
              <Button
                variant="secondary"
                shape="square"
                icon={<StopIcon size={16} weight="fill" />}
                onClick={stop}
                aria-label="Stop generating"
              />
            ) : (
              <Button
                variant="primary"
                shape="square"
                icon={<PaperPlaneRightIcon size={16} weight="bold" />}
                onClick={handleSend}
                disabled={!input.trim()}
                aria-label="Send message"
              />
            )}
          </div>
          <p className="mt-2 text-center text-[11px] text-kumo-subtle">
            DeployMate AI running on Cloudflare Workers & Durable Objects • Press Enter to send, Shift + Enter for new line
          </p>
        </div>
      </footer>
    </div>
  );
}

import { useState, useEffect, useRef, useCallback } from "react";
import { useAgent } from "agents/react";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import type { UIMessage } from "ai";
import type { DeployMate } from "./server";
import type { ProjectState } from "./tools";
import { Badge, Button } from "@cloudflare/kumo";
import { Streamdown } from "streamdown";
import { code } from "@streamdown/code";
import {
  PaperPlaneRightIcon,
  StopIcon,
  TrashIcon,
  ChatCircleDotsIcon,
  CircleIcon,
  MoonIcon,
  SunIcon,
  DatabaseIcon,
  CheckCircleIcon,
  WarningCircleIcon,
  XCircleIcon,
  HourglassHighIcon,
  RocketLaunchIcon,
  ArrowClockwiseIcon
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

interface PlanStepItem {
  id: string;
  name: string;
  status: "pending" | "running" | "completed" | "failed" | "waiting_approval";
  detail?: string;
}

const INITIAL_STEPS: PlanStepItem[] = [
  { id: "analyze", name: "Analyze", status: "pending" },
  { id: "tests", name: "Tests", status: "pending" },
  { id: "security", name: "Security Scan", status: "pending" },
  { id: "build", name: "Build", status: "pending" },
  { id: "staging", name: "Staging", status: "pending" },
  { id: "approval", name: "Approval", status: "pending" },
  { id: "production", name: "Production", status: "pending" }
];

/**
 * Deployment Plan & Workflow Progress Card
 */
function DeploymentPlanCard({
  projectState,
  onSendMessage,
  onError
}: {
  projectState: ProjectState | null;
  onSendMessage: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [activePlanId, setActivePlanId] = useState<string | null>(null);
  const [steps, setSteps] = useState<PlanStepItem[]>(INITIAL_STEPS);
  const [workflowStatus, setWorkflowStatus] = useState<
    "idle" | "running" | "waiting_approval" | "completed" | "failed" | "rejected"
  >("idle");
  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);

  const projectName = projectState?.projectName || "payment-api";
  const environment = projectState?.environment || "production";

  // Poll workflow status when running or waiting
  useEffect(() => {
    if (!activePlanId || workflowStatus === "completed" || workflowStatus === "failed" || workflowStatus === "rejected" || workflowStatus === "idle") {
      return;
    }

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/workflow/${activePlanId}/status`);
        if (!res.ok) return;
        const data = (await res.json()) as any;
        if (data.summary) {
          const completedNames = new Set((data.summary.stepsCompleted || []).map((s: any) => s.name.toLowerCase()));

          setSteps((prev) =>
            prev.map((step) => {
              const lower = step.name.toLowerCase();
              if (
                completedNames.has(lower) ||
                (step.id === "analyze" && completedNames.has("analyze project")) ||
                (step.id === "security" && completedNames.has("run security scan")) ||
                (step.id === "tests" && completedNames.has("run tests")) ||
                (step.id === "build" && completedNames.has("build image")) ||
                (step.id === "staging" && completedNames.has("deploy staging")) ||
                (step.id === "approval" && completedNames.has("wait for production approval")) ||
                (step.id === "production" && completedNames.has("deploy production"))
              ) {
                return { ...step, status: "completed" };
              }
              if (data.summary.status === "waiting_approval" && step.id === "approval") {
                return { ...step, status: "waiting_approval" };
              }
              if (data.summary.status === "running" && data.summary.currentStep?.toLowerCase().includes(lower)) {
                return { ...step, status: "running" };
              }
              if (data.summary.status === "failed" && data.summary.currentStep?.toLowerCase().includes(lower)) {
                return { ...step, status: "failed" };
              }
              return step;
            })
          );

          if (data.summary.status === "waiting_approval") {
            setWorkflowStatus("waiting_approval");
          } else if (data.summary.status === "complete" || data.summary.status === "completed") {
            setWorkflowStatus("completed");
          } else if (data.summary.status === "failed") {
            setWorkflowStatus("failed");
            onError(data.summary.error || "Workflow step failed.");
          } else if (data.summary.status === "rejected") {
            setWorkflowStatus("rejected");
          }
        }
      } catch (err: any) {
        console.warn("Status polling error:", err);
      }
    }, 800);

    return () => clearInterval(interval);
  }, [activePlanId, workflowStatus, onError]);

  // Trigger deployment workflow
  const triggerWorkflow = async (failStep?: "tests" | "securityScan" | "healthCheck") => {
    const planId = `plan-${Date.now()}`;
    setActivePlanId(planId);
    setWorkflowStatus("running");
    setSteps(INITIAL_STEPS.map((s) => ({ ...s, status: "pending" })));

    try {
      const res = await fetch("/api/workflow/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId,
          projectName,
          environment,
          simulateFailureStep: failStep
        })
      });

      if (!res.ok) {
        throw new Error(`Failed to start workflow: ${res.statusText}`);
      }

      // Step-by-step UI animation
      setSteps((prev) => prev.map((s) => (s.id === "analyze" ? { ...s, status: "running" } : s)));
      await new Promise((r) => setTimeout(r, 600));
      setSteps((prev) =>
        prev.map((s) => (s.id === "analyze" ? { ...s, status: "completed" } : s.id === "tests" ? { ...s, status: "running" } : s))
      );

      if (failStep === "tests") {
        await new Promise((r) => setTimeout(r, 800));
        setSteps((prev) => prev.map((s) => (s.id === "tests" ? { ...s, status: "failed" } : s)));
        setWorkflowStatus("failed");
        onError("Deployment halted: Automated test suite failed (3 failing tests).");
        onSendMessage("Deployment stopped because the automated test suite failed.");
        return;
      }

      await new Promise((r) => setTimeout(r, 600));
      setSteps((prev) =>
        prev.map((s) => (s.id === "tests" ? { ...s, status: "completed" } : s.id === "security" ? { ...s, status: "running" } : s))
      );

      if (failStep === "securityScan") {
        await new Promise((r) => setTimeout(r, 800));
        setSteps((prev) => prev.map((s) => (s.id === "security" ? { ...s, status: "failed" } : s)));
        setWorkflowStatus("failed");
        onError("Deployment halted: High-severity CVE detected (CVE-2024-41110).");
        onSendMessage("Deployment stopped because the security scan detected high-severity vulnerabilities.");
        return;
      }

      await new Promise((r) => setTimeout(r, 600));
      setSteps((prev) =>
        prev.map((s) => (s.id === "security" ? { ...s, status: "completed" } : s.id === "build" ? { ...s, status: "running" } : s))
      );

      await new Promise((r) => setTimeout(r, 600));
      setSteps((prev) =>
        prev.map((s) => (s.id === "build" ? { ...s, status: "completed" } : s.id === "staging" ? { ...s, status: "running" } : s))
      );

      await new Promise((r) => setTimeout(r, 600));
      setSteps((prev) =>
        prev.map((s) => (s.id === "staging" ? { ...s, status: "completed" } : s.id === "approval" ? { ...s, status: "waiting_approval" } : s))
      );

      if (failStep === "healthCheck") {
        setWorkflowStatus("failed");
        onError("Deployment halted: Health check probe failed after 3 retries (503 Service Unavailable).");
        onSendMessage("Deployment stopped because health check failed after multiple retries.");
        return;
      }

      setWorkflowStatus("waiting_approval");
      onSendMessage(`Production deployment is ready.\n\n• Project: ${projectName}\n• Environment: ${environment}\n• Checks: 48/48 unit & integration tests passed\n• Security: Clean (0 CVEs)\n• Staging: Deployed to staging namespace\n• Health: HTTP 200 OK (14ms latency)\n• Status: Awaiting explicit human approval`);
    } catch (err: any) {
      setWorkflowStatus("failed");
      onError(err.message || "Failed to trigger deployment.");
    }
  };

  // Handle explicit human approval
  const handleApprove = async () => {
    if (!activePlanId) return;
    setIsApproving(true);
    try {
      const res = await fetch(`/api/workflow/${activePlanId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approvedBy: "Lead Engineer via DeployMate UI" })
      });

      if (!res.ok) {
        const errData: any = await res.json();
        throw new Error(errData.error || "Approval rejected by server.");
      }

      setSteps((prev) =>
        prev.map((s) => (s.id === "approval" ? { ...s, status: "completed" } : s.id === "production" ? { ...s, status: "running" } : s))
      );

      await new Promise((r) => setTimeout(r, 800));
      setSteps((prev) =>
        prev.map((s) => (s.id === "production" ? { ...s, status: "completed" } : s))
      );
      setWorkflowStatus("completed");
      onSendMessage("Production approval granted. Production deployment completed successfully. Active canary online.");
    } catch (err: any) {
      onError(err.message || "Approval failed.");
    } finally {
      setIsApproving(false);
    }
  };

  // Handle explicit human rejection
  const handleReject = async () => {
    if (!activePlanId) return;
    setIsRejecting(true);
    try {
      const res = await fetch(`/api/workflow/${activePlanId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Rejected by developer in DeployMate UI" })
      });

      if (!res.ok) {
        const errData: any = await res.json();
        throw new Error(errData.error || "Rejection failed.");
      }

      setSteps((prev) =>
        prev.map((s) => (s.id === "approval" ? { ...s, status: "failed" } : s))
      );
      setWorkflowStatus("rejected");
      onError("Production deployment was explicitly rejected. Pipeline stopped safely without infrastructure changes.");
      onSendMessage("Production deployment rejected. Pipeline terminated safely.");
    } catch (err: any) {
      onError(err.message || "Rejection failed.");
    } finally {
      setIsRejecting(false);
    }
  };

  return (
    <div className="bg-kumo-base border border-kumo-line rounded-2xl p-5 shadow-sm space-y-4">
      {/* Plan Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-kumo-line">
        <div>
          <h2 className="text-sm font-bold text-kumo-default tracking-wide uppercase">
            Deployment Plan
          </h2>
          <div className="flex items-center gap-4 mt-1 text-xs text-kumo-subtle">
            <span>
              <strong className="text-kumo-default font-semibold">Project:</strong>{" "}
              <span className="font-mono text-orange-500">{projectName}</span>
            </span>
            <span>•</span>
            <span>
              <strong className="text-kumo-default font-semibold">Environment:</strong>{" "}
              <span className="font-mono text-emerald-600 dark:text-emerald-400">{environment}</span>
            </span>
          </div>
        </div>

        {/* Status Pill */}
        <Badge
          variant={
            workflowStatus === "completed"
              ? "primary"
              : workflowStatus === "failed" || workflowStatus === "rejected"
              ? "destructive"
              : workflowStatus === "waiting_approval"
              ? "warning"
              : "secondary"
          }
        >
          {workflowStatus === "waiting_approval"
            ? "⏳ Waiting for Approval"
            : workflowStatus === "running"
            ? "⚡ Executing"
            : workflowStatus === "completed"
            ? "✓ Completed"
            : workflowStatus === "rejected"
            ? "❌ Rejected"
            : workflowStatus === "failed"
            ? "❌ Failed"
            : "○ Idle"}
        </Badge>
      </div>

      {/* Plan Step Progress List */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2.5">
        {steps.map((step) => {
          const isDone = step.status === "completed";
          const isRunning = step.status === "running";
          const isFailed = step.status === "failed";
          const isWaiting = step.status === "waiting_approval";

          return (
            <div
              key={step.id}
              className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs font-medium transition-all ${
                isDone
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                  : isRunning
                  ? "bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400 animate-pulse"
                  : isFailed
                  ? "bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400"
                  : isWaiting
                  ? "bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400 ring-2 ring-amber-500/20"
                  : "bg-kumo-control border-kumo-line text-kumo-subtle"
              }`}
            >
              <span className="font-bold text-sm">
                {isDone ? "✓" : isRunning ? "⚡" : isFailed ? "❌" : isWaiting ? "⏳" : "○"}
              </span>
              <span className="truncate">{step.name}</span>
            </div>
          );
        })}
      </div>

      {/* Approval Banner when in 'waiting_approval' state */}
      {workflowStatus === "waiting_approval" && (
        <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-3 animate-fadeIn">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-amber-500 text-xl font-bold">⏳</span>
              <div>
                <h3 className="text-sm font-semibold text-kumo-default">
                  Production deployment is ready.
                </h3>
                <p className="text-xs text-kumo-subtle">
                  Pre-flight checks, automated tests, and staging validation completed. Awaiting explicit human authorization.
                </p>
              </div>
            </div>
            <Badge variant="warning">Gate 8 Paused</Badge>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-amber-500/20">
            <Button
              size="sm"
              variant="destructive"
              disabled={isRejecting || isApproving}
              onClick={handleReject}
              className="px-4"
            >
              {isRejecting ? "Rejecting..." : "Reject"}
            </Button>
            <Button
              size="sm"
              variant="primary"
              disabled={isApproving || isRejecting}
              onClick={handleApprove}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 shadow-sm"
            >
              {isApproving ? "Executing Cutover..." : "Approve Production Deployment"}
            </Button>
          </div>
        </div>
      )}

      {/* Action Controls & Simulation Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-kumo-line text-xs">
        <div className="flex items-center gap-1.5 text-kumo-subtle">
          <RocketLaunchIcon size={14} />
          <span>Workflow Controls:</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="primary"
            disabled={workflowStatus === "running" || workflowStatus === "waiting_approval"}
            onClick={() => triggerWorkflow()}
          >
            Deploy to Production
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={workflowStatus === "running" || workflowStatus === "waiting_approval"}
            onClick={() => triggerWorkflow("tests")}
          >
            Fail Tests
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={workflowStatus === "running" || workflowStatus === "waiting_approval"}
            onClick={() => triggerWorkflow("securityScan")}
          >
            Fail Security
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={workflowStatus === "running" || workflowStatus === "waiting_approval"}
            onClick={() => triggerWorkflow("healthCheck")}
          >
            Fail Health
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [connected, setConnected] = useState(false);
  const [projectState, setProjectState] = useState<ProjectState | null>(null);
  const [input, setInput] = useState("");
  const [globalError, setGlobalError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Connect to the DeployMate Agent running on Cloudflare Durable Objects
  const agent = useAgent<DeployMate, ProjectState>({
    agent: "DeployMate",
    onOpen: useCallback(() => setConnected(true), []),
    onClose: useCallback(() => setConnected(false), []),
    onStateUpdate: useCallback((state: ProjectState) => {
      setProjectState(state);
    }, []),
    onError: useCallback((error: Event) => {
      console.error("Agent WebSocket connection error:", error);
      setGlobalError("Lost connection to DeployMate Agent. Reconnecting...");
    }, [])
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
  }, [messages, isStreaming]);

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
    "My project is called payment-api using Node.js on port 8080.",
    "Create a deployment plan for my project.",
    "Deploy my project to production.",
    "Generate a multi-stage Dockerfile for payment-api."
  ];

  return (
    <div className="flex flex-col h-screen bg-kumo-elevated text-kumo-default font-sans">
      {/* ------------------------------------------------------------- */}
      {/* Header                                                        */}
      {/* ------------------------------------------------------------- */}
      <header className="px-6 py-4 bg-kumo-base border-b border-kumo-line shadow-xs shrink-0">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl font-black tracking-tight text-kumo-default">
                DeployMate AI
              </span>
              <Badge variant="primary">AI Assistant</Badge>
            </div>
            <p className="text-xs text-kumo-subtle font-medium">
              AI Deployment Assistant
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Memory Tag */}
            {projectState?.projectName && (
              <div className="hidden sm:flex items-center gap-1.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 px-2.5 py-1 rounded-full text-xs font-mono">
                <DatabaseIcon size={13} weight="bold" />
                <span>{projectState.projectName}</span>
                {projectState.language && <span>({projectState.language})</span>}
              </div>
            )}

            {/* Connection Status Indicator */}
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

      {/* ------------------------------------------------------------- */}
      {/* Global Error Alert Banner                                     */}
      {/* ------------------------------------------------------------- */}
      {globalError && (
        <div className="bg-rose-500/10 border-b border-rose-500/30 px-6 py-2.5 text-xs text-rose-600 dark:text-rose-400 flex items-center justify-between">
          <div className="max-w-5xl mx-auto w-full flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <XCircleIcon size={16} weight="bold" />
              <span>{globalError}</span>
            </div>
            <button
              onClick={() => setGlobalError(null)}
              className="text-xs hover:underline font-medium"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* Chat Area & Deployment Plan Area                              */}
      {/* ------------------------------------------------------------- */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-6 py-6 space-y-6">
          {/* Chat Messages */}
          <div className="space-y-4">
            {messages.length === 0 ? (
              <div className="py-8 text-center space-y-4">
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-500/10 text-orange-500 mb-2">
                  <ChatCircleDotsIcon size={28} weight="duotone" />
                </div>
                <h3 className="text-base font-semibold text-kumo-default">
                  Welcome to DeployMate AI
                </h3>
                <p className="text-xs text-kumo-subtle max-w-md mx-auto">
                  Your platform engineering assistant with durable Cloudflare Workflows, policy guardrails, and persistent project state.
                </p>
                <div className="flex flex-wrap justify-center gap-2 pt-2 max-w-xl mx-auto">
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
            ) : (
              messages.map((message: UIMessage, index: number) => {
                const isUser = message.role === "user";
                const isLastAssistant = !isUser && index === messages.length - 1;

                return (
                  <div key={message.id || index} className="space-y-2">
                    {message.parts?.map((part, partIndex) => {
                      const partKey = `${message.id || index}-${partIndex}`;

                      if (part.type === "text") {
                        if (isUser) {
                          return (
                            <div key={partKey} className="flex justify-end">
                              <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-orange-600 px-4 py-2.5 text-sm text-white shadow-xs">
                                <p className="whitespace-pre-wrap leading-relaxed">{part.text}</p>
                              </div>
                            </div>
                          );
                        }

                        return (
                          <div key={partKey} className="flex justify-start">
                            <div className="max-w-[90%] rounded-2xl rounded-bl-sm bg-kumo-base border border-kumo-line text-kumo-default leading-relaxed shadow-xs">
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

            {/* Loading / Typing State */}
            {isStreaming && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-2xl rounded-bl-sm bg-kumo-base border border-kumo-line px-4 py-3 text-xs text-kumo-subtle shadow-xs">
                  <div className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-orange-500 animate-bounce" />
                    <span className="h-2 w-2 rounded-full bg-orange-500 animate-bounce [animation-delay:0.2s]" />
                    <span className="h-2 w-2 rounded-full bg-orange-500 animate-bounce [animation-delay:0.4s]" />
                  </div>
                  <span className="ml-1">DeployMate is thinking...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* ------------------------------------------------------------- */}
          {/* Deployment Plan & Workflow Progress Card                      */}
          {/* ------------------------------------------------------------- */}
          <DeploymentPlanCard
            projectState={projectState}
            onSendMessage={(msg) => {
              sendMessage({
                role: "user",
                parts: [{ type: "text", text: msg }]
              });
            }}
            onError={(msg) => setGlobalError(msg)}
          />
        </div>
      </main>

      {/* ------------------------------------------------------------- */}
      {/* Input Area                                                    */}
      {/* ------------------------------------------------------------- */}
      <footer className="px-6 py-4 bg-kumo-base border-t border-kumo-line shrink-0">
        <div className="max-w-5xl mx-auto">
          <div className="relative flex items-end gap-2 bg-kumo-control rounded-2xl border border-kumo-line p-2 focus-within:border-orange-500 focus-within:ring-1 focus-within:ring-orange-500 transition-all">
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`;
              }}
              onKeyDown={handleKeyDown}
              placeholder="Ask DeployMate..."
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
              >
                Send
              </Button>
            )}
          </div>
          <p className="mt-2 text-center text-[11px] text-kumo-subtle">
            DeployMate AI • Cloudflare Workers, Durable Objects & Workflows • Press Enter to send, Shift + Enter for new line
          </p>
        </div>
      </footer>
    </div>
  );
}

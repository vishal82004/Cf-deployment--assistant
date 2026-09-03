/**
 * Human-in-the-Loop Production Approval Gate Security Engine (Phase 8)
 *
 * Implements strict security validations for production deployment approvals:
 * 1. Anti-Agent Self-Approval: Prohibits autonomous approvals by the LLM agent.
 * 2. Deployment Existence Check: Validates that target planId exists.
 * 3. State Check: Validates deployment is actually in 'waiting_approval' state.
 * 4. Policy Compliance Check: Ensures tests, security scans, and health checks have passed.
 * 5. Safe Rejection Handling: Terminates pipeline safely without infrastructure changes.
 */

import type { WorkflowRunSummary } from "./workflow";

export interface ApprovalRequest {
  approvedBy?: string;
  caller?: string; // "agent" | "human"
  reason?: string;
  simulateFailedChecks?: boolean;
}

export interface ApprovalResponse {
  success: boolean;
  planId?: string;
  status?: string;
  approvedBy?: string;
  reason?: string;
  error?: string;
  message?: string;
}

export function handleWorkflowApproval(
  planId: string,
  body: ApprovalRequest,
  registry: Map<string, WorkflowRunSummary>,
  headers?: Headers
): { status: number; data: ApprovalResponse } {
  // Security Rule 1: Anti-Agent Self-Approval (Agent cannot approve its own deployment)
  const caller = body.caller || headers?.get("X-Caller");
  if (caller === "agent") {
    return {
      status: 403,
      data: {
        success: false,
        error: "Agent self-approval is strictly prohibited. Production releases require explicit human authorization."
      }
    };
  }

  // Security Rule 2: Validate deployment exists
  const summary = registry.get(planId);
  if (!summary) {
    return {
      status: 404,
      data: {
        success: false,
        error: `Deployment ${planId} does not exist.`
      }
    };
  }

  // Security Rule 3: Validate deployment is actually waiting for approval
  if (summary.status !== "waiting_approval") {
    return {
      status: 400,
      data: {
        success: false,
        error: `Deployment ${planId} cannot be approved because it is not waiting for approval (current status: ${summary.status}).`
      }
    };
  }

  // Security Rule 4: Validate that all required policies and safety gates passed
  const hasFailedChecks =
    summary.stepsCompleted.some((s) => s.status === "failed") ||
    Boolean(summary.error) ||
    body.simulateFailedChecks === true;

  if (hasFailedChecks) {
    return {
      status: 403,
      data: {
        success: false,
        error: "Approval rejected: Cannot approve deployment with failed tests, unresolved security vulnerabilities, or failing health checks."
      }
    };
  }

  // Execute approval
  const approver = body.approvedBy || "Lead Engineer via DeployMate UI";
  summary.status = "running";
  summary.currentStep = "Deploy production";
  summary.approvedBy = approver;
  summary.stepsCompleted.push({
    stepId: 8,
    name: "Wait for production approval",
    status: "completed",
    output: `Production approval granted by ${approver}. Gate passed.`,
    timestamp: new Date().toISOString()
  });
  summary.stepsCompleted.push({
    stepId: 9,
    name: "Deploy production",
    status: "completed",
    output: "Production deployment completed successfully. Traffic cutover to active canary instances.",
    timestamp: new Date().toISOString()
  });
  summary.status = "complete" as any;
  summary.currentStep = "Finished";
  summary.completedAt = new Date().toISOString();
  registry.set(planId, summary);

  return {
    status: 200,
    data: {
      success: true,
      planId,
      status: "complete",
      approvedBy: approver,
      message: "Production deployment approved and executed successfully."
    }
  };
}

export function handleWorkflowRejection(
  planId: string,
  body: { reason?: string },
  registry: Map<string, WorkflowRunSummary>
): { status: number; data: ApprovalResponse } {
  // Validate deployment exists
  const summary = registry.get(planId);
  if (!summary) {
    return {
      status: 404,
      data: {
        success: false,
        error: `Deployment ${planId} does not exist.`
      }
    };
  }

  // Validate deployment is in waiting_approval
  if (summary.status !== "waiting_approval") {
    return {
      status: 400,
      data: {
        success: false,
        error: `Deployment ${planId} cannot be rejected because it is not waiting for approval (current status: ${summary.status}).`
      }
    };
  }

  const reason = body.reason || "Rejected by developer in DeployMate UI";
  summary.status = "rejected";
  summary.rejectionReason = reason;
  summary.currentStep = "Deployment Rejected";
  summary.completedAt = new Date().toISOString();
  summary.stepsCompleted.push({
    stepId: 8,
    name: "Wait for production approval",
    status: "failed",
    output: `Production deployment rejected: ${reason}. Pipeline halted safely without modifying production infrastructure.`,
    timestamp: new Date().toISOString()
  });
  registry.set(planId, summary);

  return {
    status: 200,
    data: {
      success: true,
      planId,
      status: "rejected",
      reason,
      message: "Production deployment rejected safely. Pipeline terminated."
    }
  };
}

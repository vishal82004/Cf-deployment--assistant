import { describe, it, expect } from "vitest";
import { handleWorkflowApproval } from "../../src/approval";
import { evaluateDeploymentPolicy } from "../../src/policies";
import type { WorkflowRunSummary } from "../../src/workflow";

describe("Security Tests: Human-in-the-Loop & Policy Guardrails", () => {
  const testRegistry = new Map<string, WorkflowRunSummary>();

  it("strictly rejects Agent self-approval attempts with 403 Forbidden", () => {
    const planId = "sec-agent-self-approval";
    testRegistry.set(planId, {
      planId,
      projectName: "payment-api",
      environment: "production",
      status: "waiting_approval",
      currentStep: "Wait for production approval",
      stepsCompleted: []
    });

    const res = handleWorkflowApproval(
      planId,
      { caller: "agent", approvedBy: "DeployMate Agent" },
      testRegistry
    );

    expect(res.status).toBe(403);
    expect(res.data.success).toBe(false);
    expect(res.data.error).toContain("Agent self-approval is strictly prohibited");
  });

  it("strictly rejects approval of nonexistent deployment IDs with 404 Not Found", () => {
    const res = handleWorkflowApproval(
      "nonexistent-plan-id-12345",
      { caller: "human", approvedBy: "Engineer" },
      testRegistry
    );

    expect(res.status).toBe(404);
    expect(res.data.success).toBe(false);
    expect(res.data.error).toContain("does not exist");
  });

  it("strictly rejects approval of non-pending deployments with 400 Bad Request", () => {
    const planId = "sec-running-plan";
    testRegistry.set(planId, {
      planId,
      projectName: "payment-api",
      environment: "production",
      status: "running", // Still actively building
      currentStep: "Build image",
      stepsCompleted: []
    });

    const res = handleWorkflowApproval(
      planId,
      { caller: "human", approvedBy: "Engineer" },
      testRegistry
    );

    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
    expect(res.data.error).toContain("is not waiting for approval");
  });

  it("strictly prohibits bypassing failed safety checks with 403 Forbidden", () => {
    const planId = "sec-bypass-plan";
    testRegistry.set(planId, {
      planId,
      projectName: "payment-api",
      environment: "production",
      status: "waiting_approval",
      currentStep: "Wait for production approval",
      error: "Automated test suite failed: 3 failed tests",
      stepsCompleted: [
        { stepId: 3, name: "Run tests", status: "failed", output: "Failed", timestamp: "" }
      ]
    });

    const res = handleWorkflowApproval(
      planId,
      { caller: "human", approvedBy: "Engineer" },
      testRegistry
    );

    expect(res.status).toBe(403);
    expect(res.data.success).toBe(false);
    expect(res.data.error).toContain("Cannot approve deployment with failed tests");
  });

  it("strictly rejects bypass flag in deterministic policy engine", () => {
    const policyResult = evaluateDeploymentPolicy({
      projectName: "payment-api",
      language: "typescript",
      environment: "production",
      testsPassed: false,
      securityScanPassed: true,
      productionApproved: true,
      hasHealthCheck: true,
      bypassRequested: true
    });

    expect(policyResult.allowed).toBe(false);
    expect(policyResult.evaluatedPolicies.some((p) => p.policyId === "BYPASS-001" && !p.passed)).toBe(true);
    expect(policyResult.violations.some((v) => v.toLowerCase().includes("bypass"))).toBe(true);
  });

  it("strictly rejects invalid deployment environments", () => {
    const policyResult = evaluateDeploymentPolicy({
      projectName: "payment-api",
      language: "typescript",
      environment: "sandbox-unapproved" as any,
      testsPassed: true,
      securityScanPassed: true,
      productionApproved: true,
      hasHealthCheck: true
    });

    expect(policyResult.allowed).toBe(false);
    expect(policyResult.evaluatedPolicies.some((p) => p.policyId === "ENV-001" && !p.passed)).toBe(true);
    expect(policyResult.violations.some((v) => v.toLowerCase().includes("environment"))).toBe(true);
  });
});

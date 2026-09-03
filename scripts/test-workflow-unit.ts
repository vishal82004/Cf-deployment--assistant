/**
 * Cloudflare Workflow Unit Test Suite for DeployMate AI (Phase 7)
 *
 * Tests the 6 required scenarios:
 * 1. Successful workflow
 * 2. Failed test
 * 3. Failed security scan
 * 4. Failed health check
 * 5. Waiting for approval
 * 6. Approved production deployment
 */

import {
  DeploymentWorkflow,
  workflowStateRegistry,
  type DeploymentWorkflowParams,
  type WorkflowStepResult,
  type WorkflowRunSummary
} from "../src/workflow";
import type { WorkflowStep, WorkflowEvent, WorkflowStepContext } from "cloudflare:workers";

interface MockStepOptions {
  pauseOnApproval?: boolean;
  approvalEventPayload?: { approvedBy: string; notes?: string };
}

/**
 * Creates a deterministic mock WorkflowStep execution context to test
 * durable execution, retries, error handling, and event waiting.
 */
function createMockStep(options: MockStepOptions = {}) {
  const stepsExecuted: Array<{ name: string; retries: number; status: string }> = [];
  let isPausedWaiting = false;

  const mockStep: WorkflowStep = {
    do: async (name: string, arg2: any, arg3?: any) => {
      const config = typeof arg2 === "function" ? {} : arg2;
      const callback = typeof arg2 === "function" ? arg2 : arg3;

      let attempt = 0;
      const maxRetries = config.retries?.limit || 0;

      while (true) {
        attempt++;
        const ctx: WorkflowStepContext = {
          step: { name, count: 1 },
          attempt,
          config
        };

        try {
          const result = await callback(ctx);
          stepsExecuted.push({ name, retries: attempt - 1, status: "completed" });
          return result;
        } catch (err: any) {
          if (attempt <= maxRetries) {
            continue;
          }
          stepsExecuted.push({ name, retries: attempt - 1, status: "failed" });
          throw err;
        }
      }
    },
    sleep: async () => {},
    sleepUntil: async () => {},
    waitForEvent: async (name: string, eventConfig: any) => {
      stepsExecuted.push({ name, retries: 0, status: "waitForEvent" });
      if (options.pauseOnApproval) {
        isPausedWaiting = true;
        // Simulate waiting: throw a sentinel to interrupt execution if paused
        const pauseError: any = new Error("WORKFLOW_PAUSED_WAITING_FOR_EVENT");
        pauseError.isPause = true;
        throw pauseError;
      }
      return {
        type: eventConfig.type,
        timestamp: new Date(),
        payload: options.approvalEventPayload || { approvedBy: "Lead Engineer" }
      } as any;
    }
  };

  return { mockStep, stepsExecuted, isPaused: () => isPausedWaiting };
}

async function runTest() {
  console.log("Starting DeployMate AI Phase 7 Cloudflare Workflow Unit Tests...\n");
  let passedCount = 0;
  const totalScenarios = 6;

  // -------------------------------------------------------------------------
  // Scenario 1: Successful Staging Workflow
  // -------------------------------------------------------------------------
  try {
    const { mockStep } = createMockStep();
    const event: WorkflowEvent<DeploymentWorkflowParams> = {
      instanceId: "wf-staging-001",
      workflowName: "deployment-workflow",
      timestamp: new Date(),
      payload: {
        planId: "plan-staging-001",
        projectName: "payment-api",
        environment: "staging"
      }
    };

    const workflow = new (DeploymentWorkflow as any)({}, {});
    const summary = await workflow.run(event, mockStep);

    if (
      summary.status === "complete" &&
      summary.stepsCompleted.length === 9 &&
      summary.stepsCompleted[0].name === "Analyze project" &&
      summary.stepsCompleted[6].name === "Health check" &&
      summary.stepsCompleted[7].status === "skipped"
    ) {
      console.log("✅ PASS: [Scenario 1: Successful Staging Workflow] - All 7 steps passed, approval skipped for staging");
      passedCount++;
    } else {
      console.error("❌ FAIL: [Scenario 1: Successful Staging Workflow] - Unexpected summary:", summary);
    }
  } catch (err: any) {
    console.error("❌ FAIL: [Scenario 1: Successful Staging Workflow]:", err.message);
  }

  // -------------------------------------------------------------------------
  // Scenario 2: Failed Test Simulation
  // -------------------------------------------------------------------------
  try {
    const { mockStep, stepsExecuted } = createMockStep();
    const event: WorkflowEvent<DeploymentWorkflowParams> = {
      instanceId: "wf-fail-tests-002",
      workflowName: "deployment-workflow",
      timestamp: new Date(),
      payload: {
        planId: "plan-fail-tests-002",
        projectName: "payment-api",
        environment: "staging",
        simulateFailureStep: "tests"
      }
    };

    const workflow = new (DeploymentWorkflow as any)({}, {});
    let errorThrown = false;

    try {
      await workflow.run(event, mockStep);
    } catch (err: any) {
      errorThrown = true;
      const summary = workflowStateRegistry.get("plan-fail-tests-002");
      if (
        summary?.status === "failed" &&
        summary.error?.includes("test suite failed") &&
        stepsExecuted.some((s) => s.name === "Run tests" && s.status === "failed") &&
        !stepsExecuted.some((s) => s.name === "Deploy staging")
      ) {
        console.log("✅ PASS: [Scenario 2: Failed Test] - Pipeline halted at Step 3 without deploying to staging");
        passedCount++;
      } else {
        console.error("❌ FAIL: [Scenario 2: Failed Test] - Invalid state:", summary);
      }
    }

    if (!errorThrown) {
      console.error("❌ FAIL: [Scenario 2: Failed Test] - Error was not thrown on test failure");
    }
  } catch (err: any) {
    console.error("❌ FAIL: [Scenario 2: Failed Test]:", err.message);
  }

  // -------------------------------------------------------------------------
  // Scenario 3: Failed Security Scan Simulation
  // -------------------------------------------------------------------------
  try {
    const { mockStep, stepsExecuted } = createMockStep();
    const event: WorkflowEvent<DeploymentWorkflowParams> = {
      instanceId: "wf-fail-sec-003",
      workflowName: "deployment-workflow",
      timestamp: new Date(),
      payload: {
        planId: "plan-fail-sec-003",
        projectName: "payment-api",
        environment: "staging",
        simulateFailureStep: "securityScan"
      }
    };

    const workflow = new (DeploymentWorkflow as any)({}, {});
    let errorThrown = false;

    try {
      await workflow.run(event, mockStep);
    } catch (err: any) {
      errorThrown = true;
      const summary = workflowStateRegistry.get("plan-fail-sec-003");
      const secStep = stepsExecuted.find((s) => s.name === "Run security scan");

      if (
        summary?.status === "failed" &&
        summary.error?.includes("Security vulnerability scan detected") &&
        secStep?.retries === 0 // Critical guardrail: security scans MUST NOT retry
      ) {
        console.log("✅ PASS: [Scenario 3: Failed Security Scan] - Immediate halt on CVEs with zero retries");
        passedCount++;
      } else {
        console.error("❌ FAIL: [Scenario 3: Failed Security Scan] - Invalid state or retried:", summary);
      }
    }

    if (!errorThrown) {
      console.error("❌ FAIL: [Scenario 3: Failed Security Scan] - Error was not thrown on security scan failure");
    }
  } catch (err: any) {
    console.error("❌ FAIL: [Scenario 3: Failed Security Scan]:", err.message);
  }

  // -------------------------------------------------------------------------
  // Scenario 4: Failed Health Check Simulation
  // -------------------------------------------------------------------------
  try {
    const { mockStep, stepsExecuted } = createMockStep();
    const event: WorkflowEvent<DeploymentWorkflowParams> = {
      instanceId: "wf-fail-health-004",
      workflowName: "deployment-workflow",
      timestamp: new Date(),
      payload: {
        planId: "plan-fail-health-004",
        projectName: "payment-api",
        environment: "staging",
        simulateFailureStep: "healthCheck"
      }
    };

    const workflow = new (DeploymentWorkflow as any)({}, {});
    let errorThrown = false;

    try {
      await workflow.run(event, mockStep);
    } catch (err: any) {
      errorThrown = true;
      const summary = workflowStateRegistry.get("plan-fail-health-004");
      const healthStep = stepsExecuted.find((s) => s.name === "Health check");

      if (
        summary?.status === "failed" &&
        summary.error?.includes("HTTP health probe /health returned 503") &&
        healthStep &&
        healthStep.retries === 3 // Retriable step: health check attempted 3 retries
      ) {
        console.log("✅ PASS: [Scenario 4: Failed Health Check] - Attempted 3 retries before failing gracefully");
        passedCount++;
      } else {
        console.error("❌ FAIL: [Scenario 4: Failed Health Check] - Retries not attempted:", healthStep);
      }
    }

    if (!errorThrown) {
      console.error("❌ FAIL: [Scenario 4: Failed Health Check] - Error was not thrown");
    }
  } catch (err: any) {
    console.error("❌ FAIL: [Scenario 4: Failed Health Check]:", err.message);
  }

  // -------------------------------------------------------------------------
  // Scenario 5: Waiting for Production Approval
  // -------------------------------------------------------------------------
  try {
    const { mockStep } = createMockStep({ pauseOnApproval: true });
    const event: WorkflowEvent<DeploymentWorkflowParams> = {
      instanceId: "wf-wait-approval-005",
      workflowName: "deployment-workflow",
      timestamp: new Date(),
      payload: {
        planId: "plan-wait-approval-005",
        projectName: "payment-api",
        environment: "production"
      }
    };

    const workflow = new (DeploymentWorkflow as any)({}, {});
    try {
      await workflow.run(event, mockStep);
    } catch (err: any) {
      if (err.isPause) {
        const summary = workflowStateRegistry.get("plan-wait-approval-005");
        if (
          summary?.status === "waiting_approval" &&
          summary.currentStep === "Wait for production approval" &&
          summary.stepsCompleted.length === 7 // Steps 1-7 completed
        ) {
          console.log("✅ PASS: [Scenario 5: Waiting for Approval] - Paused at Step 8 with status 'waiting_approval'");
          passedCount++;
        } else {
          console.error("❌ FAIL: [Scenario 5: Waiting for Approval] - Unexpected state:", summary);
        }
      } else {
        throw err;
      }
    }
  } catch (err: any) {
    console.error("❌ FAIL: [Scenario 5: Waiting for Approval]:", err.message);
  }

  // -------------------------------------------------------------------------
  // Scenario 6: Approved Production Deployment
  // -------------------------------------------------------------------------
  try {
    const { mockStep, stepsExecuted } = createMockStep({
      pauseOnApproval: false,
      approvalEventPayload: { approvedBy: "Platform Lead Engineer" }
    });

    const event: WorkflowEvent<DeploymentWorkflowParams> = {
      instanceId: "wf-approved-prod-006",
      workflowName: "deployment-workflow",
      timestamp: new Date(),
      payload: {
        planId: "plan-approved-prod-006",
        projectName: "payment-api",
        environment: "production"
      }
    };

    const workflow = new (DeploymentWorkflow as any)({}, {});
    const summary = await workflow.run(event, mockStep);

    const step8 = summary.stepsCompleted.find((s: any) => s.stepId === 8);
    const step9 = summary.stepsCompleted.find((s: any) => s.stepId === 9);

    if (
      summary.status === "complete" &&
      step8?.status === "completed" &&
      step8.output.includes("Production approval granted by Platform Lead Engineer") &&
      step9?.status === "completed" &&
      step9.output.includes("Production deployment completed successfully")
    ) {
      console.log("✅ PASS: [Scenario 6: Approved Production Deployment] - Approval event received, production cutover complete");
      passedCount++;
    } else {
      console.error("❌ FAIL: [Scenario 6: Approved Production Deployment] - Invalid final state:", summary);
    }
  } catch (err: any) {
    console.error("❌ FAIL: [Scenario 6: Approved Production Deployment]:", err.message);
  }

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  console.log("\n======================================================================");
  console.log(`PHASE 7 CLOUDFLARE WORKFLOW TEST RESULTS: ${passedCount}/${totalScenarios} PASSED`);
  console.log("======================================================================");

  if (passedCount === totalScenarios) {
    console.log("🎉 ALL 6 WORKFLOW SCENARIOS PASSED WITH 100% SUCCESS!\n");
    process.exit(0);
  } else {
    console.error("❌ One or more workflow tests failed.");
    process.exit(1);
  }
}

runTest();

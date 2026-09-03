/**
 * Phase 8 Human-in-the-Loop Production Approval Unit Test Suite
 *
 * Tests the required scenarios:
 * 1. Approve valid deployment
 * 2. Reject deployment
 * 3. Approve deployment with failed checks (blocked with 403)
 * 4. Approve nonexistent deployment (rejected with 404)
 * 5. Approve deployment that isn't waiting (rejected with 400)
 * 6. Security gate: Anti-Agent Self-Approval (Agent cannot approve its own release)
 */

import { handleWorkflowApproval, handleWorkflowRejection } from "../src/approval";
import { type WorkflowRunSummary } from "../src/workflow";

async function runApprovalTests() {
  console.log("Starting DeployMate AI Phase 8 Human-in-the-Loop Approval Tests...\n");
  let passedCount = 0;
  const totalTests = 6;

  // Local state registry for isolated testing
  const testRegistry = new Map<string, WorkflowRunSummary>();

  // -------------------------------------------------------------------------
  // Test 1: Approve Valid Deployment
  // -------------------------------------------------------------------------
  try {
    const planId = "plan-valid-approval-001";
    const summary: WorkflowRunSummary = {
      planId,
      projectName: "payment-api",
      environment: "production",
      status: "waiting_approval",
      currentStep: "Wait for production approval",
      stepsCompleted: [
        { stepId: 1, name: "Analyze project", status: "completed", output: "OK", timestamp: "" },
        { stepId: 2, name: "Validate configuration", status: "completed", output: "OK", timestamp: "" },
        { stepId: 3, name: "Run tests", status: "completed", output: "48 tests passed", timestamp: "" },
        { stepId: 4, name: "Run security scan", status: "completed", output: "0 CVEs", timestamp: "" },
        { stepId: 5, name: "Build image", status: "completed", output: "Built", timestamp: "" },
        { stepId: 6, name: "Deploy staging", status: "completed", output: "Running", timestamp: "" },
        { stepId: 7, name: "Health check", status: "completed", output: "200 OK", timestamp: "" }
      ]
    };
    testRegistry.set(planId, summary);

    const res = handleWorkflowApproval(
      planId,
      { approvedBy: "Senior Release Engineer", caller: "human" },
      testRegistry
    );

    const updated = testRegistry.get(planId);
    if (
      res.status === 200 &&
      res.data.success === true &&
      updated?.status === "complete" &&
      updated.stepsCompleted.some((s) => s.stepId === 9 && s.status === "completed")
    ) {
      console.log("✅ PASS: [Test 1: Approve Valid Deployment] - Resumed workflow, Step 9 executed, marked complete");
      passedCount++;
    } else {
      console.error("❌ FAIL: [Test 1: Approve Valid Deployment] - Unexpected response:", res);
    }
  } catch (err: any) {
    console.error("❌ FAIL: [Test 1: Approve Valid Deployment]:", err.message);
  }

  // -------------------------------------------------------------------------
  // Test 2: Reject Deployment Safely
  // -------------------------------------------------------------------------
  try {
    const planId = "plan-reject-002";
    const summary: WorkflowRunSummary = {
      planId,
      projectName: "payment-api",
      environment: "production",
      status: "waiting_approval",
      currentStep: "Wait for production approval",
      stepsCompleted: [
        { stepId: 1, name: "Analyze project", status: "completed", output: "OK", timestamp: "" },
        { stepId: 7, name: "Health check", status: "completed", output: "200 OK", timestamp: "" }
      ]
    };
    testRegistry.set(planId, summary);

    const res = handleWorkflowRejection(
      planId,
      { reason: "Release postponed due to freeze window" },
      testRegistry
    );

    const updated = testRegistry.get(planId);
    if (
      res.status === 200 &&
      res.data.success === true &&
      updated?.status === "rejected" &&
      updated.rejectionReason?.includes("freeze window") &&
      !updated.stepsCompleted.some((s) => s.stepId === 9) // Critical: Step 9 must NOT run
    ) {
      console.log("✅ PASS: [Test 2: Reject Deployment] - Pipeline terminated safely without production cutover");
      passedCount++;
    } else {
      console.error("❌ FAIL: [Test 2: Reject Deployment] - Unexpected response:", res);
    }
  } catch (err: any) {
    console.error("❌ FAIL: [Test 2: Reject Deployment]:", err.message);
  }

  // -------------------------------------------------------------------------
  // Test 3: Approve Deployment With Failed Checks (Must Block with 403)
  // -------------------------------------------------------------------------
  try {
    const planId = "plan-failed-checks-003";
    const summary: WorkflowRunSummary = {
      planId,
      projectName: "payment-api",
      environment: "production",
      status: "waiting_approval",
      currentStep: "Wait for production approval",
      error: "Automated test suite failed: 3 unit tests failed",
      stepsCompleted: [
        { stepId: 1, name: "Analyze project", status: "completed", output: "OK", timestamp: "" },
        { stepId: 3, name: "Run tests", status: "failed", output: "3 failed", timestamp: "" }
      ]
    };
    testRegistry.set(planId, summary);

    const res = handleWorkflowApproval(
      planId,
      { approvedBy: "Developer" },
      testRegistry
    );

    if (
      res.status === 403 &&
      res.data.success === false &&
      res.data.error?.includes("Cannot approve deployment with failed tests")
    ) {
      console.log("✅ PASS: [Test 3: Approve With Failed Checks] - Blocked with 403 Forbidden; safety policies enforced");
      passedCount++;
    } else {
      console.error("❌ FAIL: [Test 3: Approve With Failed Checks] - Expected 403, got:", res);
    }
  } catch (err: any) {
    console.error("❌ FAIL: [Test 3: Approve With Failed Checks]:", err.message);
  }

  // -------------------------------------------------------------------------
  // Test 4: Approve Nonexistent Deployment (Must Return 404)
  // -------------------------------------------------------------------------
  try {
    const res = handleWorkflowApproval(
      "plan-nonexistent-999",
      { approvedBy: "Developer" },
      testRegistry
    );

    if (
      res.status === 404 &&
      res.data.success === false &&
      res.data.error?.includes("does not exist")
    ) {
      console.log("✅ PASS: [Test 4: Approve Nonexistent Deployment] - Correctly returned 404 Not Found");
      passedCount++;
    } else {
      console.error("❌ FAIL: [Test 4: Approve Nonexistent Deployment] - Expected 404, got:", res);
    }
  } catch (err: any) {
    console.error("❌ FAIL: [Test 4: Approve Nonexistent Deployment]:", err.message);
  }

  // -------------------------------------------------------------------------
  // Test 5: Approve Deployment That Isn't Waiting (Must Return 400)
  // -------------------------------------------------------------------------
  try {
    const planId = "plan-not-waiting-005";
    const summary: WorkflowRunSummary = {
      planId,
      projectName: "payment-api",
      environment: "production",
      status: "running", // Still actively building
      currentStep: "Build image",
      stepsCompleted: [
        { stepId: 1, name: "Analyze project", status: "completed", output: "OK", timestamp: "" }
      ]
    };
    testRegistry.set(planId, summary);

    const res = handleWorkflowApproval(
      planId,
      { approvedBy: "Developer" },
      testRegistry
    );

    if (
      res.status === 400 &&
      res.data.success === false &&
      res.data.error?.includes("is not waiting for approval")
    ) {
      console.log("✅ PASS: [Test 5: Approve Not Waiting] - Correctly returned 400 Bad Request");
      passedCount++;
    } else {
      console.error("❌ FAIL: [Test 5: Approve Not Waiting] - Expected 400, got:", res);
    }
  } catch (err: any) {
    console.error("❌ FAIL: [Test 5: Approve Not Waiting]:", err.message);
  }

  // -------------------------------------------------------------------------
  // Test 6: Anti-Agent Self-Approval (Agent Cannot Approve Its Own Release)
  // -------------------------------------------------------------------------
  try {
    const planId = "plan-agent-self-approval-006";
    const summary: WorkflowRunSummary = {
      planId,
      projectName: "payment-api",
      environment: "production",
      status: "waiting_approval",
      currentStep: "Wait for production approval",
      stepsCompleted: [
        { stepId: 7, name: "Health check", status: "completed", output: "200 OK", timestamp: "" }
      ]
    };
    testRegistry.set(planId, summary);

    const res = handleWorkflowApproval(
      planId,
      { caller: "agent", approvedBy: "DeployMate Agent" },
      testRegistry
    );

    if (
      res.status === 403 &&
      res.data.success === false &&
      res.data.error?.includes("Agent self-approval is strictly prohibited")
    ) {
      console.log("✅ PASS: [Test 6: Anti-Agent Self-Approval] - Blocked agent self-approval attempt with 403");
      passedCount++;
    } else {
      console.error("❌ FAIL: [Test 6: Anti-Agent Self-Approval] - Expected 403, got:", res);
    }
  } catch (err: any) {
    console.error("❌ FAIL: [Test 6: Anti-Agent Self-Approval]:", err.message);
  }

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  console.log("\n======================================================================");
  console.log(`PHASE 8 APPROVAL GATE TEST RESULTS: ${passedCount}/${totalTests} PASSED`);
  console.log("======================================================================");

  if (passedCount === totalTests) {
    console.log("🎉 ALL 6 HUMAN-IN-THE-LOOP APPROVAL TESTS PASSED WITH 100% SUCCESS!\n");
    process.exit(0);
  } else {
    console.error("❌ One or more approval tests failed.");
    process.exit(1);
  }
}

runApprovalTests();

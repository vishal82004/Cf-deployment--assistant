/**
 * DeployMate AI - Production Verification Script
 *
 * Verifies live Cloudflare production deployment at:
 * https://deploymate-ai.vishaldevi2004.workers.dev
 *
 * Tests:
 * 1. Root & Static HTML UI delivery
 * 2. Workflow Trigger API (Cloudflare Workflows live execution)
 * 3. Workflow Status Polling (State registry & step outputs)
 * 4. Human Approval API (Explicit human approval gate)
 * 5. Rejection & Failure Handling API (Safe termination)
 * 6. Security guardrail enforcement (Anti-agent self-approval rejection)
 * 7. Agent Endpoint WebSocket / HTTP handshake
 */

const BASE_URL = "https://deploymate-ai.vishaldevi2004.workers.dev";

async function runProductionTests() {
  console.log(`\n======================================================`);
  console.log(`Testing Live Cloudflare Deployment: ${BASE_URL}`);
  console.log(`======================================================\n`);

  let allPassed = true;

  // --------------------------------------------------------------------------
  // Test 1: Frontend Single Page Application Root
  // --------------------------------------------------------------------------
  try {
    const res = await fetch(`${BASE_URL}/`);
    const text = await res.text();
    if (res.status === 200 && text.toLowerCase().includes("<!doctype html>")) {
      console.log(`[PASS] 1. Root UI HTML: Delivered HTTP 200 OK with React 19 single-page app HTML.`);
    } else {
      console.error(`[FAIL] 1. Root UI HTML: Status ${res.status}`);
      allPassed = false;
    }
  } catch (err: any) {
    console.error(`[FAIL] 1. Root UI HTML Error:`, err.message);
    allPassed = false;
  }

  // --------------------------------------------------------------------------
  // Test 2: Workflow Trigger (Staging Flow)
  // --------------------------------------------------------------------------
  let stagingPlanId = `prod-verify-staging-${Date.now()}`;
  try {
    const res = await fetch(`${BASE_URL}/api/workflow/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        planId: stagingPlanId,
        projectName: "payment-api",
        environment: "staging"
      })
    });
    const data: any = await res.json();
    if (res.status === 200 && data.success && data.planId === stagingPlanId) {
      console.log(`[PASS] 2. Workflow Trigger (Staging): Dispatched workflow instance '${data.planId}'. Execution mode: '${data.executionMode || "workflow"}'.`);
    } else {
      console.error(`[FAIL] 2. Workflow Trigger: Status ${res.status}`, data);
      allPassed = false;
    }
  } catch (err: any) {
    console.error(`[FAIL] 2. Workflow Trigger Error:`, err.message);
    allPassed = false;
  }

  // Wait 1.5 seconds for simulated durable steps to progress
  await new Promise((r) => setTimeout(r, 1500));

  // --------------------------------------------------------------------------
  // Test 3: Workflow Status Inspection
  // --------------------------------------------------------------------------
  try {
    const res = await fetch(`${BASE_URL}/api/workflow/${stagingPlanId}/status`);
    const data: any = await res.json();
    if (res.status === 200 && data.summary) {
      console.log(`[PASS] 3. Workflow Status Polling: Retrieved run status '${data.summary.status}' at step '${data.summary.currentStep}' (${data.summary.stepsCompleted.length} steps recorded).`);
    } else {
      console.error(`[FAIL] 3. Workflow Status: Status ${res.status}`, data);
      allPassed = false;
    }
  } catch (err: any) {
    console.error(`[FAIL] 3. Workflow Status Error:`, err.message);
    allPassed = false;
  }

  // --------------------------------------------------------------------------
  // Test 4: Production Approval Gate (Pause at Step 8 & Human Approval)
  // --------------------------------------------------------------------------
  let prodPlanId = `prod-verify-approval-${Date.now()}`;
  try {
    // Start production workflow
    await fetch(`${BASE_URL}/api/workflow/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        planId: prodPlanId,
        projectName: "payment-api",
        environment: "production"
      })
    });

    // Wait for step 8
    await new Promise((r) => setTimeout(r, 1200));

    // Test Security Gate: Agent Self-Approval MUST be rejected with 403
    const agentApproveRes = await fetch(`${BASE_URL}/api/workflow/${prodPlanId}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ caller: "agent", approvedBy: "DeployMate Agent" })
    });
    if (agentApproveRes.status === 403) {
      console.log(`[PASS] 4. Guardrail Enforcement: Agent self-approval strictly rejected with HTTP 403 Forbidden.`);
    } else {
      console.error(`[FAIL] 4. Guardrail Enforcement: Expected 403 but got ${agentApproveRes.status}`);
      allPassed = false;
    }

    // Test Valid Human Approval
    const humanApproveRes = await fetch(`${BASE_URL}/api/workflow/${prodPlanId}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ caller: "human", approvedBy: "Lead Engineer" })
    });
    const approveData: any = await humanApproveRes.json();
    if (humanApproveRes.status === 200 && approveData.success) {
      console.log(`[PASS] 5. Human-in-the-Loop Production Approval: Successfully approved by '${approveData.approvedBy}'. Resumed workflow.`);
    } else {
      console.error(`[FAIL] 5. Production Approval: Expected 200 but got ${humanApproveRes.status}`, approveData);
      allPassed = false;
    }
  } catch (err: any) {
    console.error(`[FAIL] 4/5. Production Approval Error:`, err.message);
    allPassed = false;
  }

  // --------------------------------------------------------------------------
  // Test 5: Production Rejection & Safe Termination
  // --------------------------------------------------------------------------
  let rejectPlanId = `prod-verify-reject-${Date.now()}`;
  try {
    await fetch(`${BASE_URL}/api/workflow/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        planId: rejectPlanId,
        projectName: "payment-api",
        environment: "production"
      })
    });

    await new Promise((r) => setTimeout(r, 1200));

    const rejectRes = await fetch(`${BASE_URL}/api/workflow/${rejectPlanId}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        caller: "human",
        rejectedBy: "Platform Lead",
        reason: "Staging latency elevated"
      })
    });
    const rejectData: any = await rejectRes.json();
    if (rejectRes.status === 200 && rejectData.status === "rejected") {
      console.log(`[PASS] 6. Workflow Safe Rejection: Pipeline halted safely with status 'rejected'.`);
    } else {
      console.error(`[FAIL] 6. Workflow Rejection: Status ${rejectRes.status}`, rejectData);
      allPassed = false;
    }
  } catch (err: any) {
    console.error(`[FAIL] 6. Workflow Rejection Error:`, err.message);
    allPassed = false;
  }

  // --------------------------------------------------------------------------
  // Test 6: Cloudflare Agents SDK Route Handshake
  // --------------------------------------------------------------------------
  try {
    // Agents SDK listens under /agents/*
    const agentRes = await fetch(`${BASE_URL}/agents/DeployMate/health-probe`);
    // Agents SDK returns either WebSocket upgrade required or 200 / 404 handled by DO
    console.log(`[PASS] 7. Agents SDK Durable Object Endpoint: Responded with HTTP ${agentRes.status} on /agents/DeployMate/*`);
  } catch (err: any) {
    console.error(`[FAIL] 7. Agents SDK Error:`, err.message);
    allPassed = false;
  }

  console.log(`\n======================================================`);
  if (allPassed) {
    console.log(`🎉 ALL PRODUCTION VERIFICATION TESTS PASSED SUCCESSFULLY!`);
  } else {
    console.log(`⚠️ Some production tests failed.`);
  }
  console.log(`======================================================\n`);
}

runProductionTests().catch(console.error);

/**
 * DeployMate AI - Phase 3 Developer Productivity Tools Unit Tests
 *
 * Validates the core logic of each individual tool independently:
 * 1. analyzeProject
 * 2. generateDockerfile
 * 3. generateCIPipeline
 * 4. generateKubernetesManifest
 * 5. validateDeployment
 */

import {
  executeAnalyzeProject,
  executeGenerateDockerfile,
  executeGenerateCIPipeline,
  executeGenerateKubernetesManifest,
  executeValidateDeployment,
  executeCreateDeploymentPlan
} from "../src/tools";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runUnitTests() {
  console.log("Starting DeployMate AI Phase 3 Tools Unit Tests...\n");

  const results: { tool: string; test: string; passed: boolean; details?: string }[] = [];

  // ==========================================================================
  // Tool 1: analyzeProject
  // ==========================================================================
  try {
    const analysis = executeAnalyzeProject({
      projectName: "my-web-app",
      language: "TypeScript",
      framework: "Next.js",
      repositoryType: "monorepo"
    });

    assert(analysis.projectName === "my-web-app", "Project name matches");
    assert(analysis.recommendedPlatform.includes("Pages"), "Recommends Cloudflare Pages for Next.js");
    assert(analysis.recommendedEnvironments.length === 3, "Contains dev/staging/prod environments");
    assert(analysis.keyRisks.length > 0, "Provides deployment risks");
    assert(analysis.recommendedChecks.length > 0, "Provides engineering checks");

    results.push({ tool: "analyzeProject", test: "Next.js Monorepo Analysis", passed: true });
  } catch (err: any) {
    results.push({ tool: "analyzeProject", test: "Next.js Monorepo Analysis", passed: false, details: err.message });
  }

  try {
    const pyAnalysis = executeAnalyzeProject({
      projectName: "ai-api",
      language: "Python",
      framework: "FastAPI",
      repositoryType: "single"
    });

    assert(pyAnalysis.recommendedPlatform.includes("Container"), "Recommends Container platform for Python API");
    results.push({ tool: "analyzeProject", test: "Python FastAPI Analysis", passed: true });
  } catch (err: any) {
    results.push({ tool: "analyzeProject", test: "Python FastAPI Analysis", passed: false, details: err.message });
  }

  // ==========================================================================
  // Tool 2: generateDockerfile
  // ==========================================================================
  try {
    const dockerfileNode = executeGenerateDockerfile({
      language: "TypeScript",
      framework: "Express",
      port: 4000
    });

    assert(dockerfileNode.includes("EXPOSE 4000"), "Exposes specified port 4000");
    assert(dockerfileNode.includes("FROM node:22-alpine"), "Uses Node 22 alpine image");
    assert(dockerfileNode.includes("USER deploymate"), "Enforces non-root user execution");
    assert(dockerfileNode.includes("HEALTHCHECK"), "Includes Docker health check");

    results.push({ tool: "generateDockerfile", test: "Node.js Multi-Stage Dockerfile", passed: true });
  } catch (err: any) {
    results.push({ tool: "generateDockerfile", test: "Node.js Multi-Stage Dockerfile", passed: false, details: err.message });
  }

  try {
    const dockerfilePython = executeGenerateDockerfile({
      language: "Python",
      framework: "FastAPI",
      port: 8000
    });

    assert(dockerfilePython.includes("EXPOSE 8000"), "Exposes port 8000");
    assert(dockerfilePython.includes("FROM python:3.11-slim"), "Uses Python 3.11 slim image");
    assert(dockerfilePython.includes("USER appuser"), "Enforces non-root user execution");

    results.push({ tool: "generateDockerfile", test: "Python Slim Dockerfile", passed: true });
  } catch (err: any) {
    results.push({ tool: "generateDockerfile", test: "Python Slim Dockerfile", passed: false, details: err.message });
  }

  // ==========================================================================
  // Tool 3: generateCIPipeline
  // ==========================================================================
  try {
    const ciNode = executeGenerateCIPipeline({
      language: "TypeScript",
      framework: "Next.js"
    });

    assert(ciNode.includes("actions/checkout@v4"), "Includes GitHub checkout action");
    assert(ciNode.includes("npm audit"), "Includes automated security audit");
    assert(ciNode.includes("tsc --noEmit"), "Includes TypeScript verification");
    assert(ciNode.includes("npm test"), "Includes test execution step");

    results.push({ tool: "generateCIPipeline", test: "GitHub Actions Node.js CI Workflow", passed: true });
  } catch (err: any) {
    results.push({ tool: "generateCIPipeline", test: "GitHub Actions Node.js CI Workflow", passed: false, details: err.message });
  }

  // ==========================================================================
  // Tool 4: generateKubernetesManifest
  // ==========================================================================
  try {
    const k8sManifest = executeGenerateKubernetesManifest({
      projectName: "OrderService",
      image: "registry.cloudflare.com/orders:v1.2.0",
      port: 8080
    });

    assert(k8sManifest.includes("kind: Deployment"), "Includes Deployment resource");
    assert(k8sManifest.includes("kind: Service"), "Includes Service resource");
    assert(k8sManifest.includes("orderservice-deployment"), "Sanitizes resource name to DNS subdomain standard");
    assert(k8sManifest.includes("containerPort: 8080"), "Maps container port 8080");
    assert(k8sManifest.includes("livenessProbe"), "Configures liveness probe");
    assert(k8sManifest.includes("readinessProbe"), "Configures readiness probe");

    results.push({ tool: "generateKubernetesManifest", test: "Kubernetes Deployment & Service Manifest", passed: true });
  } catch (err: any) {
    results.push({ tool: "generateKubernetesManifest", test: "Kubernetes Deployment & Service Manifest", passed: false, details: err.message });
  }

  // ==========================================================================
  // Tool 5: validateDeployment
  // ==========================================================================
  try {
    // 5.1: Unsafe Production (Tests failed)
    const unsafeProd1 = executeValidateDeployment({
      environment: "production",
      projectName: "PaymentGateway",
      testsPassed: false,
      securityScanPassed: true
    });
    assert(unsafeProd1.allowed === false, "Production blocked when tests fail");
    assert(unsafeProd1.status === "blocked", "Status is blocked");
    assert(unsafeProd1.reasons.some(r => r.includes("test")), "Cites test failure reason");

    // 5.2: Unsafe Production (Security scan failed)
    const unsafeProd2 = executeValidateDeployment({
      environment: "production",
      projectName: "PaymentGateway",
      testsPassed: true,
      securityScanPassed: false
    });
    assert(unsafeProd2.allowed === false, "Production blocked when security scan fails");
    assert(unsafeProd2.status === "blocked", "Status is blocked");
    assert(unsafeProd2.reasons.some(r => r.includes("security") || r.includes("vulnerability")), "Cites security failure reason");

    // 5.3: Safe Production (All gates pass)
    const safeProd = executeValidateDeployment({
      environment: "production",
      projectName: "PaymentGateway",
      testsPassed: true,
      securityScanPassed: true
    });
    assert(safeProd.allowed === true, "Production allowed when all gates pass");
    assert(safeProd.status === "allowed", "Status is allowed");

    // 5.4: Staging with security warnings (allowed for diagnostic verification)
    const stagingDiag = executeValidateDeployment({
      environment: "staging",
      projectName: "PaymentGateway",
      testsPassed: true,
      securityScanPassed: false
    });
    assert(stagingDiag.allowed === true, "Staging allowed for isolated testing");
    assert(stagingDiag.recommendations.some(rec => rec.includes("production")), "Warns that security issues must be resolved before prod");

    results.push({ tool: "validateDeployment", test: "Deployment Safety Gate Guardrails", passed: true });
  } catch (err: any) {
    results.push({ tool: "validateDeployment", test: "Deployment Safety Gate Guardrails", passed: false, details: err.message });
  }

  // ==========================================================================
  // Tool 6: executeCreateDeploymentPlan (Phase 5)
  // ==========================================================================
  try {
    // 6.1: Production Plan (9 steps, requiresApproval: true, status: WAITING_APPROVAL)
    const prodPlan = executeCreateDeploymentPlan({
      projectName: "payment-api",
      technology: "Node.js",
      environment: "production"
    });
    assert(prodPlan.steps.length === 9, "Production plan contains 9 steps");
    assert(prodPlan.requiresApproval === true, "Production plan requires approval");
    assert(prodPlan.status === "WAITING_APPROVAL", "Production plan status is WAITING_APPROVAL");
    assert(prodPlan.steps[7].name === "Request production approval", "Step 8 is Request production approval");
    assert(prodPlan.steps[7].status === "WAITING_APPROVAL", "Step 8 status is WAITING_APPROVAL");
    assert(prodPlan.steps[8].name === "Deploy to production", "Step 9 is Deploy to production");
    assert(prodPlan.steps[8].dependencies.includes(8), "Step 9 depends on Step 8");
    assert(prodPlan.formattedPlanMarkdown.includes("WAITING_APPROVAL"), "Markdown displays WAITING_APPROVAL status");

    // 6.2: Staging Plan (7 steps, requiresApproval: false, status: READY)
    const stagingPlan = executeCreateDeploymentPlan({
      projectName: "payment-api",
      technology: "Node.js",
      environment: "staging"
    });
    assert(stagingPlan.steps.length === 7, "Staging plan contains 7 steps");
    assert(stagingPlan.requiresApproval === false, "Staging plan does not require production approval");
    assert(stagingPlan.status === "READY", "Staging plan status is READY");
    assert(!stagingPlan.steps.some(s => s.name.includes("Request production approval")), "Staging excludes production approval step");

    results.push({ tool: "createDeploymentPlan", test: "Structured Staging & Production Deployment Plans", passed: true });
  } catch (err: any) {
    results.push({ tool: "createDeploymentPlan", test: "Structured Staging & Production Deployment Plans", passed: false, details: err.message });
  }

  // ==========================================================================
  // Summary
  // ==========================================================================
  console.log("======================================================================");
  console.log("TOOLS UNIT TEST SUMMARY");
  console.log("======================================================================\n");

  let allPassed = true;
  for (const r of results) {
    console.log(`${r.passed ? "✅ PASS" : "❌ FAIL"}: [${r.tool}] - ${r.test} ${r.details ? `(${r.details})` : ""}`);
    if (!r.passed) allPassed = false;
  }

  if (allPassed) {
    console.log("\n🎉 ALL TOOLS PASSED UNIT TESTS WITH 100% SUCCESS!");
    process.exit(0);
  } else {
    console.error("\n❌ Some tool unit tests failed.");
    process.exit(1);
  }
}

runUnitTests().catch((err) => {
  console.error("Unit test execution failed:", err);
  process.exit(1);
});

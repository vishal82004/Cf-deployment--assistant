/**
 * DeployMate AI - Phase 6 Engineering Guardrails Unit Tests
 *
 * Validates deterministic policy engine evaluation across all policies and combinations:
 * 1. All production policies pass -> Allowed
 * 2. Tests fail -> Blocked (TEST-001)
 * 3. Security scan fails -> Blocked (SEC-001)
 * 4. Missing production approval -> Blocked (APPR-001)
 * 5. Missing health check -> Blocked (HEALTH-001)
 * 6. Missing project information -> Blocked (META-001)
 * 7. Invalid environment -> Blocked (ENV-001)
 * 8. Bypass attempt rejected -> Blocked (BYPASS-001)
 * 9. Kubernetes missing resource limits -> Blocked (K8S-001)
 * 10. Kubernetes missing required labels -> Blocked (K8S-002)
 * 11. Kubernetes missing security context -> Blocked (K8S-003)
 * 12. Kubernetes fully compliant -> Allowed
 */

import { evaluateDeploymentPolicy } from "../src/policies";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function runUnitTests() {
  console.log("Starting DeployMate AI Phase 6 Policy Engine Unit Tests...\n");

  const results: { test: string; passed: boolean; details?: string }[] = [];

  // ==========================================================================
  // Test 1: Full Compliance (Production) -> Allowed
  // ==========================================================================
  try {
    const res = evaluateDeploymentPolicy({
      projectName: "payment-api",
      language: "Node.js",
      environment: "production",
      testsPassed: true,
      securityScanPassed: true,
      productionApproved: true,
      hasHealthCheck: true
    });
    assert(res.allowed === true, "Production allowed when all gates pass");
    assert(res.violations.length === 0, "No violations reported");
    assert(res.evaluatedPolicies.every(p => p.passed), "All evaluated policies passed");
    results.push({ test: "1. Full Compliance (Production)", passed: true, details: "Allowed with 0 violations" });
  } catch (err: any) {
    results.push({ test: "1. Full Compliance (Production)", passed: false, details: err.message });
  }

  // ==========================================================================
  // Test 2: Tests Fail -> Blocked
  // ==========================================================================
  try {
    const res = evaluateDeploymentPolicy({
      projectName: "payment-api",
      language: "Node.js",
      environment: "production",
      testsPassed: false,
      securityScanPassed: true,
      productionApproved: true,
      hasHealthCheck: true
    });
    assert(res.allowed === false, "Blocked when tests fail");
    assert(res.violations.some(v => v.toLowerCase().includes("test")), "Cites automated test failure");
    assert(res.recommendations.some(r => r.toLowerCase().includes("test")), "Provides test remediation advice");
    results.push({ test: "2. Failing Tests Gate", passed: true, details: "Blocked due to failing test suite" });
  } catch (err: any) {
    results.push({ test: "2. Failing Tests Gate", passed: false, details: err.message });
  }

  // ==========================================================================
  // Test 3: Security Scan Fails -> Blocked
  // ==========================================================================
  try {
    const res = evaluateDeploymentPolicy({
      projectName: "payment-api",
      language: "Node.js",
      environment: "production",
      testsPassed: true,
      securityScanPassed: false,
      productionApproved: true,
      hasHealthCheck: true
    });
    assert(res.allowed === false, "Blocked when security scan fails");
    assert(res.violations.some(v => v.toLowerCase().includes("security") || v.toLowerCase().includes("vulnerabilit")), "Cites security scan failure");
    assert(res.recommendations.some(r => r.toLowerCase().includes("audit") || r.toLowerCase().includes("snyk")), "Provides vulnerability remediation advice");
    results.push({ test: "3. Failing Security Scan Gate", passed: true, details: "Blocked due to unresolved vulnerabilities" });
  } catch (err: any) {
    results.push({ test: "3. Failing Security Scan Gate", passed: false, details: err.message });
  }

  // ==========================================================================
  // Test 4: Missing Production Approval -> Blocked
  // ==========================================================================
  try {
    const res = evaluateDeploymentPolicy({
      projectName: "payment-api",
      language: "Node.js",
      environment: "production",
      testsPassed: true,
      securityScanPassed: true,
      productionApproved: false,
      hasHealthCheck: true
    });
    assert(res.allowed === false, "Blocked when production approval missing");
    assert(res.violations.some(v => v.toLowerCase().includes("approval")), "Cites approval requirement");
    results.push({ test: "4. Missing Production Approval Gate", passed: true, details: "Blocked pending manual release sign-off" });
  } catch (err: any) {
    results.push({ test: "4. Missing Production Approval Gate", passed: false, details: err.message });
  }

  // ==========================================================================
  // Test 5: Missing Health Check -> Blocked
  // ==========================================================================
  try {
    const res = evaluateDeploymentPolicy({
      projectName: "payment-api",
      language: "Node.js",
      environment: "production",
      testsPassed: true,
      securityScanPassed: true,
      productionApproved: true,
      hasHealthCheck: false
    });
    assert(res.allowed === false, "Blocked when health check probe is missing");
    assert(res.violations.some(v => v.toLowerCase().includes("health check")), "Cites health check violation");
    results.push({ test: "5. Missing Health Check Gate", passed: true, details: "Blocked due to missing health probe" });
  } catch (err: any) {
    results.push({ test: "5. Missing Health Check Gate", passed: false, details: err.message });
  }

  // ==========================================================================
  // Test 6: Missing Project Metadata -> Blocked
  // ==========================================================================
  try {
    const res = evaluateDeploymentPolicy({
      projectName: "",
      language: "",
      environment: "production",
      testsPassed: true,
      securityScanPassed: true,
      productionApproved: true
    });
    assert(res.allowed === false, "Blocked when project metadata is absent");
    assert(res.violations.some(v => v.toLowerCase().includes("project information")), "Cites missing metadata");
    results.push({ test: "6. Missing Project Information", passed: true, details: "Blocked due to missing project name/language" });
  } catch (err: any) {
    results.push({ test: "6. Missing Project Information", passed: false, details: err.message });
  }

  // ==========================================================================
  // Test 7: Invalid Environment -> Blocked
  // ==========================================================================
  try {
    const res = evaluateDeploymentPolicy({
      projectName: "payment-api",
      language: "Node.js",
      environment: "sandbox-unsupported",
      testsPassed: true,
      securityScanPassed: true
    });
    assert(res.allowed === false, "Blocked when environment is invalid");
    assert(res.violations.some(v => v.toLowerCase().includes("valid environment")), "Cites invalid environment");
    results.push({ test: "7. Invalid Target Environment", passed: true, details: "Blocked due to unsupported environment" });
  } catch (err: any) {
    results.push({ test: "7. Invalid Target Environment", passed: false, details: err.message });
  }

  // ==========================================================================
  // Test 8: Bypass Attempt Rejected -> Blocked
  // ==========================================================================
  try {
    const res = evaluateDeploymentPolicy({
      projectName: "payment-api",
      language: "Node.js",
      environment: "production",
      testsPassed: false,
      securityScanPassed: false,
      productionApproved: false,
      bypassRequested: true
    });
    assert(res.allowed === false, "Bypass is strictly prohibited");
    assert(res.violations.some(v => v.toLowerCase().includes("bypass")), "Cites zero-bypass prohibition");
    results.push({ test: "8. Guardrail Bypass Prohibition", passed: true, details: "Strictly rejected attempt to bypass failing checks" });
  } catch (err: any) {
    results.push({ test: "8. Guardrail Bypass Prohibition", passed: false, details: err.message });
  }

  // ==========================================================================
  // Test 9: Kubernetes Missing Resource Limits -> Blocked
  // ==========================================================================
  try {
    const res = evaluateDeploymentPolicy({
      projectName: "payment-api",
      language: "Node.js",
      environment: "production",
      testsPassed: true,
      securityScanPassed: true,
      productionApproved: true,
      targetPlatform: "kubernetes",
      k8sConfig: {
        hasResourceLimits: false,
        hasRequiredLabels: true,
        hasSecurityContext: true
      }
    });
    assert(res.allowed === false, "K8s blocked when resource limits missing");
    assert(res.violations.some(v => v.toLowerCase().includes("resource limits")), "Cites missing resource limits");
    results.push({ test: "9. Kubernetes Resource Limits Policy", passed: true, details: "Blocked due to missing CPU/memory limits" });
  } catch (err: any) {
    results.push({ test: "9. Kubernetes Resource Limits Policy", passed: false, details: err.message });
  }

  // ==========================================================================
  // Test 10: Kubernetes Missing Required Labels -> Blocked
  // ==========================================================================
  try {
    const res = evaluateDeploymentPolicy({
      projectName: "payment-api",
      language: "Node.js",
      environment: "production",
      testsPassed: true,
      securityScanPassed: true,
      productionApproved: true,
      targetPlatform: "kubernetes",
      k8sConfig: {
        hasResourceLimits: true,
        hasRequiredLabels: false,
        hasSecurityContext: true
      }
    });
    assert(res.allowed === false, "K8s blocked when standard labels missing");
    assert(res.violations.some(v => v.toLowerCase().includes("labels")), "Cites missing labels");
    results.push({ test: "10. Kubernetes Standard Labels Policy", passed: true, details: "Blocked due to missing app/env/version labels" });
  } catch (err: any) {
    results.push({ test: "10. Kubernetes Standard Labels Policy", passed: false, details: err.message });
  }

  // ==========================================================================
  // Test 11: Kubernetes Missing Security Context -> Blocked
  // ==========================================================================
  try {
    const res = evaluateDeploymentPolicy({
      projectName: "payment-api",
      language: "Node.js",
      environment: "production",
      testsPassed: true,
      securityScanPassed: true,
      productionApproved: true,
      targetPlatform: "kubernetes",
      k8sConfig: {
        hasResourceLimits: true,
        hasRequiredLabels: true,
        hasSecurityContext: false
      }
    });
    assert(res.allowed === false, "K8s blocked when security context missing");
    assert(res.violations.some(v => v.toLowerCase().includes("security context")), "Cites missing security context");
    results.push({ test: "11. Kubernetes Security Context Policy", passed: true, details: "Blocked due to missing non-root security context" });
  } catch (err: any) {
    results.push({ test: "11. Kubernetes Security Context Policy", passed: false, details: err.message });
  }

  // ==========================================================================
  // Test 12: Kubernetes Full Compliance -> Allowed
  // ==========================================================================
  try {
    const res = evaluateDeploymentPolicy({
      projectName: "payment-api",
      language: "Node.js",
      environment: "production",
      testsPassed: true,
      securityScanPassed: true,
      productionApproved: true,
      targetPlatform: "kubernetes",
      k8sConfig: {
        hasResourceLimits: true,
        hasRequiredLabels: true,
        hasSecurityContext: true
      }
    });
    assert(res.allowed === true, "K8s allowed when fully compliant");
    assert(res.violations.length === 0, "0 violations on compliant K8s spec");
    results.push({ test: "12. Kubernetes Full Compliance", passed: true, details: "Allowed with resource limits, labels, and security context" });
  } catch (err: any) {
    results.push({ test: "12. Kubernetes Full Compliance", passed: false, details: err.message });
  }

  // ==========================================================================
  // Summary
  // ==========================================================================
  console.log("======================================================================");
  console.log("PHASE 6 POLICY ENGINE UNIT TEST SUMMARY");
  console.log("======================================================================\n");

  let allPassed = true;
  for (const r of results) {
    console.log(`${r.passed ? "✅ PASS" : "❌ FAIL"}: [${r.test}] - ${r.details || ""}`);
    if (!r.passed) allPassed = false;
  }

  if (allPassed) {
    console.log(`\n🎉 ALL ${results.length} POLICY UNIT TESTS PASSED WITH 100% SUCCESS!`);
    process.exit(0);
  } else {
    console.error("\n❌ Some policy unit tests failed.");
    process.exit(1);
  }
}

runUnitTests();

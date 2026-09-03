import { describe, it, expect } from "vitest";
import { evaluateDeploymentPolicy } from "../../src/policies";

describe("Unit Tests: Deployment Policy Engine", () => {
  const baseContext = {
    projectName: "payment-api",
    language: "Node.js",
    environment: "production" as const,
    testsPassed: true,
    securityScanPassed: true,
    productionApproved: true,
    hasHealthCheck: true
  };

  it("evaluates a fully compliant production deployment as allowed", () => {
    const result = evaluateDeploymentPolicy(baseContext);
    expect(result.allowed).toBe(true);
    expect(result.violations).toHaveLength(0);
    expect(result.evaluatedPolicies.every((p) => p.passed)).toBe(true);
  });

  it("strictly blocks deployment when tests have failed", () => {
    const result = evaluateDeploymentPolicy({ ...baseContext, testsPassed: false });
    expect(result.allowed).toBe(false);
    expect(result.violations.some((v) => v.toLowerCase().includes("test"))).toBe(true);
  });

  it("strictly blocks deployment when security scan has failed", () => {
    const result = evaluateDeploymentPolicy({ ...baseContext, securityScanPassed: false });
    expect(result.allowed).toBe(false);
    expect(result.violations.some((v) => v.toLowerCase().includes("security") || v.toLowerCase().includes("vulnerabilit"))).toBe(true);
  });

  it("strictly blocks production deployment when human approval is missing", () => {
    const result = evaluateDeploymentPolicy({ ...baseContext, productionApproved: false });
    expect(result.allowed).toBe(false);
    expect(result.violations.some((v) => v.toLowerCase().includes("approval"))).toBe(true);
  });

  it("strictly blocks production deployment when health check probe is missing", () => {
    const result = evaluateDeploymentPolicy({ ...baseContext, hasHealthCheck: false });
    expect(result.allowed).toBe(false);
    expect(result.violations.some((v) => v.toLowerCase().includes("health check"))).toBe(true);
  });

  it("strictly blocks deployment when required project info is missing", () => {
    const result = evaluateDeploymentPolicy({ ...baseContext, projectName: "", language: "" });
    expect(result.allowed).toBe(false);
    expect(result.violations.some((v) => v.toLowerCase().includes("project information"))).toBe(true);
  });

  it("strictly blocks attempts to bypass failed guardrails", () => {
    const result = evaluateDeploymentPolicy({
      ...baseContext,
      testsPassed: false,
      bypassRequested: true
    });
    expect(result.allowed).toBe(false);
    expect(result.violations.some((v) => v.toLowerCase().includes("bypass"))).toBe(true);
  });

  it("enforces Kubernetes resource limits policy", () => {
    const result = evaluateDeploymentPolicy({
      ...baseContext,
      targetPlatform: "kubernetes",
      k8sConfig: {
        hasResourceLimits: false,
        hasRequiredLabels: true,
        hasSecurityContext: true
      }
    });
    expect(result.allowed).toBe(false);
    expect(result.violations.some((v) => v.toLowerCase().includes("resource limits"))).toBe(true);
  });

  it("enforces Kubernetes standard labels policy", () => {
    const result = evaluateDeploymentPolicy({
      ...baseContext,
      targetPlatform: "kubernetes",
      k8sConfig: {
        hasResourceLimits: true,
        hasRequiredLabels: false,
        hasSecurityContext: true
      }
    });
    expect(result.allowed).toBe(false);
    expect(result.violations.some((v) => v.toLowerCase().includes("labels"))).toBe(true);
  });

  it("enforces Kubernetes non-root security context policy", () => {
    const result = evaluateDeploymentPolicy({
      ...baseContext,
      targetPlatform: "kubernetes",
      k8sConfig: {
        hasResourceLimits: true,
        hasRequiredLabels: true,
        hasSecurityContext: false
      }
    });
    expect(result.allowed).toBe(false);
    expect(result.violations.some((v) => v.toLowerCase().includes("security context") || v.toLowerCase().includes("non-root"))).toBe(true);
  });
});

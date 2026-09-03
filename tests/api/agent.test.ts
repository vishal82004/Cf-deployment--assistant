import { describe, it, expect } from "vitest";
import {
  deployMateTools,
  executeCreateDeploymentPlan,
  executeValidateDeployment
} from "../../src/tools";

describe("API / Agent Tests: Intent, Tools, and Request Handling", () => {
  it("exposes all required tools for the DeployMate agent", () => {
    expect(deployMateTools.analyzeProject).toBeDefined();
    expect(deployMateTools.generateDockerfile).toBeDefined();
    expect(deployMateTools.generateCIPipeline).toBeDefined();
    expect(deployMateTools.generateKubernetesManifest).toBeDefined();
    expect(deployMateTools.validateDeployment).toBeDefined();
    expect(deployMateTools.createDeploymentPlan).toBeDefined();
    expect(deployMateTools.triggerDeploymentWorkflow).toBeDefined();
    expect(deployMateTools.getWorkflowStatus).toBeDefined();
    expect(deployMateTools.approveProductionDeployment).toBeDefined();
  });

  it("handles a deployment request by generating a structured deployment plan", () => {
    const plan = executeCreateDeploymentPlan({
      projectName: "payment-api",
      environment: "production",
      technology: "Node.js"
    });

    expect(plan.id).toBeDefined();
    expect(plan.projectName).toBe("payment-api");
    expect(plan.environment).toBe("production");
    expect(plan.steps).toHaveLength(9);
    expect(plan.requiresApproval).toBe(true);
  });

  it("handles failing tests gracefully during deployment validation", () => {
    const validation = executeValidateDeployment({
      projectName: "payment-api",
      environment: "production",
      testsPassed: false,
      securityScanPassed: true
    });

    expect(validation.allowed).toBe(false);
    expect(validation.status).toBe("blocked");
    expect(validation.reasons.some((r) => r.toLowerCase().includes("test"))).toBe(true);
  });

  it("rejects production deployments with security scan failures", () => {
    const validation = executeValidateDeployment({
      projectName: "payment-api",
      environment: "production",
      testsPassed: true,
      securityScanPassed: false
    });

    expect(validation.allowed).toBe(false);
    expect(validation.status).toBe("blocked");
    expect(validation.reasons.some((r) => r.toLowerCase().includes("security"))).toBe(true);
  });

  it("correctly invokes and validates deployment safety gates when all checks pass", () => {
    const passed = executeValidateDeployment({
      projectName: "payment-api",
      environment: "production",
      testsPassed: true,
      securityScanPassed: true
    });

    expect(passed.allowed).toBe(true);
    expect(passed.status).toBe("allowed");
  });
});

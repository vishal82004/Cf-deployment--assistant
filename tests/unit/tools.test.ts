import { describe, it, expect } from "vitest";
import {
  executeAnalyzeProject,
  executeGenerateDockerfile,
  executeGenerateCIPipeline,
  executeGenerateKubernetesManifest,
  executeCreateDeploymentPlan,
  executeValidateDeployment
} from "../../src/tools";

describe("Unit Tests: Individual Deployment Tools", () => {
  it("analyzes a TypeScript Next.js repository correctly", () => {
    const analysis = executeAnalyzeProject({
      projectName: "my-web-app",
      language: "TypeScript",
      framework: "Next.js",
      repositoryType: "monorepo"
    });

    expect(analysis.projectName).toBe("my-web-app");
    expect(analysis.recommendedPlatform).toContain("Pages");
    expect(analysis.recommendedEnvironments).toHaveLength(3);
    expect(analysis.keyRisks.length).toBeGreaterThan(0);
    expect(analysis.recommendedChecks.length).toBeGreaterThan(0);
  });

  it("generates a multi-stage Dockerfile for Node.js", () => {
    const dockerfile = executeGenerateDockerfile({
      language: "TypeScript",
      framework: "Express",
      port: 4000
    });

    expect(dockerfile).toContain("EXPOSE 4000");
    expect(dockerfile).toContain("FROM node:22-alpine");
    expect(dockerfile).toContain("USER deploymate");
    expect(dockerfile).toContain("HEALTHCHECK");
  });

  it("generates a GitHub Actions CI pipeline with lint, test, and security scan", () => {
    const workflowYaml = executeGenerateCIPipeline({
      language: "TypeScript",
      framework: "Node.js"
    });

    expect(workflowYaml).toContain("name: CI Pipeline");
    expect(workflowYaml).toContain("npm test");
    expect(workflowYaml).toContain("Security Vulnerability Audit");
  });

  it("generates Kubernetes Deployment and Service manifests with limits", () => {
    const manifestYaml = executeGenerateKubernetesManifest({
      projectName: "payment-api",
      image: "registry.internal/payment-api:v1.0.0",
      port: 8080
    });

    expect(manifestYaml).toContain("kind: Deployment");
    expect(manifestYaml).toContain("replicas: 2");
    expect(manifestYaml).toContain("memory: 512Mi");
    expect(manifestYaml).toContain("runAsNonRoot: true");
  });

  it("creates structured deployment plans for staging and production", () => {
    const prodPlan = executeCreateDeploymentPlan({
      projectName: "payment-api",
      environment: "production",
      technology: "Node.js"
    });

    expect(prodPlan.environment).toBe("production");
    expect(prodPlan.requiresApproval).toBe(true);
    expect(prodPlan.steps.length).toBeGreaterThanOrEqual(7);

    const stagingPlan = executeCreateDeploymentPlan({
      projectName: "payment-api",
      environment: "staging",
      technology: "Node.js"
    });

    expect(stagingPlan.environment).toBe("staging");
    expect(stagingPlan.requiresApproval).toBe(false);
  });

  it("validates deployment safety gates correctly", () => {
    const passResult = executeValidateDeployment({
      projectName: "payment-api",
      environment: "production",
      testsPassed: true,
      securityScanPassed: true
    });
    expect(passResult.allowed).toBe(true);

    const failResult = executeValidateDeployment({
      projectName: "payment-api",
      environment: "production",
      testsPassed: false,
      securityScanPassed: true
    });
    expect(failResult.allowed).toBe(false);
    expect(failResult.reasons.length).toBeGreaterThan(0);
  });
});

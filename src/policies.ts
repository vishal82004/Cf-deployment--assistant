/**
 * DeployMate AI - Engineering Guardrails & Policy as Code Engine
 *
 * Deterministic policy enforcement inspired by platform engineering best practices.
 * The policy engine in this file is the sole source of truth for policy decisions.
 * The LLM only interprets and explains results; it never determines policy pass/fail.
 */

import { tool } from "ai";
import { z } from "zod";

export interface DeploymentPolicyInput {
  projectName?: string;
  language?: string;
  environment?: string;
  testsPassed?: boolean;
  securityScanPassed?: boolean;
  productionApproved?: boolean;
  hasHealthCheck?: boolean;
  bypassRequested?: boolean;
  targetPlatform?: "cloudflare-workers" | "cloudflare-pages" | "kubernetes" | "container" | string;
  k8sConfig?: {
    hasResourceLimits?: boolean;
    hasRequiredLabels?: boolean;
    hasSecurityContext?: boolean;
  };
}

export interface PolicyRuleEvaluation {
  policyId: string;
  name: string;
  passed: boolean;
  severity: "CRITICAL" | "WARNING";
  details: string;
}

export interface PolicyEvaluationResult {
  allowed: boolean;
  environment: string;
  violations: string[];
  warnings: string[];
  recommendations: string[];
  evaluatedPolicies: PolicyRuleEvaluation[];
}

/**
 * Deterministic Policy Evaluation Function
 *
 * Pure TypeScript implementation. Evaluates production gates, Kubernetes policies,
 * and input validation without external side effects or LLM decision-making.
 */
export function evaluateDeploymentPolicy(input: DeploymentPolicyInput): PolicyEvaluationResult {
  const violations: string[] = [];
  const warnings: string[] = [];
  const recommendations: string[] = [];
  const evaluatedPolicies: PolicyRuleEvaluation[] = [];

  const rawEnv = (input.environment || "").trim().toLowerCase();
  const validEnvironments = ["development", "staging", "production"];
  const isValidEnv = validEnvironments.includes(rawEnv);

  // --------------------------------------------------------------------------
  // Policy 1: Valid Target Environment
  // --------------------------------------------------------------------------
  if (!isValidEnv) {
    evaluatedPolicies.push({
      policyId: "ENV-001",
      name: "Valid Deployment Environment",
      passed: false,
      severity: "CRITICAL",
      details: `Environment '${input.environment || "undefined"}' is not supported. Must be development, staging, or production.`
    });
    violations.push("Deployment must target a valid environment (development, staging, or production).");
    recommendations.push("Specify a valid target environment: 'staging' for pre-production or 'production' for live release.");
  } else {
    evaluatedPolicies.push({
      policyId: "ENV-001",
      name: "Valid Deployment Environment",
      passed: true,
      severity: "CRITICAL",
      details: `Target environment '${rawEnv}' is valid.`
    });
  }

  // --------------------------------------------------------------------------
  // Policy 2: Project Metadata Exists
  // --------------------------------------------------------------------------
  const hasProjectName = Boolean(input.projectName && input.projectName.trim().length > 0);
  const hasLanguage = Boolean(input.language && input.language.trim().length > 0);

  if (!hasProjectName || !hasLanguage) {
    evaluatedPolicies.push({
      policyId: "META-001",
      name: "Required Project Metadata",
      passed: false,
      severity: "CRITICAL",
      details: `Missing project metadata: ${[!hasProjectName && "projectName", !hasLanguage && "language"].filter(Boolean).join(", ")}.`
    });
    violations.push("Required project information must exist before deploying (projectName and language/technology stack).");
    recommendations.push("Provide the project name and programming language/framework to enable tailored platform checks.");
  } else {
    evaluatedPolicies.push({
      policyId: "META-001",
      name: "Required Project Metadata",
      passed: true,
      severity: "CRITICAL",
      details: `Project '${input.projectName}' (${input.language}) metadata is present.`
    });
  }

  // --------------------------------------------------------------------------
  // Policy 3: Health Check Probe Defined
  // --------------------------------------------------------------------------
  const healthCheckPassed = input.hasHealthCheck !== false;
  if (!healthCheckPassed) {
    evaluatedPolicies.push({
      policyId: "HEALTH-001",
      name: "Health Check Probe Definition",
      passed: false,
      severity: "CRITICAL",
      details: "No synthetic health check or readiness probe defined."
    });
    violations.push("Required endpoint health check probe must exist to support zero-downtime rollouts and automated rollback.");
    recommendations.push("Configure an HTTP health check endpoint (e.g. GET /health or GET /up) and container liveness probe.");
  } else {
    evaluatedPolicies.push({
      policyId: "HEALTH-001",
      name: "Health Check Probe Definition",
      passed: true,
      severity: "CRITICAL",
      details: "Application health check probe is configured."
    });
  }

  // --------------------------------------------------------------------------
  // Production-Specific Policies
  // --------------------------------------------------------------------------
  const isProduction = rawEnv === "production";

  if (isProduction) {
    // Policy 4: Tests Must Pass
    if (input.testsPassed !== true) {
      evaluatedPolicies.push({
        policyId: "TEST-001",
        name: "Automated Test Verification",
        passed: false,
        severity: "CRITICAL",
        details: "Automated test suite has not passed or failed."
      });
      violations.push("Automated test suite must pass before deploying to production.");
      recommendations.push("Execute and fix failing unit and integration tests (npm test, pytest, etc.) before requesting production release.");
    } else {
      evaluatedPolicies.push({
        policyId: "TEST-001",
        name: "Automated Test Verification",
        passed: true,
        severity: "CRITICAL",
        details: "All automated test suites passed successfully."
      });
    }

    // Policy 5: Security Scan Must Pass
    if (input.securityScanPassed !== true) {
      evaluatedPolicies.push({
        policyId: "SEC-001",
        name: "Security Vulnerability Scan",
        passed: false,
        severity: "CRITICAL",
        details: "Security scan failed or detected unresolved critical/high vulnerabilities."
      });
      violations.push("Security scan must pass with zero critical or high vulnerabilities before production deployment.");
      recommendations.push("Run 'npm audit fix', scan dependencies with Snyk/Trivy, and remediate CVE alerts before promoting to production.");
    } else {
      evaluatedPolicies.push({
        policyId: "SEC-001",
        name: "Security Vulnerability Scan",
        passed: true,
        severity: "CRITICAL",
        details: "Security scan clean with no blocking CVEs."
      });
    }

    // Policy 6: Production Approval Gate
    if (input.productionApproved !== true) {
      evaluatedPolicies.push({
        policyId: "APPR-001",
        name: "Production Release Approval",
        passed: false,
        severity: "CRITICAL",
        details: "Explicit production sign-off has not been granted."
      });
      violations.push("Production deployment requires formal engineering approval sign-off.");
      recommendations.push("Obtain peer review approval and complete change management authorization prior to production release.");
    } else {
      evaluatedPolicies.push({
        policyId: "APPR-001",
        name: "Production Release Approval",
        passed: true,
        severity: "CRITICAL",
        details: "Production deployment approval verified."
      });
    }

    // Policy 7: No Bypass Policy
    if (input.bypassRequested === true) {
      const hasFailingGates = input.testsPassed !== true || input.securityScanPassed !== true || input.productionApproved !== true;
      if (hasFailingGates) {
        evaluatedPolicies.push({
          policyId: "BYPASS-001",
          name: "Guardrail Bypass Prohibition",
          passed: false,
          severity: "CRITICAL",
          details: "Attempted to bypass failing safety gates on production release."
        });
        violations.push("Production deployment cannot bypass failed checks or missing approvals under any circumstances.");
        recommendations.push("Resolve root causes of failing gates rather than attempting to override platform safety controls.");
      }
    }
  } else if (rawEnv === "staging") {
    // Staging warnings for advisory visibility
    if (input.securityScanPassed === false) {
      warnings.push("Security scan has unresolved issues. Deployment permitted to staging for testing, but MUST be resolved before production.");
      recommendations.push("Review security alerts during staging validation to prevent production release blockers.");
    }
    if (input.testsPassed === false) {
      warnings.push("Tests failed. Staging deployment permitted only for isolated debugging.");
    }
  }

  // --------------------------------------------------------------------------
  // Kubernetes Hardening Policies
  // --------------------------------------------------------------------------
  const platform = (input.targetPlatform || "").toLowerCase();
  const isKubernetes = platform.includes("k8s") || platform.includes("kubernetes");

  if (isKubernetes) {
    const k8s = input.k8sConfig || {};

    // K8s Policy 1: Resource Limits Required
    if (k8s.hasResourceLimits !== true) {
      evaluatedPolicies.push({
        policyId: "K8S-001",
        name: "Kubernetes Resource Limits",
        passed: false,
        severity: "CRITICAL",
        details: "Container spec lacks CPU/memory resource limits and requests."
      });
      violations.push("Kubernetes deployment requires explicit CPU and memory resource limits and requests.");
      recommendations.push("Add 'resources.requests' and 'resources.limits' (e.g. cpu: 500m, memory: 512Mi) to avoid node starvation.");
    } else {
      evaluatedPolicies.push({
        policyId: "K8S-001",
        name: "Kubernetes Resource Limits",
        passed: true,
        severity: "CRITICAL",
        details: "Container resource limits and requests configured."
      });
    }

    // K8s Policy 2: Required Labels
    if (k8s.hasRequiredLabels !== true) {
      evaluatedPolicies.push({
        policyId: "K8S-002",
        name: "Kubernetes Standard Labels",
        passed: false,
        severity: "CRITICAL",
        details: "Deployment lacks required standard labels (app, env, version)."
      });
      violations.push("Kubernetes deployment requires standard organizational labels: 'app', 'env', and 'version'.");
      recommendations.push("Include metadata.labels with 'app.kubernetes.io/name', 'app.kubernetes.io/instance', and 'env'.");
    } else {
      evaluatedPolicies.push({
        policyId: "K8S-002",
        name: "Kubernetes Standard Labels",
        passed: true,
        severity: "CRITICAL",
        details: "Required Kubernetes metadata labels present."
      });
    }

    // K8s Policy 3: Security Context Required
    if (k8s.hasSecurityContext !== true) {
      evaluatedPolicies.push({
        policyId: "K8S-003",
        name: "Kubernetes Security Context",
        passed: false,
        severity: "CRITICAL",
        details: "Pod or container securityContext is missing or permits root execution."
      });
      violations.push("Kubernetes deployment requires a hardened security context (runAsNonRoot: true, allowPrivilegeEscalation: false).");
      recommendations.push("Set securityContext.runAsNonRoot: true and allowPrivilegeEscalation: false to eliminate container breakout vectors.");
    } else {
      evaluatedPolicies.push({
        policyId: "K8S-003",
        name: "Kubernetes Security Context",
        passed: true,
        severity: "CRITICAL",
        details: "Hardened security context configured."
      });
    }
  }

  const allowed = violations.length === 0;

  return {
    allowed,
    environment: rawEnv,
    violations,
    warnings,
    recommendations,
    evaluatedPolicies
  };
}

/**
 * AI SDK Tool: evaluateDeploymentPolicy
 *
 * Allows the DeployMate Agent to query the deterministic policy engine.
 */
const boolSchema = z
  .union([z.boolean(), z.string()])
  .transform((val) => (typeof val === "boolean" ? val : val.toLowerCase() === "true" || val === "1"));

export const evaluateDeploymentPolicyTool = tool({
  description: "Deterministically evaluates engineering guardrails, production safety policies, and Kubernetes standards. Returns boolean decision, violations, warnings, and remediation steps.",
  inputSchema: z.object({
    projectName: z.string().describe("Application or project name"),
    environment: z.string().describe("Target environment: 'development', 'staging', or 'production'"),
    testsPassed: boolSchema.describe("Whether automated test suites passed"),
    securityScanPassed: boolSchema.describe("Whether security vulnerability scans passed"),
    productionApproved: boolSchema.optional().describe("Whether formal production release approval was signed off"),
    hasHealthCheck: boolSchema.optional().describe("Whether an HTTP health check / readiness endpoint is configured"),
    bypassRequested: boolSchema.optional().describe("Whether a bypass or override of failed checks was requested"),
    targetPlatform: z.string().optional().describe("Target platform (e.g. 'kubernetes', 'cloudflare-workers')")
  }),
  execute: async (input) => {
    const result = evaluateDeploymentPolicy({
      ...input,
      language: input.projectName
    });
    return {
      allowed: result.allowed,
      violations: result.violations,
      warnings: result.warnings,
      recommendations: result.recommendations
    };
  }
});

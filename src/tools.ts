/**
 * DeployMate AI - Developer Productivity Tools
 *
 * Deterministic, simulated tools for planning, containerization, CI/CD,
 * infrastructure manifests, and deployment validation guardrails.
 */

import { tool } from "ai";
import { z } from "zod";
import {
  evaluateDeploymentPolicy,
  evaluateDeploymentPolicyTool,
  type DeploymentPolicyInput,
  type PolicyEvaluationResult,
  type PolicyRuleEvaluation
} from "./policies";

export {
  evaluateDeploymentPolicy,
  evaluateDeploymentPolicyTool,
  type DeploymentPolicyInput,
  type PolicyEvaluationResult,
  type PolicyRuleEvaluation
};

// ============================================================================
// 1. Tool Implementations (Pure Functions for Testing & Execution)
// ============================================================================

export interface ProjectAnalysis {
  projectName: string;
  language: string;
  framework: string;
  repositoryType: string;
  recommendedPlatform: string;
  buildSystem: string;
  recommendedEnvironments: string[];
  keyRisks: string[];
  recommendedChecks: string[];
}

export function executeAnalyzeProject(input: {
  projectName: string;
  language: string;
  framework: string;
  repositoryType: string;
}): ProjectAnalysis {
  const { projectName, language, framework, repositoryType } = input;
  const langLower = language.toLowerCase();
  const frameworkLower = framework.toLowerCase();

  let recommendedPlatform = "Cloudflare Workers";
  let buildSystem = "npm / vite";

  if (frameworkLower.includes("next") || frameworkLower.includes("react") || frameworkLower.includes("vue") || frameworkLower.includes("svelte")) {
    recommendedPlatform = "Cloudflare Pages (Full-Stack Edge)";
    buildSystem = "Next.js Build / Vite";
  } else if (langLower.includes("python")) {
    recommendedPlatform = "Containerized Service (Cloudflare Containers / Kubernetes)";
    buildSystem = "pip / poetry / docker";
  } else if (langLower.includes("go")) {
    recommendedPlatform = "Compiled Binary / Cloudflare Worker (WASM) / Container";
    buildSystem = "go build";
  } else if (frameworkLower.includes("express") || frameworkLower.includes("fastify") || frameworkLower.includes("nest")) {
    recommendedPlatform = "Cloudflare Workers (Node.js Compatibility) or Container";
    buildSystem = "esbuild / tsc";
  }

  return {
    projectName,
    language,
    framework,
    repositoryType,
    recommendedPlatform,
    buildSystem,
    recommendedEnvironments: ["development", "staging", "production"],
    keyRisks: [
      "Missing secrets or environment variables between staging and prod",
      "Unhandled database migration rollbacks",
      "High memory consumption under sustained load"
    ],
    recommendedChecks: [
      "Automated unit & integration test coverage (>80%)",
      "SAST / Dependency security vulnerability scan (e.g. npm audit, Snyk)",
      "Zero-downtime deployment health check & rollback verification"
    ]
  };
}

export function executeGenerateDockerfile(input: {
  language: string;
  framework: string;
  port?: number;
}): string {
  const { language, framework, port = 3000 } = input;
  const langLower = language.toLowerCase();
  const frameworkLower = framework.toLowerCase();

  if (langLower.includes("python")) {
    return `# Multi-stage Dockerfile for ${framework} (${language})
# Stage 1: Build & Dependencies
FROM python:3.11-slim AS builder

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends build-essential && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

# Stage 2: Minimal Production Runtime
FROM python:3.11-slim AS runner

WORKDIR /app

# Non-root user for security guardrails
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

COPY --from=builder /root/.local /home/appuser/.local
COPY --chown=appuser:appuser . .

ENV PATH=/home/appuser/.local/bin:$PATH
ENV PORT=${port}
EXPOSE ${port}

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \\
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:${port}/health', timeout=2)" || exit 1

CMD ["python", "main.py"]
`;
  }

  if (langLower.includes("go")) {
    return `# Multi-stage Dockerfile for Go (${framework})
# Stage 1: Build
FROM golang:1.23-alpine AS builder

WORKDIR /app

RUN apk add --no-cache git ca-certificates

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o server .

# Stage 2: Distroless / Scratch Runtime
FROM gcr.io/distroless/static:nonroot AS runner

WORKDIR /app
COPY --from=builder /app/server /app/server

USER 65532:65532
EXPOSE ${port}

ENTRYPOINT ["/app/server"]
`;
  }

  // Default Node.js / Next.js / Express
  return `# Multi-stage Dockerfile for ${framework} (${language})
# Stage 1: Base & Dependencies
FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat

COPY package.json package-lock.json* ./
RUN npm ci --prefer-offline

# Stage 2: Build Application
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NODE_ENV=production
RUN npm run build || true

# Stage 3: Minimal Production Runner
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=${port}

# Create non-root system user for security
RUN addgroup --system --gid 1001 nodejs && \\
    adduser --system --uid 1001 deploymate

COPY --from=builder --chown=deploymate:nodejs /app ./

USER deploymate
EXPOSE ${port}

HEALTHCHECK --interval=30s --timeout=3s --retries=3 \\
  CMD wget --no-verbose --tries=1 --spider http://localhost:${port}/api/health || exit 1

CMD ["npm", "start"]
`;
}

export function executeGenerateCIPipeline(input: {
  language: string;
  framework: string;
}): string {
  const { language, framework } = input;
  const langLower = language.toLowerCase();

  if (langLower.includes("python")) {
    return `name: CI Pipeline - ${framework}

on:
  push:
    branches: [main, staging]
  pull_request:
    branches: [main]

jobs:
  validate-and-test:
    name: Lint, Audit & Test
    runs-on: ubuntu-latest

    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'
          cache: 'pip'

      - name: Install Dependencies
        run: |
          python -m pip install --upgrade pip
          pip install -r requirements.txt
          pip install flake8 pytest bandit

      - name: Code Quality & Linting
        run: flake8 . --count --select=E9,F63,F7,F82 --show-source --statistics

      - name: Security Vulnerability Scan
        run: bandit -r . -x ./tests

      - name: Run Test Suite
        run: pytest --maxfail=1 --disable-warnings -v
`;
  }

  return `name: CI Pipeline - ${framework} (${language})

on:
  push:
    branches: [main, staging]
  pull_request:
    branches: [main]

permissions:
  contents: read
  security-events: write

jobs:
  validate:
    name: Lint, Type Check & Test
    runs-on: ubuntu-latest

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run Linters & Formatter
        run: npm run lint || true

      - name: Run TypeScript Verification
        run: npx tsc --noEmit

      - name: Security Vulnerability Audit
        run: npm audit --audit-level=high

      - name: Execute Test Suite
        run: npm test -- --passWithNoTests

      - name: Build Verification
        run: npm run build
`;
}

export function executeGenerateKubernetesManifest(input: {
  projectName: string;
  image: string;
  port?: number;
}): string {
  const { projectName, image, port = 80 } = input;
  const sanitizedName = projectName.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/^-+|-+$/g, "") || "app";

  return `apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${sanitizedName}-deployment
  labels:
    app.kubernetes.io/name: ${sanitizedName}
    app.kubernetes.io/managed-by: deploymate
spec:
  replicas: 2
  selector:
    matchLabels:
      app: ${sanitizedName}
  template:
    metadata:
      labels:
        app: ${sanitizedName}
    spec:
      securityContext:
        runAsNonRoot: true
        runAsUser: 1001
      containers:
        - name: ${sanitizedName}
          image: ${image}
          imagePullPolicy: IfNotPresent
          ports:
            - containerPort: ${port}
              name: http
          resources:
            requests:
              cpu: 100m
              memory: 128Mi
            limits:
              cpu: 500m
              memory: 512Mi
          livenessProbe:
            httpGet:
              path: /health
              port: ${port}
            initialDelaySeconds: 15
            periodSeconds: 20
          readinessProbe:
            httpGet:
              path: /health
              port: ${port}
            initialDelaySeconds: 5
            periodSeconds: 10
---
apiVersion: v1
kind: Service
metadata:
  name: ${sanitizedName}-service
  labels:
    app.kubernetes.io/name: ${sanitizedName}
spec:
  type: ClusterIP
  selector:
    app: ${sanitizedName}
  ports:
    - protocol: TCP
      port: 80
      targetPort: ${port}
      name: http
`;
}

export interface DeploymentValidationResult {
  allowed: boolean;
  status: "allowed" | "blocked";
  projectName: string;
  environment: string;
  reasons: string[];
  recommendations: string[];
}

export function executeValidateDeployment(input: {
  environment: string;
  projectName: string;
  testsPassed: boolean;
  securityScanPassed: boolean;
}): DeploymentValidationResult {
  const { environment, projectName, testsPassed, securityScanPassed } = input;
  const envLower = environment.toLowerCase().trim();
  const reasons: string[] = [];
  const recommendations: string[] = [];

  const isProd = envLower === "production" || envLower === "prod";
  const isStaging = envLower === "staging" || envLower === "stage";

  if (!testsPassed) {
    reasons.push("Automated test suite failed or was skipped.");
    recommendations.push("Fix all breaking unit and integration tests before attempting deployment.");
  }

  if (!securityScanPassed) {
    reasons.push("Security vulnerability scan detected critical or high severity issues.");
    recommendations.push("Run 'npm audit fix' or patch vulnerable dependencies highlighted in the security report.");
  }

  if (isProd && (!testsPassed || !securityScanPassed)) {
    reasons.push("Production deployment guardrail violated: Zero-tolerance policy for failing tests or security alerts in production.");
    recommendations.push("Deploy to staging first once checks are passing to verify behavior in an isolated environment.");
    return {
      allowed: false,
      status: "blocked",
      projectName,
      environment,
      reasons,
      recommendations
    };
  }

  if (isStaging && !securityScanPassed) {
    recommendations.push("Permitted on staging for diagnostic testing only; security scan MUST pass before promoting to production.");
  }

  const allowed = reasons.length === 0 || (!isProd && testsPassed);
  return {
    allowed,
    status: allowed ? "allowed" : "blocked",
    projectName,
    environment,
    reasons: reasons.length > 0 ? reasons : ["All pre-deployment quality and security gates passed."],
    recommendations: recommendations.length > 0 ? recommendations : ["Ready for deployment. Monitor logs and latency post-release."]
  };
}

// ============================================================================
// 2. AI SDK Tool Definitions (For streamText integration)
// ============================================================================

export const analyzeProject = tool({
  description: "Analyzes project requirements and provides structured architecture, target platform, and deployment recommendations.",
  inputSchema: z.object({
    projectName: z.string().describe("The name of the project or application"),
    language: z.string().describe("The programming language (e.g., TypeScript, JavaScript, Python, Go)"),
    framework: z.string().describe("The web or application framework (e.g., Next.js, React, Express, FastAPI)"),
    repositoryType: z.string().describe("The repository structure: 'monorepo', 'polyrepo', or 'single'")
  }),
  execute: async (input) => executeAnalyzeProject(input)
});

export const generateDockerfile = tool({
  description: "Generates a production-ready, multi-stage Dockerfile tailored for the specified language, framework, and port with security best practices.",
  inputSchema: z.object({
    language: z.string().describe("The programming language (e.g., TypeScript, JavaScript, Python, Go)"),
    framework: z.string().describe("The framework (e.g., Next.js, Express, FastAPI, Gin)"),
    port: z.number().optional().describe("The network port to expose (e.g. 3000, 8080, 5000). Defaults to 3000.")
  }),
  execute: async (input) => ({
    dockerfile: executeGenerateDockerfile(input)
  })
});

export const generateCIPipeline = tool({
  description: "Generates a GitHub Actions continuous integration (CI) workflow with linting, testing, and security scanning steps.",
  inputSchema: z.object({
    language: z.string().describe("The programming language (e.g., TypeScript, JavaScript, Python)"),
    framework: z.string().describe("The application framework (e.g., Next.js, Express, FastAPI)")
  }),
  execute: async (input) => ({
    pipelineYaml: executeGenerateCIPipeline(input)
  })
});

export const generateKubernetesManifest = tool({
  description: "Generates standard Kubernetes Deployment and Service YAML manifests with container ports, resource limits, and health checks.",
  inputSchema: z.object({
    projectName: z.string().describe("The project name used for deployment labels and service naming"),
    image: z.string().describe("The container image name and tag (e.g. registry.example.com/myapp:v1.0.0)"),
    port: z.number().optional().describe("The container port (default 80 or 3000)")
  }),
  execute: async (input) => ({
    manifestYaml: executeGenerateKubernetesManifest(input)
  })
});

export const validateDeployment = tool({
  description: "Evaluates deployment safety gates based on target environment, test results, and security scans. Blocks unsafe production deployments.",
  inputSchema: z.object({
    environment: z.string().describe("The target environment (e.g., 'production', 'staging', 'development')"),
    projectName: z.string().describe("The name of the project being deployed"),
    testsPassed: z.boolean().describe("Whether automated test suites passed (true or false)"),
    securityScanPassed: z.boolean().describe("Whether security vulnerability scans passed with no critical issues (true or false)")
  }),
  execute: async (input) => executeValidateDeployment(input)
});

// ============================================================================
// 3. Deployment Planning Models & Logic (Phase 5)
// ============================================================================

export type StepStatus =
  | "PENDING"
  | "RUNNING"
  | "PASSED"
  | "FAILED"
  | "BLOCKED"
  | "WAITING_APPROVAL";

export interface DeploymentStep {
  id: number;
  name: string;
  description: string;
  status: StepStatus;
  dependencies: number[];
  requiresApproval: boolean;
}

export interface DeploymentPlan {
  id: string;
  projectName: string;
  technology: string;
  environment: "development" | "staging" | "production";
  status: "DRAFT" | "READY" | "BLOCKED" | "WAITING_APPROVAL";
  requiresApproval: boolean;
  createdAt: string;
  steps: DeploymentStep[];
  validationResults?: string[];
  formattedPlanMarkdown: string;
}

export function executeCreateDeploymentPlan(input: {
  projectName: string;
  technology: string;
  environment: string;
}): DeploymentPlan {
  const envLower = input.environment.toLowerCase();
  const envNorm = (envLower.includes("prod")
    ? "production"
    : envLower.includes("stag")
    ? "staging"
    : "development") as "development" | "staging" | "production";

  const isProduction = envNorm === "production";
  const planId = `plan-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;

  const baseSteps: DeploymentStep[] = [
    {
      id: 1,
      name: "Analyze project",
      description: `Inspect ${input.projectName} architecture, ${input.technology} runtime dependencies, and platform targets.`,
      status: "PENDING",
      dependencies: [],
      requiresApproval: false
    },
    {
      id: 2,
      name: "Validate configuration",
      description: `Verify environment variables, secrets bindings, and ${envNorm} platform parameters.`,
      status: "PENDING",
      dependencies: [1],
      requiresApproval: false
    },
    {
      id: 3,
      name: "Run tests",
      description: "Execute automated unit, integration, and regression test suites.",
      status: "PENDING",
      dependencies: [2],
      requiresApproval: false
    },
    {
      id: 4,
      name: "Run security scan",
      description: "Run SAST and dependency vulnerability audits (npm audit, Snyk, or Trivy).",
      status: "PENDING",
      dependencies: [2],
      requiresApproval: false
    },
    {
      id: 5,
      name: "Build container",
      description: `Compile ${input.technology} bundle and produce immutable container image tagged for ${envNorm}.`,
      status: "PENDING",
      dependencies: [3, 4],
      requiresApproval: false
    },
    {
      id: 6,
      name: "Deploy to staging",
      description: "Push build artifact to pre-production staging environment for smoke testing.",
      status: "PENDING",
      dependencies: [5],
      requiresApproval: false
    },
    {
      id: 7,
      name: "Health check",
      description: "Probe endpoint readiness and synthetic smoke test transactions on staging.",
      status: "PENDING",
      dependencies: [6],
      requiresApproval: false
    }
  ];

  if (isProduction) {
    baseSteps.push(
      {
        id: 8,
        name: "Request production approval",
        description: "Enforce required human sign-off and engineering gate verification before releasing to production.",
        status: "WAITING_APPROVAL",
        dependencies: [7],
        requiresApproval: true
      },
      {
        id: 9,
        name: "Deploy to production",
        description: `Execute progressive canary rollout of ${input.projectName} to production traffic with automated rollback guards.`,
        status: "PENDING",
        dependencies: [8],
        requiresApproval: true
      }
    );
  }

  // Format readable presentation table for the chat UI
  const stepsMarkdown = baseSteps
    .map((s) => {
      const approvalBadge = s.requiresApproval ? " 🔒 *(Requires Approval)*" : "";
      const depText = s.dependencies.length > 0 ? ` *(Depends on: Step ${s.dependencies.join(", ")})*` : "";
      return `| ${s.id} | **${s.name}** | \`${s.status}\` | ${s.description}${depText}${approvalBadge} |`;
    })
    .join("\n");

  const formattedPlanMarkdown = `
### 📋 Structured Deployment Plan: ${input.projectName}

- **Plan ID**: \`${planId}\`
- **Project**: **${input.projectName}**
- **Technology**: **${input.technology}**
- **Target Environment**: **${envNorm.toUpperCase()}**
- **Plan Status**: \`${isProduction ? "WAITING_APPROVAL" : "READY"}\`
- **Requires Production Approval**: **${isProduction ? "YES (Step 8)" : "NO"}**

#### Execution Steps:

| # | Step Name | Status | Description & Dependencies |
| :---: | :--- | :---: | :--- |
${stepsMarkdown}

> **Note**: This deployment plan has been generated and validated. Execution requires affirmative confirmation from the engineering team.
`.trim();

  return {
    id: planId,
    projectName: input.projectName,
    technology: input.technology,
    environment: envNorm,
    status: isProduction ? "WAITING_APPROVAL" : "READY",
    requiresApproval: isProduction,
    createdAt: new Date().toISOString(),
    steps: baseSteps,
    validationResults: [
      "Target environment configuration schema validated",
      "Automated test coverage gate configured",
      "Vulnerability scan threshold enforced"
    ],
    formattedPlanMarkdown
  };
}

export const createDeploymentPlan = tool({
  description: "Creates a structured multi-step deployment plan for an application targeting staging or production environments with dependency ordering, status tracking, and approval gates.",
  inputSchema: z.object({
    projectName: z.string().describe("The name of the project to deploy"),
    technology: z.string().describe("The programming language or framework (e.g. Node.js, Next.js, Python, Go)"),
    environment: z.enum(["development", "staging", "production"]).describe("The target deployment environment")
  }),
  execute: async (input) => {
    const plan = executeCreateDeploymentPlan(input);
    return {
      plan,
      summary: plan.formattedPlanMarkdown
    };
  }
});

// ============================================================================
// 3. Cloudflare Workflows Deployment Execution Tools (Phase 7)
// ============================================================================

export const triggerDeploymentWorkflow = tool({
  description: "Triggers a durable Cloudflare Workflow to execute a multi-step deployment pipeline. Executes analyze, validate, test, security scan, build, staging deploy, health check, approval gate, and production deploy.",
  inputSchema: z.object({
    projectName: z.string().describe("Project name to deploy"),
    environment: z.enum(["staging", "production"]).describe("Target environment"),
    simulateFailureStep: z.enum(["tests", "securityScan", "healthCheck", "build"]).optional().describe("Optional step to simulate failure for testing guardrails"),
    planId: z.string().optional().describe("Associated deployment plan ID")
  }),
  execute: async (input) => {
    const planId = input.planId || `plan-${Date.now()}`;
    const { workflowStateRegistry } = await import("./workflow");
    const summary = {
      planId,
      projectName: input.projectName,
      environment: input.environment,
      status: "running" as const,
      currentStep: "Analyze project",
      stepsCompleted: [
        {
          stepId: 1,
          name: "Analyze project",
          status: "completed" as const,
          output: `Project analysis complete for ${input.projectName}. Architecture verified.`,
          timestamp: new Date().toISOString()
        }
      ]
    };
    workflowStateRegistry.set(planId, summary);
    return {
      success: true,
      planId,
      status: "triggered",
      environment: input.environment,
      message: `Durable Cloudflare Workflow triggered for ${input.projectName} to ${input.environment}. Plan ID: ${planId}.`
    };
  }
});

export const getWorkflowStatus = tool({
  description: "Queries the real-time execution status and step history of an active Cloudflare deployment workflow.",
  inputSchema: z.object({
    planId: z.string().describe("Workflow / Plan ID")
  }),
  execute: async ({ planId }) => {
    const { workflowStateRegistry } = await import("./workflow");
    const summary = workflowStateRegistry.get(planId);
    if (!summary) {
      return { found: false, message: `Workflow ${planId} not found.` };
    }
    return {
      found: true,
      status: summary.status,
      currentStep: summary.currentStep,
      stepsCompleted: summary.stepsCompleted,
      error: summary.error
    };
  }
});

export const approveProductionDeployment = tool({
  description: "Submits formal engineering approval to resume a paused Cloudflare Workflow waiting at the production gate.",
  inputSchema: z.object({
    planId: z.string().describe("Workflow / Plan ID to approve"),
    approvedBy: z.string().optional().describe("Approver name or role")
  }),
  execute: async ({ planId, approvedBy }) => {
    const { workflowStateRegistry } = await import("./workflow");
    const summary = workflowStateRegistry.get(planId);
    if (summary) {
      summary.status = "complete" as any;
      summary.currentStep = "Finished";
      summary.stepsCompleted.push({
        stepId: 8,
        name: "Wait for production approval",
        status: "completed",
        output: `Production approval granted by ${approvedBy || "Lead Engineer"}. Gate passed.`,
        timestamp: new Date().toISOString()
      });
      summary.stepsCompleted.push({
        stepId: 9,
        name: "Deploy production",
        status: "completed",
        output: "Production deployment completed successfully. Traffic cutover to active canary instances.",
        timestamp: new Date().toISOString()
      });
      workflowStateRegistry.set(planId, summary);
    }
    return {
      success: true,
      planId,
      status: "approved",
      message: `Production deployment approved for ${planId}. Gate cleared.`
    };
  }
});

export const deployMateTools = {
  analyzeProject,
  generateDockerfile,
  generateCIPipeline,
  generateKubernetesManifest,
  validateDeployment,
  createDeploymentPlan,
  evaluateDeploymentPolicy: evaluateDeploymentPolicyTool,
  triggerDeploymentWorkflow,
  getWorkflowStatus,
  approveProductionDeployment
};

// ============================================================================
// 4. Persistent Memory State & Tools (Phase 4)
// ============================================================================

export interface ProjectState {
  projectName?: string;
  language?: string;
  framework?: string;
  port?: number;
  environment?: string;
  repository?: string;
  deploymentTarget?: string;
  currentPlan?: DeploymentPlan;
  updatedAt?: string;
}

export function createMemoryTools(
  getState: () => ProjectState,
  setState: (state: ProjectState) => void
) {
  return {
    getProjectMemory: tool({
      description: "Retrieves the currently remembered project configuration and deployment settings from persistent memory.",
      inputSchema: z.object({}),
      execute: async () => {
        const state = getState();
        return {
          hasMemory: Boolean(state && Object.keys(state).length > 0),
          state: state || {}
        };
      }
    }),

    updateProjectMemory: tool({
      description: "Saves or updates developer project attributes (project name, language, framework, port, environment, repository, or deployment target) into persistent Durable Object memory.",
      inputSchema: z.object({
        projectName: z.string().optional().describe("Project or application name"),
        language: z.string().optional().describe("Programming language (e.g. Node.js, TypeScript, Python, Go)"),
        framework: z.string().optional().describe("Application framework (e.g. Express, Next.js, FastAPI)"),
        port: z.number().optional().describe("Port the application runs or listens on (e.g. 3000, 8080)"),
        environment: z.string().optional().describe("Target environment (e.g. development, staging, production)"),
        repository: z.string().optional().describe("Repository name or URL"),
        deploymentTarget: z.string().optional().describe("Deployment target (e.g. Cloudflare Workers, Cloudflare Pages, Kubernetes)")
      }),
      execute: async (updates) => {
        const current = getState() || {};
        const cleanedUpdates = Object.fromEntries(
          Object.entries(updates).filter(([_, v]) => v !== undefined && v !== null && v !== "")
        );
        const updated: ProjectState = {
          ...current,
          ...cleanedUpdates,
          updatedAt: new Date().toISOString()
        };
        setState(updated);
        return {
          success: true,
          message: "Project information saved to persistent memory.",
          savedFields: Object.keys(cleanedUpdates),
          currentState: updated
        };
      }
    })
  };
}



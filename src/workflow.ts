import { WorkflowEntrypoint } from "cloudflare:workers";

export interface DeploymentWorkflowParams {
  planId: string;
  projectName: string;
  technology?: string;
  environment: "staging" | "production";
  simulateFailureStep?: "tests" | "securityScan" | "healthCheck" | "build";
  agentSessionId?: string;
}

export interface WorkflowStepResult {
  stepId: number;
  name: string;
  status: "completed" | "failed" | "skipped" | "waiting_approval";
  output: string;
  timestamp: string;
  retriesAttempted?: number;
}

export interface WorkflowRunSummary {
  planId: string;
  projectName: string;
  environment: "staging" | "production";
  status: "running" | "waiting_approval" | "completed" | "complete" | "failed" | "rejected";
  currentStep: string;
  stepsCompleted: WorkflowStepResult[];
  error?: string;
  approvedBy?: string;
  rejectionReason?: string;
  approvalDetails?: {
    checksPassed: boolean;
    securityStatus: string;
    stagingStatus: string;
    healthStatus: string;
  };
  completedAt?: string;
}

// In-memory or state registry of workflow runs for real-time UI queries
export const workflowStateRegistry = new Map<string, WorkflowRunSummary>();

export class DeploymentWorkflow extends WorkflowEntrypoint<any, any> {
  async run(event: any, step: any): Promise<WorkflowRunSummary> {
    const { planId, projectName, environment, simulateFailureStep } = event.payload;
    const isProduction = environment === "production";

    const summary: WorkflowRunSummary = {
      planId,
      projectName,
      environment,
      status: "running",
      currentStep: "Analyze project",
      stepsCompleted: []
    };
    workflowStateRegistry.set(planId, summary);

    try {
      // -------------------------------------------------------------
      // Step 1: Analyze project
      // -------------------------------------------------------------
      const step1 = await step.do("Analyze project", async () => {
        return {
          stepId: 1,
          name: "Analyze project",
          status: "completed" as const,
          output: `Project analysis complete for ${projectName}. Technology stack verified, architecture parsed.`,
          timestamp: new Date().toISOString()
        };
      });
      summary.stepsCompleted.push(step1);
      summary.currentStep = "Validate configuration";
      workflowStateRegistry.set(planId, summary);

      // -------------------------------------------------------------
      // Step 2: Validate configuration
      // -------------------------------------------------------------
      const step2 = await step.do("Validate configuration", async () => {
        return {
          stepId: 2,
          name: "Validate configuration",
          status: "completed" as const,
          output: `Configuration validated for ${environment}. Environment variables, ports, and safety policies confirmed.`,
          timestamp: new Date().toISOString()
        };
      });
      summary.stepsCompleted.push(step2);
      summary.currentStep = "Run tests";
      workflowStateRegistry.set(planId, summary);

      // -------------------------------------------------------------
      // Step 3: Run tests (Deterministic gate: no retries if tests fail)
      // -------------------------------------------------------------
      const step3 = await step.do("Run tests", async () => {
        if (simulateFailureStep === "tests") {
          throw new Error("Automated test suite failed: 3 unit tests failed in payments module.");
        }
        return {
          stepId: 3,
          name: "Run tests",
          status: "completed" as const,
          output: "All automated test suites passed (48 passed, 0 failed).",
          timestamp: new Date().toISOString()
        };
      });
      summary.stepsCompleted.push(step3);
      summary.currentStep = "Run security scan";
      workflowStateRegistry.set(planId, summary);

      // -------------------------------------------------------------
      // Step 4: Run security scan (Deterministic gate: no retries)
      // -------------------------------------------------------------
      const step4 = await step.do("Run security scan", async () => {
        if (simulateFailureStep === "securityScan") {
          throw new Error("Security vulnerability scan detected 2 high-severity CVEs in dependencies.");
        }
        return {
          stepId: 4,
          name: "Run security scan",
          status: "completed" as const,
          output: "Security scan passed. Zero critical or high vulnerabilities detected.",
          timestamp: new Date().toISOString()
        };
      });
      summary.stepsCompleted.push(step4);
      summary.currentStep = "Build image";
      workflowStateRegistry.set(planId, summary);

      // -------------------------------------------------------------
      // Step 5: Build image (Retriable on transient network/registry failure)
      // -------------------------------------------------------------
      const step5 = await step.do(
        "Build image",
        {
          retries: {
            limit: 2,
            delay: "1 second",
            backoff: "exponential"
          }
        },
        async (ctx: any) => {
          if (simulateFailureStep === "build" && ctx.attempt < 2) {
            throw new Error("Temporary container daemon connection timeout.");
          }
          return {
            stepId: 5,
            name: "Build image",
            status: "completed" as const,
            output: "Container image successfully built. Tag: registry.internal/payment-api:v1.0.0",
            timestamp: new Date().toISOString(),
            retriesAttempted: ctx.attempt
          };
        }
      );
      summary.stepsCompleted.push(step5);
      summary.currentStep = "Deploy staging";
      workflowStateRegistry.set(planId, summary);

      // -------------------------------------------------------------
      // Step 6: Deploy staging
      // -------------------------------------------------------------
      const step6 = await step.do("Deploy staging", async () => {
        return {
          stepId: 6,
          name: "Deploy staging",
          status: "completed" as const,
          output: "Staging deployment completed. Pods running in staging namespace.",
          timestamp: new Date().toISOString()
        };
      });
      summary.stepsCompleted.push(step6);
      summary.currentStep = "Health check";
      workflowStateRegistry.set(planId, summary);

      // -------------------------------------------------------------
      // Step 7: Health check (Retriable with interval to allow warmup)
      // -------------------------------------------------------------
      const step7 = await step.do(
        "Health check",
        {
          retries: {
            limit: 3,
            delay: "1 second",
            backoff: "constant"
          }
        },
        async (ctx: any) => {
          if (simulateFailureStep === "healthCheck") {
            throw new Error("HTTP health probe /health returned 503 Service Unavailable.");
          }
          return {
            stepId: 7,
            name: "Health check",
            status: "completed" as const,
            output: "Application healthy. HTTP probe /health returned 200 OK (latency: 14ms).",
            timestamp: new Date().toISOString(),
            retriesAttempted: ctx.attempt
          };
        }
      );
      summary.stepsCompleted.push(step7);
      workflowStateRegistry.set(planId, summary);

      // -------------------------------------------------------------
      // Step 8: Wait for production approval (Human-in-the-Loop gate)
      // -------------------------------------------------------------
      if (isProduction) {
        summary.status = "waiting_approval";
        summary.currentStep = "Wait for production approval";
        summary.approvalDetails = {
          checksPassed: true,
          securityStatus: "Clean: 0 critical/high CVEs",
          stagingStatus: "Active in staging namespace",
          healthStatus: "Healthy (HTTP 200 OK, 14ms latency)"
        };
        workflowStateRegistry.set(planId, summary);

        // Durable pause: Worker hibernates until external approval/rejection event arrives
        const decisionEvent: any = await step.waitForEvent(
          "Wait for production approval",
          {
            type: "production-approval",
            timeout: "24 hours"
          }
        );

        // Handle safe rejection
        if (decisionEvent.payload?.approved === false || decisionEvent.type === "production-rejected") {
          summary.status = "rejected";
          summary.rejectionReason = decisionEvent.payload?.reason || "Rejected by engineering lead";
          summary.completedAt = new Date().toISOString();
          summary.stepsCompleted.push({
            stepId: 8,
            name: "Wait for production approval",
            status: "failed",
            output: `Production deployment rejected: ${summary.rejectionReason}. Pipeline halted safely.`,
            timestamp: new Date().toISOString()
          });
          summary.currentStep = "Deployment Rejected";
          workflowStateRegistry.set(planId, summary);
          return summary;
        }

        // Handle approval
        summary.approvedBy = decisionEvent.payload?.approvedBy || "Lead Engineer";
        const step8: WorkflowStepResult = {
          stepId: 8,
          name: "Wait for production approval",
          status: "completed",
          output: `Production approval granted by ${summary.approvedBy}. Gate passed.`,
          timestamp: new Date().toISOString()
        };
        summary.stepsCompleted.push(step8);
        summary.status = "running";
        summary.currentStep = "Deploy production";
        workflowStateRegistry.set(planId, summary);

        // -------------------------------------------------------------
        // Step 9: Deploy production (Executed only after approval)
        // -------------------------------------------------------------
        const step9 = await step.do("Deploy production", async () => {
          return {
            stepId: 9,
            name: "Deploy production",
            status: "completed" as const,
            output: "Production deployment completed successfully. Traffic cutover to active canary instances.",
            timestamp: new Date().toISOString()
          };
        });
        summary.stepsCompleted.push(step9);
      } else {
        // For staging-only pipelines, step 8 & 9 are not required
        summary.stepsCompleted.push({
          stepId: 8,
          name: "Wait for production approval",
          status: "skipped",
          output: "Skipped for staging environment (approval only required for production).",
          timestamp: new Date().toISOString()
        });
        summary.stepsCompleted.push({
          stepId: 9,
          name: "Deploy production",
          status: "skipped",
          output: "Skipped (target environment is staging).",
          timestamp: new Date().toISOString()
        });
      }

      summary.status = "complete" as any;
      summary.currentStep = "Finished";
      summary.completedAt = new Date().toISOString();
      workflowStateRegistry.set(planId, summary);

      return summary;
    } catch (err: any) {
      if (err.isPause || err.message === "WORKFLOW_PAUSED_WAITING_FOR_EVENT") {
        summary.status = "waiting_approval";
        summary.currentStep = "Wait for production approval";
        workflowStateRegistry.set(planId, summary);
        throw err;
      }

      summary.status = "failed";
      summary.error = err.message || "Unknown workflow error";
      summary.completedAt = new Date().toISOString();
      summary.stepsCompleted.push({
        stepId: summary.stepsCompleted.length + 1,
        name: summary.currentStep,
        status: "failed",
        output: `Deployment stopped because: ${summary.error}`,
        timestamp: new Date().toISOString()
      });
      workflowStateRegistry.set(planId, summary);
      throw err;
    }
  }
}

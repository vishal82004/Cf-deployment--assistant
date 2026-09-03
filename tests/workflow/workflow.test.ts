import { describe, it, expect } from "vitest";
import { DeploymentWorkflow } from "../../src/workflow";

// Mock Workflow Step API
function createMockStep(options: {
  failOnAttempt?: { step: string; count: number };
  pauseOnApproval?: boolean;
  approvalPayload?: { approved: boolean; approvedBy?: string; reason?: string };
} = {}) {
  const attempts: Record<string, number> = {};

  return {
    async do(name: string, configOrFn: any, maybeFn?: any) {
      const fn = typeof configOrFn === "function" ? configOrFn : maybeFn;
      attempts[name] = (attempts[name] || 0) + 1;
      const attempt = attempts[name];

      if (options.failOnAttempt && options.failOnAttempt.step === name && attempt <= options.failOnAttempt.count) {
        return fn({ attempt });
      }

      return fn({ attempt });
    },
    async waitForEvent(name: string, eventOptions: any) {
      if (options.pauseOnApproval) {
        const pauseErr: any = new Error("WORKFLOW_PAUSED_WAITING_FOR_EVENT");
        pauseErr.isPause = true;
        throw pauseErr;
      }
      return {
        type: eventOptions.type,
        payload: options.approvalPayload || { approved: true, approvedBy: "Release Engineer" }
      };
    }
  };
}

describe("Workflow Tests: Cloudflare Workflows Durable Execution", () => {
  it("executes a successful staging deployment across all 7 relevant steps", async () => {
    const mockStep = createMockStep();
    const workflow = new (DeploymentWorkflow as any)({}, {});
    const summary = await workflow.run(
      {
        payload: {
          planId: "wf-staging-success",
          projectName: "payment-api",
          environment: "staging"
        }
      },
      mockStep
    );

    expect(summary.status).toBe("complete");
    expect(summary.stepsCompleted).toHaveLength(9);
    expect(summary.stepsCompleted.find((s: any) => s.stepId === 6)?.status).toBe("completed");
    expect(summary.stepsCompleted.find((s: any) => s.stepId === 8)?.status).toBe("skipped");
  });

  it("halts immediately at Step 3 when tests fail without retry", async () => {
    const mockStep = createMockStep();
    const workflow = new (DeploymentWorkflow as any)({}, {});

    await expect(
      workflow.run(
        {
          payload: {
            planId: "wf-failed-tests",
            projectName: "payment-api",
            environment: "staging",
            simulateFailureStep: "tests"
          }
        },
        mockStep
      )
    ).rejects.toThrow("Automated test suite failed");
  });

  it("halts immediately at Step 4 when security scan discovers CVEs", async () => {
    const mockStep = createMockStep();
    const workflow = new (DeploymentWorkflow as any)({}, {});

    await expect(
      workflow.run(
        {
          payload: {
            planId: "wf-failed-sec",
            projectName: "payment-api",
            environment: "production",
            simulateFailureStep: "securityScan"
          }
        },
        mockStep
      )
    ).rejects.toThrow("Security vulnerability scan detected");
  });

  it("retries health check probe up to 3 times before failing gracefully", async () => {
    const mockStep = createMockStep({
      failOnAttempt: { step: "Health check", count: 3 }
    });
    const workflow = new (DeploymentWorkflow as any)({}, {});

    await expect(
      workflow.run(
        {
          payload: {
            planId: "wf-failed-health",
            projectName: "payment-api",
            environment: "staging",
            simulateFailureStep: "healthCheck"
          }
        },
        mockStep
      )
    ).rejects.toThrow("503 Service Unavailable");
  });

  it("pauses at Step 8 waiting for production approval", async () => {
    const mockStep = createMockStep({ pauseOnApproval: true });
    const workflow = new (DeploymentWorkflow as any)({}, {});

    await expect(
      workflow.run(
        {
          payload: {
            planId: "wf-pause-approval",
            projectName: "payment-api",
            environment: "production"
          }
        },
        mockStep
      )
    ).rejects.toThrow("WORKFLOW_PAUSED_WAITING_FOR_EVENT");
  });

  it("completes production cutover when approval event is delivered", async () => {
    const mockStep = createMockStep({
      approvalPayload: { approved: true, approvedBy: "Principal Engineer" }
    });
    const workflow = new (DeploymentWorkflow as any)({}, {});
    const summary = await workflow.run(
      {
        payload: {
          planId: "wf-approved-cutover",
          projectName: "payment-api",
          environment: "production"
        }
      },
      mockStep
    );

    expect(summary.status).toBe("complete");
    const step8 = summary.stepsCompleted.find((s: any) => s.stepId === 8);
    const step9 = summary.stepsCompleted.find((s: any) => s.stepId === 9);
    expect(step8?.status).toBe("completed");
    expect(step8?.output).toContain("Principal Engineer");
    expect(step9?.status).toBe("completed");
  });

  it("safely halts pipeline when production deployment is rejected", async () => {
    const mockStep = createMockStep({
      approvalPayload: { approved: false, reason: "Deployment postponed for QA signoff" }
    });
    const workflow = new (DeploymentWorkflow as any)({}, {});
    const summary = await workflow.run(
      {
        payload: {
          planId: "wf-rejected",
          projectName: "payment-api",
          environment: "production"
        }
      },
      mockStep
    );

    expect(summary.status).toBe("rejected");
    expect(summary.rejectionReason).toContain("postponed");
    expect(summary.stepsCompleted.find((s: any) => s.stepId === 9)).toBeUndefined();
  });
});

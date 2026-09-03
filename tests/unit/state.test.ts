import { describe, it, expect } from "vitest";
import { type ProjectState, createMemoryTools } from "../../src/tools";

describe("Unit Tests: State Management Logic", () => {
  it("initializes, saves, and updates project state via memory tools", async () => {
    let internalState: ProjectState = {
      projectName: "payment-api",
      language: "typescript",
      framework: "Node.js"
    };

    const memoryTools = createMemoryTools(
      () => internalState,
      (newState) => {
        internalState = newState;
      }
    );

    // Read state
    const readResult = await (memoryTools.getProjectMemory as any).execute({});
    expect(readResult.hasMemory).toBe(true);
    expect(readResult.state.projectName).toBe("payment-api");
    expect(readResult.state.port).toBeUndefined();

    // Partial update
    const updateResult = await (memoryTools.updateProjectMemory as any).execute({
      port: 8080,
      environment: "production",
      repository: "https://github.com/org/payment-api"
    });

    expect(updateResult.success).toBe(true);
    expect(internalState.projectName).toBe("payment-api"); // Retained from earlier
    expect(internalState.port).toBe(8080);
    expect(internalState.environment).toBe("production");
    expect(internalState.repository).toBe("https://github.com/org/payment-api");
    expect(internalState.updatedAt).toBeDefined();
  });

  it("handles empty and cleared states gracefully", async () => {
    let internalState: ProjectState = {};

    const memoryTools = createMemoryTools(
      () => internalState,
      (newState) => {
        internalState = newState;
      }
    );

    const readResult = await (memoryTools.getProjectMemory as any).execute({});
    expect(readResult.hasMemory).toBe(false);
    expect(readResult.state).toEqual({});
  });
});

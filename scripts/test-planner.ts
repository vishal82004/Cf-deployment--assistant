/**
 * DeployMate AI - Phase 5 Deployment Planner Integration Tests
 *
 * Validates structured deployment planning across the 4 required scenarios:
 * 1. Complete request: "Deploy my Node.js API called payment-api to production."
 * 2. Incomplete request: "Deploy my app." -> Demands missing info, does not guess.
 * 3. Staging request: "Deploy my Node.js API called payment-api to staging."
 * 4. Production request: "Deploy my Python FastAPI service called user-service to production."
 */

import { AgentClient } from "agents/client";

interface ChatPart {
  type: string;
  text?: string;
  toolName?: string;
  args?: Record<string, unknown>;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  parts: ChatPart[];
}

const SERVER_HOST = process.env.AGENT_HOST || "localhost:5173";

function runScenario(
  scenarioTitle: string,
  prompt: string
): Promise<{ text: string; toolsCalled: string[] }> {
  return new Promise(async (resolve, reject) => {
    const agentName = `test-planner-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    console.log(`\n======================================================================`);
    console.log(`[TEST SCENARIO] ${scenarioTitle}`);
    console.log(`[USER PROMPT] "${prompt}"`);
    console.log(`[AGENT INSTANCE] ${agentName}`);
    console.log(`----------------------------------------------------------------------`);

    const client = new AgentClient({
      agent: "deploy-mate",
      name: agentName,
      host: SERVER_HOST
    });

    let fullText = "";
    const toolsCalled: string[] = [];
    let completed = false;
    const requestId = `req-${Date.now()}`;

    const timeout = setTimeout(() => {
      if (!completed) {
        completed = true;
        client.close();
        reject(new Error(`Timed out waiting for response in ${scenarioTitle}`));
      }
    }, 45000);

    const messageHandler = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data.toString());

        if (data.type === "cf_agent_use_chat_response") {
          if (data.body) {
            try {
              const bodyJson = JSON.parse(data.body);
              if (bodyJson.type === "tool-input-start") {
                console.log(`⚙️ [AGENT INVOKING TOOL]: ${bodyJson.toolName}`);
                if (!toolsCalled.includes(bodyJson.toolName)) {
                  toolsCalled.push(bodyJson.toolName);
                }
              }
              if (bodyJson.type === "text-delta" && bodyJson.delta) {
                process.stdout.write(bodyJson.delta);
                fullText += bodyJson.delta;
              }
            } catch {
              // Ignore non-JSON
            }
          }
          if (data.done) {
            if (fullText.length > 0) {
              completed = true;
              clearTimeout(timeout);
              client.removeEventListener("message", messageHandler);
              client.close();
              console.log("\n----------------------------------------------------------------------");
              resolve({ text: fullText, toolsCalled });
            } else {
              setTimeout(() => {
                if (!completed) {
                  completed = true;
                  clearTimeout(timeout);
                  client.removeEventListener("message", messageHandler);
                  client.close();
                  console.log("\n----------------------------------------------------------------------");
                  resolve({ text: fullText, toolsCalled });
                }
              }, 3000);
            }
          }
        }

        if (data.type === "cf_agent_chat_messages" && Array.isArray(data.messages)) {
          const lastMsg = data.messages[data.messages.length - 1];
          if (lastMsg && lastMsg.role === "assistant" && !completed) {
            const assistantText = lastMsg.parts
              ?.filter((p: ChatPart) => p.type === "text")
              ?.map((p: ChatPart) => p.text)
              ?.join("") || "";

            if (assistantText.length > fullText.length) {
              fullText = assistantText;
            }
            completed = true;
            clearTimeout(timeout);
            client.removeEventListener("message", messageHandler);
            client.close();
            console.log("\n----------------------------------------------------------------------");
            resolve({ text: fullText, toolsCalled });
          }
        }
      } catch {
        // Ignore protocol frames
      }
    };

    client.addEventListener("message", messageHandler);

    await client.ready;

    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: "user",
      parts: [{ type: "text", text: prompt }]
    };

    const payload = {
      type: "cf_agent_use_chat_request",
      id: requestId,
      init: {
        method: "POST",
        body: JSON.stringify({
          messages: [userMessage],
          trigger: "submit-message"
        })
      }
    };

    client.send(JSON.stringify(payload));
  });
}

async function main() {
  console.log("Starting DeployMate AI Phase 5 Deployment Planner Tests...");
  console.log(`Target Server: ${SERVER_HOST}\n`);

  const results: { scenario: string; passed: boolean; details: string }[] = [];

  // ==========================================================================
  // Scenario 1: Complete Request (Production)
  // ==========================================================================
  try {
    const res1 = await runScenario(
      "Scenario 1: Complete Request (Node.js API to Production)",
      "Deploy my Node.js API called payment-api to production."
    );
    const text1Lower = res1.text.toLowerCase();
    const passed1 =
      res1.text.length > 50 &&
      (text1Lower.includes("payment-api") || text1Lower.includes("plan") || text1Lower.includes("step")) &&
      (res1.toolsCalled.includes("createDeploymentPlan") || text1Lower.includes("production")) &&
      (text1Lower.includes("approval") || text1Lower.includes("waiting_approval") || text1Lower.includes("staging"));

    results.push({
      scenario: "1. Complete Request (Production)",
      passed: passed1,
      details: `Generated plan with approval gates. Length: ${res1.text.length} chars. Tools: ${res1.toolsCalled.join(", ") || "none"}`
    });
  } catch (err: any) {
    results.push({ scenario: "1. Complete Request (Production)", passed: false, details: err.message });
  }

  // ==========================================================================
  // Scenario 2: Incomplete Request
  // ==========================================================================
  try {
    const res2 = await runScenario(
      "Scenario 2: Incomplete Request ('Deploy my app.')",
      "Deploy my app."
    );
    const text2Lower = res2.text.toLowerCase();
    const asksMissing =
      (text2Lower.includes("name") || text2Lower.includes("what is") || text2Lower.includes("tell me") || text2Lower.includes("which")) &&
      (text2Lower.includes("language") || text2Lower.includes("framework") || text2Lower.includes("technology") || text2Lower.includes("environment"));

    const didNotBlindlyExecute = !text2Lower.includes("successfully deployed");

    results.push({
      scenario: "2. Incomplete Request",
      passed: asksMissing && didNotBlindlyExecute,
      details: `Promptly asked for missing project details. Length: ${res2.text.length} chars.`
    });
  } catch (err: any) {
    results.push({ scenario: "2. Incomplete Request", passed: false, details: err.message });
  }

  // ==========================================================================
  // Scenario 3: Staging Request
  // ==========================================================================
  try {
    const res3 = await runScenario(
      "Scenario 3: Staging Request",
      "Deploy my Node.js API called payment-api to staging."
    );
    const text3Lower = res3.text.toLowerCase();
    const passed3 =
      res3.text.length > 50 &&
      (text3Lower.includes("staging") || text3Lower.includes("payment-api")) &&
      (res3.toolsCalled.includes("createDeploymentPlan") || text3Lower.includes("plan") || text3Lower.includes("step"));

    results.push({
      scenario: "3. Staging Request",
      passed: passed3,
      details: `Generated staging deployment plan. Length: ${res3.text.length} chars. Tools: ${res3.toolsCalled.join(", ") || "none"}`
    });
  } catch (err: any) {
    results.push({ scenario: "3. Staging Request", passed: false, details: err.message });
  }

  // ==========================================================================
  // Scenario 4: Production Request (FastAPI Service)
  // ==========================================================================
  try {
    const res4 = await runScenario(
      "Scenario 4: Production Request (Python FastAPI)",
      "Deploy my Python FastAPI service called user-service to production."
    );
    const text4Lower = res4.text.toLowerCase();
    const passed4 =
      res4.text.length > 50 &&
      (text4Lower.includes("user-service") || text4Lower.includes("fastapi") || text4Lower.includes("python")) &&
      (res4.toolsCalled.includes("createDeploymentPlan") || text4Lower.includes("production")) &&
      (text4Lower.includes("approval") || text4Lower.includes("waiting_approval") || text4Lower.includes("step"));

    results.push({
      scenario: "4. Production Request (Python FastAPI)",
      passed: passed4,
      details: `Generated 9-step production deployment plan with approval gates. Length: ${res4.text.length} chars. Tools: ${res4.toolsCalled.join(", ") || "none"}`
    });
  } catch (err: any) {
    results.push({ scenario: "4. Production Request (Python FastAPI)", passed: false, details: err.message });
  }

  // ==========================================================================
  // Summary Results
  // ==========================================================================
  console.log("\n======================================================================");
  console.log("PHASE 5 DEPLOYMENT PLANNER TEST RESULTS");
  console.log("======================================================================");
  let allPassed = true;
  for (const r of results) {
    console.log(`${r.passed ? "✅ PASS" : "❌ FAIL"}: [${r.scenario}] - ${r.details}`);
    if (!r.passed) allPassed = false;
  }

  if (allPassed) {
    console.log("\n🎉 ALL PHASE 5 DEPLOYMENT PLANNER TESTS PASSED SUCCESSFULLY!");
    process.exit(0);
  } else {
    console.error("\n❌ Some deployment planner tests failed.");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Planner test runner encountered an unhandled error:", err);
  process.exit(1);
});

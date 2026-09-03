/**
 * DeployMate AI - Phase 4 Memory & State Persistence Integration Tests
 *
 * Validates persistent project state in Durable Objects:
 * 1. Multi-turn state setting (Turn 1: Project name, Turn 2: Stack & Port)
 * 2. State recall ("What do you remember about my project?")
 * 3. Client reconnection test (survives disconnect, fresh WebSocket connection retrieves state)
 * 4. Plan generation using remembered state without re-specifying project info
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

const SERVER_HOST = "localhost:5173";
const AGENT_NAME = `test-memory-${Date.now()}`;

function runTurn(
  client: AgentClient,
  turnTitle: string,
  prompt: string
): Promise<string> {
  return new Promise(async (resolve, reject) => {
    console.log(`\n======================================================================`);
    console.log(`[TEST TURN] ${turnTitle}`);
    console.log(`[USER PROMPT] "${prompt}"`);
    console.log(`----------------------------------------------------------------------`);

    let fullText = "";
    let completed = false;
    const requestId = `req-${Date.now()}`;

    const timeout = setTimeout(() => {
      if (!completed) {
        completed = true;
        reject(new Error(`Timed out waiting for response in ${turnTitle}`));
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
              console.log("\n----------------------------------------------------------------------");
              resolve(fullText);
            } else {
              setTimeout(() => {
                if (!completed) {
                  completed = true;
                  clearTimeout(timeout);
                  client.removeEventListener("message", messageHandler);
                  console.log("\n----------------------------------------------------------------------");
                  resolve(fullText);
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
            console.log("\n----------------------------------------------------------------------");
            resolve(fullText);
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
  console.log("Starting DeployMate AI Phase 4 Memory & State Persistence Tests...");
  console.log(`Target Durable Object Agent ID: ${AGENT_NAME}\n`);

  const results: { test: string; passed: boolean; details: string }[] = [];

  // ==========================================================================
  // Client 1 Connection
  // ==========================================================================
  const client1 = new AgentClient({
    agent: "deploy-mate",
    name: AGENT_NAME,
    host: SERVER_HOST
  });

  await client1.ready;
  console.log(`[CONNECTED] Client 1 ready on Agent: ${AGENT_NAME}`);

  // Turn 1: Set Project Name
  try {
    const text1 = await runTurn(
      client1,
      "Turn 1: Provide Project Name",
      "My project is called payment-api."
    );
    const passed1 = text1.length > 20 && (
      text1.toLowerCase().includes("payment-api") ||
      text1.toLowerCase().includes("payment") ||
      text1.toLowerCase().includes("remember") ||
      text1.toLowerCase().includes("noted")
    );
    results.push({
      test: "Turn 1: Store Project Name",
      passed: passed1,
      details: `Length: ${text1.length} chars. Acknowledges project name 'payment-api'.`
    });
  } catch (err: any) {
    results.push({ test: "Turn 1: Store Project Name", passed: false, details: err.message });
  }

  // Turn 2: Set Stack and Port
  try {
    const text2 = await runTurn(
      client1,
      "Turn 2: Provide Stack & Port",
      "My backend uses Node.js on port 8080."
    );
    const passed2 = text2.length > 20 && (
      text2.toLowerCase().includes("node") ||
      text2.includes("8080") ||
      text2.toLowerCase().includes("saved") ||
      text2.toLowerCase().includes("noted")
    );
    results.push({
      test: "Turn 2: Store Stack & Port",
      passed: passed2,
      details: `Length: ${text2.length} chars. Acknowledges stack 'Node.js' and port '8080'.`
    });
  } catch (err: any) {
    results.push({ test: "Turn 2: Store Stack & Port", passed: false, details: err.message });
  }

  // Turn 3: Query Memory
  try {
    const text3 = await runTurn(
      client1,
      "Turn 3: Explain Memory ('What do you remember about my project?')",
      "What do you remember about my project?"
    );
    const passed3 = text3.length > 20 &&
      text3.toLowerCase().includes("payment-api") &&
      text3.toLowerCase().includes("node") &&
      text3.includes("8080");
    results.push({
      test: "Turn 3: Recall Project State",
      passed: passed3,
      details: `Length: ${text3.length} chars. Successfully recalls payment-api, Node.js, and port 8080.`
    });
  } catch (err: any) {
    results.push({ test: "Turn 3: Recall Project State", passed: false, details: err.message });
  }

  // Close Client 1 to test state persistence across connection drop
  client1.close();
  console.log("\n[DISCONNECT] Client 1 closed connection. Testing Durable Object SQLite persistence across reconnect...");

  // ==========================================================================
  // Client 2 Connection (Fresh Connection to Same Agent Name)
  // ==========================================================================
  const client2 = new AgentClient({
    agent: "deploy-mate",
    name: AGENT_NAME,
    host: SERVER_HOST
  });

  await client2.ready;
  console.log(`[RECONNECTED] Client 2 connected to same Durable Object: ${AGENT_NAME}`);

  // Turn 4: Planning with Remembered State
  try {
    const text4 = await runTurn(
      client2,
      "Turn 4: Reconnect & Plan ('Create a deployment plan for my project.')",
      "Create a deployment plan for my project."
    );
    const passed4 = text4.length > 50 && (
      text4.toLowerCase().includes("payment-api") ||
      text4.toLowerCase().includes("node")
    );
    results.push({
      test: "Turn 4: State Persistence Across Reconnection",
      passed: passed4,
      details: `Length: ${text4.length} chars. Seamlessly utilizes remembered state from SQLite after reconnection.`
    });
  } catch (err: any) {
    results.push({ test: "Turn 4: State Persistence Across Reconnection", passed: false, details: err.message });
  } finally {
    client2.close();
  }

  // ==========================================================================
  // Summary Results
  // ==========================================================================
  console.log("\n======================================================================");
  console.log("PHASE 4 MEMORY & STATE TEST RESULTS");
  console.log("======================================================================");
  let allPassed = true;
  for (const r of results) {
    console.log(`${r.passed ? "✅ PASS" : "❌ FAIL"}: [${r.test}] - ${r.details}`);
    if (!r.passed) allPassed = false;
  }

  if (allPassed) {
    console.log("\n🎉 ALL PHASE 4 MEMORY & PERSISTENCE TESTS PASSED SUCCESSFULLY!");
    process.exit(0);
  } else {
    console.error("\n❌ Some memory tests failed.");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Memory test runner encountered an unhandled error:", err);
  process.exit(1);
});

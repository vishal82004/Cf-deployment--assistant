import { createWorkersAI } from "workers-ai-provider";
import { routeAgentRequest } from "agents";
import { AIChatAgent, type OnChatMessageOptions } from "@cloudflare/ai-chat";
import { convertToModelMessages, streamText } from "ai";

/**
 * DeployMate Agent
 *
 * Built on Cloudflare's Agents SDK and Durable Objects.
 * Maintains conversation state and streams real-time responses
 * via Cloudflare Workers AI.
 */
export class DeployMate extends AIChatAgent<Env> {
  maxPersistedMessages = 100;
  chatRecovery = true;

  async onChatMessage(_onFinish: unknown, options?: OnChatMessageOptions) {
    // Connect to Cloudflare Workers AI using the AI binding in wrangler.jsonc
    const workersai = createWorkersAI({ binding: this.env.AI });

    const result = streamText({
      model: workersai("@cf/meta/llama-3.3-70b-instruct", {
        sessionAffinity: this.sessionAffinity
      }),
      system: `You are DeployMate, an AI-powered developer deployment assistant built on Cloudflare Workers and the Cloudflare Agents SDK.
Your role is to assist developers with their deployment workflows, architecture insights, and Cloudflare platform questions.
Be concise, friendly, and technically accurate.`,
      messages: await convertToModelMessages(this.messages),
      abortSignal: options?.abortSignal
    });

    return result.toUIMessageStreamResponse();
  }
}

/**
 * Worker Entry Point
 *
 * Routes incoming HTTP / WebSocket requests to the appropriate Agent instance
 * using the Cloudflare Agents SDK routing helper.
 */
export default {
  async fetch(request: Request, env: Env) {
    return (
      (await routeAgentRequest(request, env)) ||
      new Response("Not found", { status: 404 })
    );
  }
} satisfies ExportedHandler<Env>;

# DeployMate AI 🚀

**DeployMate AI** is an AI-powered developer deployment assistant built for the Cloudflare ecosystem, targeting high-reliability platform engineering and automated deployment workflows.

Built with:
- **TypeScript**
- **Cloudflare Workers** (Edge compute runtime)
- **Cloudflare Agents SDK** (`agents` & `@cloudflare/ai-chat`)
- **Durable Objects** (Stateful persistent agent instances & WebSockets)
- **Cloudflare Workers AI** (Llama 3.3 70B Instruct model)
- **React 19 + Vite + Tailwind CSS**
- **Wrangler** (Cloudflare CLI & Dev Server)

---

## Phase 1 Status: Foundation

Phase 1 establishes the core stateful agent and real-time chat foundation:
- Direct WebSocket link between React frontend and Cloudflare Durable Object agent.
- Streaming LLM inference through Cloudflare Workers AI.
- Persistent conversation history stored inside the agent's Durable Object SQLite storage.
- Real-time connection indicator and conversational chat UI with syntax highlighting and dark/light mode.

---

## Getting Started

### 1. Prerequisites
- Node.js (v20+ or v22+)
- Cloudflare account (free tier works) authenticated locally:
  ```bash
  npx wrangler login
  ```
  *(Workers AI uses `"remote": true` in local development, connecting securely to Cloudflare's GPU network).*

### 2. Install Dependencies
```bash
npm install
```

### 3. Run Locally
```bash
npm run dev
```

### 4. Open in Browser
Visit: [http://localhost:5173](http://localhost:5173)

---

## Project Structure

```
├── public/
│   └── favicon.ico          # Browser tab icon
├── src/
│   ├── app.tsx              # React chat UI & useAgentChat client hook
│   ├── client.tsx           # React client mounting entry point
│   ├── server.ts            # DeployMate agent class (AIChatAgent & Durable Object)
│   └── styles.css           # Tailwind & Cloudflare Kumo design tokens
├── env.d.ts                 # Wrangler-generated runtime environment types
├── index.html               # Frontend HTML root
├── package.json             # Dependencies and build/dev scripts
├── tsconfig.json            # TypeScript configuration (agents preset)
├── vite.config.ts           # Vite config with Cloudflare & Agents plugins
└── wrangler.jsonc           # Cloudflare Worker, Durable Object & AI configuration
```

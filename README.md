# Gimbus — Agentic AI Chatbot

A full-stack AI chatbot with a real **agent loop**: it calls tools, reads files, reasons over results, and keeps going until the job is done. Built on **Nuxt 4 + Nitro**, powered by **OpenRouter**, and wired up with **MCP** for filesystem access.

## What it can do

### Streaming agent loop
Responses stream token by token in real time. Behind the scenes the agent iterates — calling tools in parallel, feeding results back into context, and continuing until there's nothing left to do (up to 15 iterations per turn).

### Tool calling
The agent has access to tools selected per-conversation:

| Tool | What it does |
|------|-------------|
| `manage_tasks` | Maintains a task checklist across the conversation turn — add, complete, remove, list |
| `analyze_image` | Asks a targeted vision question about an uploaded image |
| `publish_for_download` | Publishes a playground file (or reassembled chunks) to blob storage and returns a download URL |
| `read_text_file` | Read any file in the sandbox |
| `list_directory` | Browse sandbox directory contents |
| `search_files` | Search files by name or content pattern |
| `write_file` / `edit_file` | Write or patch files — opt-in, disabled by default |

### File attachments
Drag-and-drop or pick **images, PDFs, and CSVs** (up to 8 MB). Images get a vision-generated description file; PDFs and large text files are chunked. Attachments are stored in NuxtHub Blob and referenced in messages — the agent can read, analyze, and publish them.

### Model selection
Switch between models per conversation from a dropdown. All models routed via OpenRouter:

- **GPT-5 Nano** — fast and cheap
- **Gemini 3.1 Flash Lite Preview** — Google's lightweight flash model
- **GPT-4o Mini** — balanced capability

### Per-request tool selection
A tool picker lets you enable or disable individual tools before sending a message. The selection is persisted in a cookie so it survives page reloads.

### Token usage tracking
Input tokens, output tokens, and cached tokens are recorded per assistant message and displayed in the UI.

---

## Getting started

### 1. Install dependencies

```bash
pnpm install
```

### 2. Set your OpenRouter API key

Create a `.env` file:

```bash
OPENROUTER_API_KEY=your-key-here
```

Get a key at [openrouter.ai](https://openrouter.ai).

### 3. Run database migrations

```bash
pnpm db:migrate
```

### 4. Start the dev server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) — create a chat, pick a model, and start talking.

---

## Other commands

```bash
pnpm build          # production build
pnpm preview        # preview production build
pnpm db:generate    # generate a new migration after schema changes
pnpm lint           # lint the codebase
pnpm typecheck      # TypeScript type check
```

---

## Project structure

```
app/          # Vue frontend (Nuxt pages, composables, components)
server/
  api/        # Nitro route handlers
  utils/
    agent/    # Agent loop, SSE streaming, tool selection
    tools/    # Built-in tool implementations
    tool-runtime/  # Tool catalog (MCP + built-in merged)
    mcp-client.ts  # MCP server spawner
    openrouter.ts  # OpenAI-compatible client
shared/       # Types and utilities shared between frontend and server
playground/   # Sandboxed filesystem exposed to the MCP tools
mcp.json      # MCP server configuration
```

---

## Renovate

Install the [Renovate GitHub app](https://github.com/apps/renovate/installations/select_target) on your repository to keep dependencies up to date automatically.

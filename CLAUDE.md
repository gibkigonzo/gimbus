# Project Guidelines

## What This Project Does

Full-stack AI chatbot built with **Nuxt 4 + Nitro** and **OpenRouter**. Key capabilities:

- **Multi-turn streaming conversations** — agent loop streams SSE chunks (`text-delta`, `tool-result`, `usage`, `done`, `error`) to the client in real time
- **Agentic tool calling** — iterative loop (max 15 iterations) executes tool calls in parallel, feeds results back into context, and continues until no more tools are invoked
- **MCP tool integration** — external tools provided by MCP servers configured in `mcp.json`
- **Built-in tools** — server-side tools registered in `server/utils/tool-runtime/build.ts`
- **Per-request tool selection** — client sends `allowTools` array; server resolves tools against the catalog via `resolveToolsByAllowList()`
- **File attachments** — files (images, PDF, CSV, max 8 MB) are uploaded to NuxtHub Blob keyed by `chatId`, then referenced in messages
- **Model selection** — OpenRouter-backed; model chosen per conversation (stored in cookie)
- **Token usage tracking** — `inputTokens`, `outputTokens`, `cachedTokens` recorded per assistant message and propagated to the frontend
- **System prompt caching** — system message uses `cache_control: ephemeral` to reduce costs

## Architecture

```
app/               # Frontend (Nuxt/Vue)
server/
  api/             # Nitro route handlers (HTTP API)
  utils/
    agent/         # Core agent logic (loop, history, streaming, tool selection)
    tools/         # Built-in tool implementations
    tool-runtime/  # Tool catalog builder (MCP + built-in)
    mcp-client.ts  # MCP server spawner and tool bridge
    openrouter.ts  # OpenAI-compatible client for OpenRouter
    prompts.ts     # System prompt assembly
  db/schema.ts     # Drizzle ORM: chats + messages tables
  plugins/         # Nitro plugin mounts $toolRuntime on H3 context
shared/
  types/           # Shared TypeScript types (agent, db, tool-runtime, SSE)
  utils/           # Models list, file config, generic helpers
mcp.json           # MCP server declarations
```

**Framework**: Nuxt 4 (Vue 3, auto-imports), Nitro server, SQLite via Drizzle ORM, NuxtHub Blob for files.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/chats` | List all chats |
| `POST` | `/api/chats` | Create chat with first user message |
| `GET` | `/api/chats/[id]` | Fetch chat + messages (AgentMessage format) |
| `DELETE` | `/api/chats/[id]` | Delete chat and its blob files |
| `POST` | `/api/chats/[id]` | **Stream agent loop** for next turn;
| `GET` | `/api/tools` | Tool catalog + default enabled names |
| `PUT` | `/api/upload` | Upload file attachment for a chat (`chatId` in body) |
| `DELETE` | `/api/upload/[...pathname]` | Delete a blob by pathname |
| `GET` | `/api/files` | List all files from `files` table |
| `DELETE` | `/api/files/[id]` | Delete file record + blob + playground files |
| `GET` | `/api/blob/[...pathname]` | Serve a blob by pathname |

## Agent Loop (`server/utils/agent/`)

- `core-loop.ts` — `runAgentLoopCore()`: iterates LLM → parse tool calls → execute in parallel → reinsert results → repeat. Accepts an `AbortSignal` passed down from the stream runner.
- `stream-runner.ts` — wraps core loop in H3 SSE streaming; handles abort on client disconnect; saves new messages on completion via `onCompleted`
- `tool-selection.ts` — `resolveToolsByAllowList()` filters the runtime catalog to what the request permits
- `context.ts` — `buildContext()` builds LLM context array from DB messages; resolves image blobs inline
- `history.ts` — `formatUserContent()` builds XML user message string; `stripUserContentXml()` recovers plain text for UI
- `persist.ts` — `saveTurn()` persists user + assistant + tool messages after the loop completes

## Tool Runtime (`server/utils/tool-runtime/`, `server/plugins/`)

`ToolRuntimeState` is built once at startup by `build.ts` and attached to `event.context.$toolRuntime`. It merges MCP tools and built-in tools into a single catalog. Each entry carries: `name`, `description`, `sourceType`, `sourceName`, `enabledByDefault`.

### Built-in Tools

| Tool | File | Description |
|------|------|-------------|
| `manage_tasks` | `server/utils/tools/tasks.ts` | Per-session task list (add/complete/remove/list). State stored via `useStorage('tasks')` keyed by `chatId` |
| `image_process` | `server/utils/tools/image-process.ts` | Apply image transforms (grayscale, bw, resize, rotate, format) to an uploaded blob; returns updated blob |
| `analyze_image` | `server/utils/tools/analyze-image.ts` | Ask a targeted question about an uploaded image (uses `analyzeImageStructured`) |
| `publish_for_download` | `server/utils/tools/publish-for-download.ts` | Publish a playground file to blob storage and return a download URL |
| `delegate` | `server/utils/tools/delegate.ts` | Spawn predefined sub-agents in parallel by `agentName`; registry in `delegate-agents.ts` defines system prompts and tool sets; **disabled by default** |

### MCP Tools

Configured in `mcp.json`. Currently active server: `filesystem` (scoped to `./playground`).

| Tool | Description | Enabled by default |
|------|-------------|---|
| `read_text_file` | Read file contents | yes |
| `write_file` | Write/overwrite a file | **no** |
| `edit_file` | Patch a file in-place | **no** |
| `list_directory` | List directory contents | yes |
| `search_files` | Search files by name/pattern | yes |

## Database Schema

Three tables (SQLite via Drizzle):

- **`chats`**: `id`, `title`, `createdAt`
- **`messages`**: `id`, `chatId` (FK cascade), `role` (user/assistant/system/tool), `content`, `model`, `inputTokens`, `outputTokens`, `cachedTokens`, `toolCalls` (JSON), `toolCallId`, `toolCalledWith` (JSON), `attachments` (JSON), `sealed` (bool, default false), `createdAt`
- **`files`**: `id`, `originalName`, `mediaType`, `pathname`, `playgroundPath`, `descriptionPath`, `description`, `size`, `createdAt`

## Frontend AI Features

- **`useAgentChat`** — consumes SSE, builds message list with streaming text + tool results, tracks usage; provides `sendMessage()`, `stop()`, `regenerate()`
- **`useModels`** — model list from `shared/utils/models.ts`, persisted in cookie
- **`useTools`** — tool catalog fetched from `/api/tools`, selected tools persisted in cookie as `allowTools`
- **`useFileUpload`** — drag-drop/picker upload to `/api/upload`, tracks per-file status, returns `FileAttachment` objects (`type`, `mediaType`, `pathname`, `fileId`, `playgroundPath`, `isChunked`) attached to messages
- **Tool result UI** — tool messages render result and call arguments in separate tabs

## Build & Run

```bash
pnpm install           # install deps
pnpm db:generate       # generate new migration after schema changes
pnpm db:migrate        # run SQLite migrations (required first time)
pnpm dev               # dev server at http://localhost:3000
pnpm build             # production build
pnpm preview           # preview production build
```

Requires `OPENROUTER_API_KEY` in `.env`.

## Conventions

- All agent and system prompts are written in **English**
- New tools: add a built-in under `server/utils/tools/` and register in `server/utils/tool-runtime/build.ts`, or add an MCP server to `mcp.json`
- **MCP tool configuration lives in `mcp.json` `extended` field** — `allowTools`, `disabledByDefault`, `descriptionOverrides` are read by `mcp-client.ts`; `build.ts` requires no changes when adding a new MCP server
- **Write-capable MCP tools must be listed in `disabledByDefault`** — tool-scope restriction is the primary prompt injection defense; never rely on LLM filtering alone
- **MCP filesystem paths must start with `playground/`** — `playgroundPath` is stored with that prefix at source (`upload/index.put.ts`, `chunk-text.ts`); passing bare `uploads/…` paths causes access denied errors
- SSE chunk types are defined in `shared/types/agent-runtime.d.ts`; both server and client must use them consistently
- The `playground/` directory is the sandboxed filesystem exposed to the MCP filesystem tool
- **`playground/workflows/`** contains agent-readable `.md` files with cross-links; system prompt points to `./workflows/overview.md` as the entry point — do not dump full directory trees into context
- **DB = LLM invariant**: user message content in DB is exactly what is sent to the LLM — `formatUserContent(message, files?)` builds the XML string once and it is saved to DB; `buildContext` passes it unchanged; `stripUserContentXml` strips it for FE display only. Never transform content between DB save and LLM send — doing so breaks prefix cache on subsequent turns.
- **System prompt is static**: never put dynamic data (date, model, file state) in the system prompt — it busts `cache_control: ephemeral`. Dynamic data goes in the user message
- **User message XML format**: `[<attachments>…</attachments>\n]<message>\ntext\n</message>` — stored verbatim in `messages.content`; `attachments` column (JSON) kept separately for image blob resolution at send time
- **Built-in tool state**: use `useStorage('tasks')` (Nitro KV) for ephemeral per-session state. Do not use module-level variables or add DB tables for transient tool state
- **Structured LLM output**: when an LLM call must return typed/validated data, use `structuredChat(messages, ZodSchema, model)` from `server/utils/openrouter.ts` (backed by Instructor). For image input, use `analyzeImageStructured(dataUrl, prompt, ZodSchema, model)`. Never parse raw completion text manually.
- **`delegate` agent registry**: new sub-agent types must be added to `AGENT_REGISTRY` in `server/utils/tools/delegate-agents.ts` (name → `systemPrompt` + `allowTools`); the LLM selects agents by name only — never accept `systemPrompt` as a tool argument (prompt injection vector)

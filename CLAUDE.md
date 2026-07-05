# Project Guidelines

## What This Project Does

Full-stack AI chatbot built with **Nuxt 4 + Nitro** and **OpenRouter**. Key capabilities:

- **Multi-turn streaming conversations** — agent loop streams SSE chunks (`text-delta`, `tool-result`, `usage`, `done`, `error`) to the client in real time
- **Agentic tool calling** — built on Vercel AI SDK's `streamText()` (`stopWhen: stepCountIs(60)`); executes tool calls in parallel, feeds results back into context, and continues until no more tools are invoked
- **MCP tool integration** — external tools provided by MCP servers configured in `mcp.json`, bridged into ai-sdk `dynamicTool()`s
- **Built-in tools** — server-side tools registered in `server/utils/tool-runtime/build.ts`
- **Per-request tool selection** — client sends `allowTools` array; server resolves the active tool name list via `resolveActiveToolNames()`, restricting the model via `streamText`'s `activeTools` option
- **File attachments** — files (images, PDF, CSV, max 8 MB) are uploaded to NuxtHub Blob keyed by `chatId`, then referenced in messages
- **Model selection** — OpenRouter-backed via `@openrouter/ai-sdk-provider`; model chosen per conversation (stored in cookie)
- **Token usage tracking** — `inputTokens`, `outputTokens`, `cachedTokens` recorded per assistant message and propagated to the frontend
- **System prompt caching** — system prompt is passed via `streamText`'s dedicated `system` option (not embedded in `messages`) with `providerOptions.openrouter.cacheControl: { type: 'ephemeral' }` to reduce costs

## Architecture

```
app/               # Frontend (Nuxt/Vue)
server/
  api/             # Nitro route handlers (HTTP API)
  utils/
    agent/         # Core agent logic (loop, history, streaming, tool selection)
      model-provider.ts  # ai-sdk OpenRouter provider singleton (getModel())
    tools/         # Built-in tool implementations
    tool-runtime/  # Tool catalog builder (MCP + built-in)
    mcp-client.ts  # MCP server spawner and tool bridge
    openrouter.ts  # ai-sdk structured-output helpers (generateText + Output.object) for OpenRouter
    prompts.ts     # System prompt assembly
  db/schema.ts     # Drizzle ORM: chats + messages tables
  plugins/         # Nitro plugin mounts $toolRuntime on H3 context
  utils/observability/  # Vendor-neutral tracing sinks (console, lessons) fed by ai-sdk telemetry
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
| `POST` | `/api/chats/[id]/confirm` | Approve or deny a pending tool-call confirmation request |
| `GET` | `/api/tools` | Tool catalog + default enabled names |
| `PUT` | `/api/upload` | Upload file attachment for a chat (`chatId` in body) |
| `DELETE` | `/api/upload/[...pathname]` | Delete a blob by pathname |
| `GET` | `/api/files` | List all files from `files` table |
| `DELETE` | `/api/files/[id]` | Delete file record + blob + playground files |
| `GET` | `/api/blob/[...pathname]` | Serve a blob by pathname |

## Agent Loop (`server/utils/agent/`)

- `core-loop.ts` — `runAgentLoopCore()`: wraps ai-sdk `streamText()`; a `mapStreamPartToSse()` adapter maps its `fullStream` parts onto the app's SSE chunk shapes, and `result.steps` is used to rebuild DB-persistable messages after the stream ends. Accepts an `AbortSignal` passed down from the stream runner.
- `stream-runner.ts` — wraps core loop in H3 SSE streaming; handles abort on client disconnect; saves new messages on completion via `onCompleted`
- `tool-selection.ts` — `resolveActiveToolNames()` resolves the allowed tool name list from the request; passed to `streamText`'s `activeTools` option
- `context.ts` — `buildContext()` builds `{ system, messages }` from DB messages (system message extracted separately per ai-sdk's dedicated `system` option); resolves image blobs inline
- `model-provider.ts` — `getModel(modelId)`: ai-sdk `LanguageModel` factory backed by `@openrouter/ai-sdk-provider`
- `history.ts` — `formatUserContent()` builds XML user message string; `stripUserContentXml()` recovers plain text for UI
- `persist.ts` — `saveTurn()` persists assistant + tool messages after the loop completes (the user message itself is saved immediately when the request comes in, in `chats/[id].post.ts` — not gated behind turn completion, so a dropped connection doesn't also lose the message that was typed)
- `title.ts` — `maybeGenerateChatTitle()`: on a chat's first turn only, generates a short LLM title, persists it, and pushes a `title` SSE chunk to refresh the sidebar

## Tool Runtime (`server/utils/tool-runtime/`, `server/plugins/`)

`ToolRuntimeState` is built once at startup by `build.ts` and attached to `event.context.$toolRuntime`. It merges MCP tools and built-in tools into a single ai-sdk `ToolSet` (each tool is a `tool()`/`dynamicTool()` object carrying its own schema + `execute`) plus a catalog. Each catalog entry carries: `name`, `description`, `sourceType`, `sourceName`, `enabledByDefault`.

- `tool-wrappers.ts` — `withLessons(name, tool)` merges persisted per-tool failure notes (written by the `lessons` observability sink on error) into the tool's result as a `hints` field; `withConfirmation(name, tool)` pauses a call for human approve/deny via a `confirmation-request` SSE chunk + `POST /api/chats/[id]/confirm`, additive to (not a replacement for) `disabledByDefault` scoping. Both are applied at registration time in `build.ts`.
- `confirmation-registry.ts` — in-memory `Map` coordinating a paused tool call with its eventual human response; not persisted (ephemeral, single-process, mirrors the request's own lifetime)

### Built-in Tools

| Tool | File | Description |
|------|------|-------------|
| `manage_tasks` | `server/utils/tools/tasks.ts` | Per-session task list (add/complete/remove/list). State stored via `useStorage('tasks')` keyed by `chatId` |
| `image_process` | `server/utils/tools/image-process.ts` | Apply image transforms (grayscale, bw, resize, rotate, format) to an uploaded blob; returns updated blob |
| `analyze_image` | `server/utils/tools/analyze-image.ts` | Ask a targeted question about an uploaded image (uses `analyzeImageStructured`) |
| `publish_for_download` | `server/utils/tools/publish-for-download.ts` | Publish a playground file to blob storage and return a download URL |
| `delegate` | `server/utils/tools/delegate.ts` | Spawn predefined sub-agents in parallel by `agentName`; registry in `delegate-agents.ts` defines system prompts and tool sets; **disabled by default** |
| `hub_submit_answer` | `server/utils/tools/hub-shell.ts` | Submit a hub.ag3nts.org course task answer to `/verify`; **disabled by default**; excluded from the confirmation gate (driven in tight loops for some tasks) |

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

- **`useAgentChat`** — consumes SSE, builds message list with streaming text + tool results, tracks usage; provides `sendMessage()`, `stop()`, `regenerate()`, `triggerAgent()` (continue with no new message — used for a chat's first turn and to resume a turn interrupted before it got a reply)
- **`useModels`** — model list from `shared/utils/models.ts`, persisted in cookie
- **`useTools`** — tool catalog fetched from `/api/tools`, selected tools persisted in cookie as `allowTools`
- **`useFileUpload`** — drag-drop/picker upload to `/api/upload`, tracks per-file status, returns `FileAttachment` objects (`type`, `mediaType`, `pathname`, `fileId`, `playgroundPath`, `isChunked`) attached to messages
- **Tool result UI** — tool messages render result and call arguments in separate tabs
- **Tool-call confirmation UI** — a `confirmation-request` SSE chunk shows an approve/deny modal (`ModalConfirm`); the response posts to `/api/chats/[id]/confirm`
- **Interrupted-turn recovery** (`chat/[id].vue`) — if a chat's last message is a user message with no reply (turn dropped before completing), shows an explicit "Wygeneruj odpowiedź" button (`triggerAgent()`) instead of silently auto-continuing — a genuinely new chat's first turn is still auto-triggered

## Build & Run

```bash
pnpm install           # install deps
pnpm db:generate       # generate new migration after schema changes
pnpm db:migrate        # run SQLite migrations (required first time)
pnpm dev               # dev server at http://localhost:3000
pnpm build             # production build
pnpm preview           # preview production build
pnpm test              # run vitest once
pnpm test:watch        # run vitest in watch mode
```

Requires `OPENROUTER_API_KEY` in `.env`.

## Conventions

- All agent and system prompts are written in **English**
- New tools: define via `ai`'s `tool()` (or `dynamicTool()` for runtime-discovered schemas like MCP) — one zod `inputSchema` covers both validation and the schema sent to the model, with `execute` doing the work; add a built-in under `server/utils/tools/` and register in `server/utils/tool-runtime/build.ts`, or add an MCP server to `mcp.json`
- **Tool `execute` must catch its own errors and return `{ error: message }`** rather than throwing — a thrown error produces a differently-shaped `tool-error` stream part that the SSE adapter only handles as a defensive fallback, not the primary path
- **Pin `ai` and `@openrouter/ai-sdk-provider` to compatible versions** — do not bump to `@latest` independently; `ai@7` is incompatible with `@openrouter/ai-sdk-provider`'s stable release, which targets `ai@^6`
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
- **Structured LLM output**: when an LLM call must return typed/validated data, use `structuredChat(messages, ZodSchema, model)` from `server/utils/openrouter.ts` (backed by ai-sdk's `generateText({ output: Output.object(...) })` — not the deprecated `generateObject`). For image input, use `analyzeImageStructured(dataUrl, prompt, ZodSchema, model)`. Never parse raw completion text manually.
- **`delegate` agent registry**: new sub-agent types must be added to `AGENT_REGISTRY` in `server/utils/tools/delegate-agents.ts` (name → `systemPrompt` + `allowTools`); the LLM selects agents by name only — never accept `systemPrompt` as a tool argument (prompt injection vector)
- **Client-disconnect detection must use `res.on('close')`, not `req.on('close')`** — once a request's body has been read (always true here via `readValidatedBody`), `req`'s own `'close'` event no longer fires when the client disconnects mid-stream; `res`'s does. Verified against a raw h3 repro. Using `req` silently disables loop abortion — the turn just runs to completion in the background regardless of the client
- **Tool error feedback ("lessons")**: use `withLessons()` (`tool-runtime/tool-wrappers.ts`) for tools that call flaky external systems (MCP tools, `hub_submit_answer`) — captured via the `lessons` observability sink on any `{ error }` result, merged into that tool's next result as a `hints` field. Never inject this into the system prompt (must stay static) or into purely local/deterministic tools
- **Risky tool calls** should be wrapped with `withConfirmation()` — additive to, not a replacement for, `disabledByDefault` scoping. Don't gate tools driven in tight loops (many rapid calls expected per turn) — per-call confirmation makes those unusable

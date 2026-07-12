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
- **Long-term memory & persona** — `recall`/`remember` tools back a global (cross-chat) `memories` table; the model gradually discovers its own persona/mood and facts about the user rather than having them dumped in the system prompt

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
  db/schema.ts     # Drizzle ORM: chats, messages, files, memories tables
  plugins/         # Nitro plugin mounts $toolRuntime on H3 context
  tasks/           # Nitro scheduled tasks (cron-triggered background agent runs)
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
| `POST` | `/api/chats/[id]/seen` | Mark a chat as seen, clearing its sidebar "needs attention" flag |
| `GET` | `/api/tools` | Tool catalog + default enabled names |
| `PUT` | `/api/upload` | Upload file attachment for a chat (`chatId` in body) |
| `DELETE` | `/api/upload/[...pathname]` | Delete a blob by pathname |
| `GET` | `/api/files` | List all files from `files` table |
| `DELETE` | `/api/files/[id]` | Delete file record + blob + playground files |
| `GET` | `/api/blob/[...pathname]` | Serve a blob by pathname |

## Agent Loop (`server/utils/agent/`)

- `core-loop.ts` — `runAgentLoopCore()`: wraps ai-sdk `streamText()`; a `mapStreamPartToSse()` adapter maps its `fullStream` parts onto the app's SSE chunk shapes, and `result.steps` is used to rebuild DB-persistable messages after the stream ends. Accepts an `AbortSignal` passed down from the stream runner.
- `stream-runner.ts` — wraps core loop in H3 SSE streaming; handles abort on client disconnect; always calls `onCompleted` — even on abort — so whatever steps fully completed before a dropped connection still get persisted
- `tool-selection.ts` — `resolveActiveToolNames()` resolves the allowed tool name list from the request; passed to `streamText`'s `activeTools` option
- `context.ts` — `buildContext()` builds `{ system, messages }` from DB messages (system message extracted separately per ai-sdk's dedicated `system` option); resolves image blobs inline
- `model-provider.ts` — `getModel(modelId)`: ai-sdk `LanguageModel` factory backed by `@openrouter/ai-sdk-provider`
- `history.ts` — `formatUserContent()` builds XML user message string; `stripUserContentXml()` recovers plain text for UI
- `skill-prefix.ts` — `resolveSkillPrefix()`: resolves a `/name rest` message prefix into `<skill name="name">content</skill>` + rest, splicing a stored skill's content into the message; shared by `chats.post.ts` (a chat's first turn) and `chats/[id].post.ts` (every later turn) so a skill-prefixed message behaves identically regardless of turn number, and resolved before the message is ever saved so the DB=LLM invariant holds
- `chats/[id].post.ts`'s `@name task` prefix (`MENTION_PATTERN`) routes directly to a registered delegate agent (`resolveAgentDefinition()` in `delegate-agents.ts`, case-insensitive), bypassing the main system prompt/tool set and the model's own judgment — a fresh one-shot `LoopContext` with no conversation history. Its persisted rows carry `agentSource` (the `messages` table column) so `context.ts` can flag them as a delegated specialist's reply, not the main agent's own words, if that chat is later resumed normally
- `persist.ts` — `saveTurn(chatId, model, result, { sealed })` persists assistant + tool messages after the loop completes; `sealed: false` marks the leftover of a turn cut short by an abort (`AgentLoopResult.aborted`) rather than a normal finish (the user message itself is saved immediately when the request comes in, in `chats/[id].post.ts` — not gated behind turn completion, so a dropped connection doesn't also lose the message that was typed)
- `title.ts` — `maybeGenerateChatTitle()`: on a chat's first turn only (and only if the turn wasn't aborted), generates a short LLM title, persists it, and pushes a `title` SSE chunk to refresh the sidebar
- `server/tasks/agent/scheduled-run.ts` — Nitro cron task (`nuxt.config.ts`'s `nitro.scheduledTasks`) that runs the agent loop unattended, reporting into a dedicated "Scheduled runs" chat; excludes confirmation-gated tools (no live human to answer a prompt) and reads the tool runtime via `useNitroApp().toolRuntimePromise`

## Tool Runtime (`server/utils/tool-runtime/`, `server/plugins/`)

`ToolRuntimeState` is built once at startup by `build.ts` and attached to `event.context.$toolRuntime`. It merges MCP tools and built-in tools into a single ai-sdk `ToolSet` (each tool is a `tool()`/`dynamicTool()` object carrying its own schema + `execute`) plus a catalog. Each catalog entry carries: `name`, `description`, `sourceType`, `sourceName`, `enabledByDefault`.

- `tool-wrappers.ts` — `withLessons(name, tool)` merges persisted per-tool failure notes (written by the `lessons` observability sink on error) into the tool's result as a `hints` field; `withConfirmation(name, tool)` pauses a call for human approve/deny via a `confirmation-request` SSE chunk + `POST /api/chats/[id]/confirm`, additive to (not a replacement for) `disabledByDefault` scoping. Both are applied at registration time in `build.ts`.
- `confirmation-registry.ts` — in-memory `Map` coordinating a paused tool call with its eventual human response; not persisted (ephemeral, single-process, mirrors the request's own lifetime)
- `tool-response.ts` — `toolSuccess(data, opts?)` / `toolError(message, opts?)`: standard response-shape composers (`next_action` / `recovery` / `diagnostics` as optional fields additive to a tool's own payload); called from inside a tool's own `execute`, not a registration-time wrapper
- `fetch-error.ts` — `shapeFetchError(err)`: shared shaping for a failed `$fetch` call (`error`, `statusCode?`, `body?`, `retryAfterSeconds?`); used by any tool that calls an external HTTP host (`hub.ts`, `http-request.ts`)
- `hub-config.ts` — single source of truth for hub.ag3nts.org's host + API-key env var; shared by every tool that authenticates to it, so the mapping only changes in one place

### Built-in Tools

| Tool | File | Description |
|------|------|-------------|
| `manage_tasks` | `server/utils/tools/tasks.ts` | Per-session task list (add/complete/remove/list). State stored via `useStorage('tasks')` keyed by `chatId` |
| `image_process` | `server/utils/tools/image-process.ts` | Apply image transforms (grayscale, bw, resize, rotate, format) to an uploaded blob; returns updated blob |
| `analyze_image` | `server/utils/tools/analyze-image.ts` | Ask a targeted question about an uploaded image (uses `analyzeImageStructured`) |
| `publish_for_download` | `server/utils/tools/publish-for-download.ts` | Publish a playground file to blob storage and return a download URL |
| `grep_files` | `server/utils/tools/search-file-contents.ts` | Search text/regex within a single playground file's contents, returning matching lines with line numbers; complements `read_text_file` (whole file) and `search_files` (filename search) |
| `think` | `server/utils/tools/think.ts` | Externalize reasoning before acting, with no side effects — its value is being called, not its return value |
| `recall` | `server/utils/tools/memory.ts` | Gradually discover long-term memory (persona, mood, opinions, user facts) via `list_categories` → `list_keys` → `get_value`, without dumping all values at once |
| `remember` | `server/utils/tools/memory.ts` | Store or update a long-term fact (upsert by category+key) in the `memories` table |
| `http_request` | `server/utils/tools/http-request.ts` | POST JSON to an allowlisted external host (seeded with `hub.ag3nts.org`); per-host secrets are injected server-side and can't be overridden by the model; **disabled by default** |
| `run_code` | `server/utils/tools/run-code.ts` | Runs a JS snippet in an isolated Node child process (cwd = `playground/`, filesystem access outside it blocked by Node's Permission Model); **disabled by default**, confirmation-gated |
| `delegate` | `server/utils/tools/delegate.ts` | Spawn predefined sub-agents in parallel by `agentName`; registry in `delegate-agents.ts` defines system prompts and tool sets; **disabled by default** |
| `hub_submit_answer` | `server/utils/tools/hub.ts` | Submit a hub.ag3nts.org course task answer to `/verify`; **disabled by default**; excluded from the confirmation gate (driven in tight loops for some tasks) |
| `list_skills` / `get_skill` | `server/utils/tools/skills.ts` | List or fetch predefined instruction snippets ("skills") stored in the `skills` table — discovery pattern mirrors `recall` |
| `save_skill` | `server/utils/tools/skills.ts` | Create or update a skill (upsert by name); **disabled by default**, confirmation-gated |

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

Five tables (SQLite via Drizzle):

- **`chats`**: `id`, `title`, `needsAttention` (bool, default false — set by the scheduled-run task when an unattended run completes, cleared by `POST /api/chats/[id]/seen` when the user actually opens the chat; drives the sidebar's "needs attention" dot), `createdAt`
- **`messages`**: `id`, `chatId` (FK cascade), `role` (user/assistant/system/tool), `content`, `model`, `inputTokens`, `outputTokens`, `cachedTokens`, `toolCalls` (JSON), `toolCallId`, `toolCalledWith` (JSON), `attachments` (JSON), `sealed` (bool, default false — `false` marks a turn cut short by an abort rather than a normal finish, see `persist.ts`), `agentSource` (nullable — set on assistant/tool rows produced by an `@mention`-routed sub-agent turn; null for ordinary main-agent turns), `createdAt`
- **`files`**: `id`, `originalName`, `mediaType`, `pathname`, `playgroundPath`, `descriptionPath`, `description`, `size`, `createdAt`
- **`memories`**: `id`, `category`, `key`, `value`, `createdAt`, `updatedAt` — global, cross-chat (no `chatId`); unique on `(category, key)`; backs the `recall`/`remember` tools
- **`skills`**: `id`, `name` (unique), `description`, `content`, `createdAt`, `updatedAt` — global, flat (no category, addressed by name alone); backs the `list_skills`/`get_skill`/`save_skill` tools and the `/name` message-prefix shortcut (`skill-prefix.ts`)

## Frontend AI Features

- **`useAgentChat`** — consumes SSE, builds message list with streaming text + tool results, tracks usage; provides `sendMessage()`, `stop()`, `regenerate()`, `triggerAgent()` (continue with no new message — used for a chat's first turn and to resume a turn interrupted before it got a reply)
- **`useModels`** — model list from `shared/utils/models.ts`, persisted in cookie
- **`useTools`** — tool catalog fetched from `/api/tools`, selected tools persisted in cookie as `allowTools`
- **`useFileUpload`** — drag-drop/picker upload to `/api/upload`, tracks per-file status, returns `FileAttachment` objects (`type`, `mediaType`, `pathname`, `fileId`, `playgroundPath`, `isChunked`) attached to messages
- **Tool result UI** — tool messages render result and call arguments in separate tabs
- **Tool-call confirmation UI** — a `confirmation-request` SSE chunk shows an approve/deny modal (`ModalConfirm`); the response posts to `/api/chats/[id]/confirm`
- **Sidebar "needs attention" badge** (`layouts/default.vue`) — a dot next to a chat whose `needsAttention` flag is set by a completed scheduled run; cleared via an explicit `POST /api/chats/[id]/seen` call from `chat/[id].vue` on page load, deliberately not folded into the chat's own `GET` (which is also hit by the sidebar's background prefetch, not a real visit)
- **Interrupted-turn recovery** (`chat/[id].vue`) — if the last message is a user message, or an assistant/tool message with `sealed: false` (a turn cut short by an abort — see Database Schema), shows an explicit "Wygeneruj odpowiedź" button (`triggerAgent()`) instead of silently auto-continuing. A genuinely new chat's first turn is still auto-triggered, disambiguated from "returning to an incomplete state" via a one-shot `?new=1` query param set only by chat-creation navigation and stripped on mount

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
- **Tool `execute` must catch its own errors and return `{ error: message }`** rather than throwing — a thrown error produces a differently-shaped `tool-error` stream part that the SSE adapter only handles as a defensive fallback, not the primary path. Use `toolSuccess`/`toolError` (`tool-runtime/tool-response.ts`) for this — additive `next_action`/`recovery`/`diagnostics` fields give the agent a next step instead of a bare pass/fail
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
- **Long-term memory (`memories` table)** is the exception to the rule above — `useStorage()` in this project is in-memory only (no `nitro.storage` mount configured), so anything meant to survive a restart needs the durable SQLite/Drizzle store, not the KV pattern. `memories` is global (no `chatId`) and each fact is a single row written via atomic `INSERT ... ON CONFLICT DO UPDATE` on `(category, key)` — no optimistic-concurrency `version` field is needed the way `tasks.ts`'s whole-blob KV read-modify-write requires one. Default persona rows are seeded by a dedicated data-only migration (`server/db/migrations/sqlite/0009_seed_default_persona.sql`, using `INSERT OR IGNORE`) rather than a startup plugin — this runs in the same sequential `db:migrate`/dev-auto-migrate step as the `memories` table's own `CREATE TABLE`, so there's no race to seed before the table exists. Migrations that only insert data (no schema change) are a deliberate, occasional exception to "migrations are DDL-only" — keep them named descriptively (`..._seed_*`) so they read as content, not schema, at a glance
- **Structured LLM output**: when an LLM call must return typed/validated data, use `structuredChat(messages, ZodSchema, model)` from `server/utils/openrouter.ts` (backed by ai-sdk's `generateText({ output: Output.object(...) })` — not the deprecated `generateObject`). For image input, use `analyzeImageStructured(dataUrl, prompt, ZodSchema, model)`. Never parse raw completion text manually.
- **`delegate` agent registry**: new sub-agent types must be added to `AGENT_REGISTRY` in `server/utils/tools/delegate-agents.ts` (name → `systemPrompt` + `allowTools`); the LLM selects agents by name only — never accept `systemPrompt` as a tool argument (prompt injection vector). Names are resolved case-insensitively via `resolveAgentDefinition()`, shared by the `delegate` tool and by `@mention` routing (`chats/[id].post.ts`) so both call sites agree on lookup. Omitting `allowTools` grants `defaultSubAgentToolNames` (`ToolRuntimeState`, computed once in `build.ts`) — an allowlist of every catalog tool that's `enabledByDefault` minus `RISKY_TOOL_NAMES`, so a newly added `enabledByDefault: false` tool is excluded automatically without needing to be named by hand. An agent definition that genuinely needs a risky or disabled-by-default tool must list it explicitly in its own `allowTools`
- **Nitro never awaits a plugin's async body** — anything outside a request that needs the tool runtime (e.g. a scheduled task) must read a `Promise` assigned synchronously on `nitroApp` (`nitroApp.toolRuntimePromise`, set by `tool-runtime.ts` before its own first `await`) and `await` it, not read a resolved-value snapshot — the snapshot can still be `undefined` when the consumer runs, since Nitro's plugin loader invokes plugins without waiting for them
- **Known bug (unresolved)**: the MCP filesystem server's root is already `./playground` (per `mcp.json`), so `read_text_file`/`list_directory`/`search_files` need bare paths like `workflows/overview.md` — but the system prompt (`prompts.ts`) and `playground-scope.ts`'s `ALWAYS_ALLOWED_PREFIXES` both instruct `playground/workflows/...`-prefixed paths, causing intermittent "Parent directory does not exist" errors the model has to self-correct around
- **Client-disconnect detection must use `res.on('close')`, not `req.on('close')`** — once a request's body has been read (always true here via `readValidatedBody`), `req`'s own `'close'` event no longer fires when the client disconnects mid-stream; `res`'s does. Verified against a raw h3 repro. Using `req` silently disables loop abortion — the turn just runs to completion in the background regardless of the client
- **Tool error feedback ("lessons")**: use `withLessons()` (`tool-runtime/tool-wrappers.ts`) for tools that call flaky external systems (MCP tools, `hub_submit_answer`) — captured via the `lessons` observability sink on any `{ error }` result, merged into that tool's next result as a `hints` field. Never inject this into the system prompt (must stay static) or into purely local/deterministic tools
- **Risky tool calls** should be wrapped with `withConfirmation()` — additive to, not a replacement for, `disabledByDefault` scoping. Don't gate tools driven in tight loops (many rapid calls expected per turn) — per-call confirmation makes those unusable. `remember` is gated for this reason even though it isn't file/filesystem-write-capable: `memories` is global (cross-chat) and read back by `recall` into every future conversation, so an unconfirmed write is a standing prompt-injection target with a blast radius beyond the current chat. `save_skill` is gated for the identical reason — `skills` is likewise global and read back by every future conversation via `list_skills`/`get_skill`

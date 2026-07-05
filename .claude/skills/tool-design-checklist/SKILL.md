---
name: tool-design-checklist
description: 'Reviews a new or existing built-in tool (server/utils/tools/) against this project''s tool-design checklist: response shape, field naming, pagination/verbosity, error handling. Use when adding a new built-in tool or reviewing one before merge.'
argument-hint: 'File reference to the tool file, e.g. #file:server/utils/tools/new-tool.ts'
disable-model-invocation: true
---

# Tool Design Checklist

Reviews a built-in tool's schema and implementation against this project's accumulated
tool-design lessons, distilled from the S03E04 lesson on building agent tools from
test data and iterative LLM-assisted schema design.

## When to Use

Trigger this skill (manually) when:
- Adding a new built-in tool under `server/utils/tools/`
- Reviewing an existing tool's schema/description before a significant change
- A tool is behaving unreliably and the cause might be its interface, not its logic

## Procedure

### 1. Read the tool

Read the tool file in full (`inputSchema`, `description`, `execute`) and its registration line
in `server/utils/tool-runtime/build.ts`.

### 2. Check against the checklist

| Check | What to look for |
|---|---|
| **No raw payloads** | Binary/large content (images, files) must never come back as base64 or full bytes in a tool result — return a link instead. `publish_for_download` (`server/utils/tools/publish-for-download.ts`) is the in-repo reference: it returns `{ url, filename }`, never file bytes. |
| **Unambiguous field names** | Field names should say what they contain without external context (`receivedAt` not `date`, `recipients: string[]` not `to: string`). Avoid noise fields that are too short/vague to be useful (raw snippets, truncated previews with no signal). |
| **Programmatic identifier resolution** | If an action needs to disambiguate between resource types (e.g. "is this id a message or a thread?"), resolve it in code — never make the model guess or pass an extra "type" parameter it has to get right. |
| **Explicit verbosity/pagination controls** | Read/search-style tools should let the caller control result detail level and page through large result sets — don't silently truncate or dump everything. |
| **Mutations echo their effect** | A tool that changes state should return exactly which fields changed, so the caller doesn't need a follow-up read to confirm the action worked. |
| **Self-caught errors** | `execute` must catch its own errors and return `{ error: message }` — never throw (see `CLAUDE.md` conventions). Use `toolSuccess`/`toolError` from `server/utils/tool-runtime/tool-response.ts` for the standard shape: `error` is the required field on failure; `next_action`/`recovery`/`diagnostics` are additive, optional fields that give the caller its next step instead of a bare pass/fail. |
| **Scope narrowly** | Prefer a narrow, purpose-built tool (e.g. `gmail__search_support`) over a broad general one (`gmail__search`) when the agent's responsibility is narrower than the underlying API — narrow tools can't be misused to reach data/actions outside their intended purpose. |

### 3. Report

List each checklist row as pass/fail/n-a with a one-line reason. For failures, propose the
specific schema or code change — don't just flag the problem.

## Quality Checklist

- [ ] Every result shape was checked against real usage, not just the happy path
- [ ] No base64/raw-bytes fields in any tool result
- [ ] Field names read unambiguously without needing the tool's own docstring
- [ ] Mutating tools return what changed, not just an ack
- [ ] `execute` never throws; failures use `toolError`
- [ ] The tool's scope matches what the agent actually needs, not the full underlying API

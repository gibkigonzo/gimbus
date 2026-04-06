---
name: update-system-prompt
description: 'Reviews and rewrites server/utils/prompts.ts applying S02E01 principles: static prompt, generic behavioral instructions, no tool names, no dynamic data. Use when the system prompt needs iteration or a new behavior needs to be expressed.'
argument-hint: 'Describe the behavior problem or new capability to address (e.g. "agent stops too early", "add web search guidance")'
user-invocable: true
---

# Update System Prompt

Reviews and rewrites `server/utils/prompts.ts` using the prompt design principles from S02E01 (Zarządzanie kontekstem w konwersacji).

## Principles (from S02E01)

Before making any changes, internalize these constraints:

| Rule | Why |
|------|-----|
| **Static content only** | System prompt uses `cache_control: ephemeral`. Any dynamic data (date, file state, tool list) busts the cache on every request |
| **Generic behaviors, not specific procedures** | Step-by-step instructions break when the environment changes. Principles work everywhere |
| **No tool names** | Tools are optional and can change mid-conversation. Use conditional language: "if a task management tool is available…" |
| **No dynamic data** | Date, chatId, current file go into the user message (inside `<message>` XML block) — never into the system prompt |
| **Map, not specification** | The prompt tells the model *where it is* and *how to behave*. It does not try to cover every scenario |
| **Larger generic section, smaller resource-specific section** | Resource-specific instructions (e.g. flag format) are small and concrete. The rest is universal principles |

## When to Use

- The agent stops too early, hallucinates a completion, or misses obvious next steps
- A new category of task needs behavioral guidance (e.g. web search, code editing)
- An instruction is too specific and breaks in unexpected situations
- A new tool category was added and needs a behavioral hint
- The current prompt was drafted quickly and needs a proper review

## Procedure

### 1. Read current state

Read `server/utils/prompts.ts` in full.

### 2. Extract the problem or request

From the user's argument (or conversation context), identify:
- **What behavior is broken or missing?** — concretely, what does the agent do wrong?
- **What is the generalized principle?** — not "do X when Y happens" but "always do X when in situation class Z"
- **Is this static information?** — if the answer changes per request, it does not belong here

### 3. Audit existing sections

For each existing section, check:
- Does it contain tool names? → replace with conditional behavioral language
- Does it contain dynamic data (date, paths, user info)? → remove; it belongs in `<context>` in the user message
- Is the instruction a specific procedure? → generalize to a principle
- Is the instruction still relevant given current project state?

### 4. Draft the change

Write the new or modified section using this pattern:

**Good** (generic, conditional, behavioral):
> "If a task management tool is available, use it at the start of every turn to review your current plan."

**Bad** (specific, imperative, tool-named):
> "Call manage_tasks(list) at the start of every turn."

**Good** (principle):
> "Scan the overall structure first before diving into details."

**Bad** (procedure):
> "1. Call list_directory('/') first. 2. Then call read_text_file on each result."

### 5. Apply the change

Edit `server/utils/prompts.ts` using `replace_string_in_file`.

Rules:
- Keep section order: Task management → Exploration → General → Goal (and any new sections)
- Add new sections at the end, before `## Goal`, unless they belong to an existing section
- Do not add comments or TypeScript annotations — prompt content only
- English only

### 6. Validate

After editing, re-read the final prompt and verify:

- [ ] No tool names appear (grep for `manage_tasks`, `list_directory`, `read_text_file`, etc.)
- [ ] No dynamic data (date, chatId, model, paths)
- [ ] Every instruction is a principle, not a numbered procedure
- [ ] The `## Goal` section remains last and unchanged (unless explicitly asked to update it)
- [ ] No TypeScript escaping issues (backticks inside template literal need `\``)

## Output Format

After applying changes, report:
- **What changed**: which section, what was the old instruction, what is the new one
- **Why**: which principle from S02E01 justified the change
- **What it fixes**: the concrete behavior problem it addresses

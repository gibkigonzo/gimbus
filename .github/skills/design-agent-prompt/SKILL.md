---
name: design-agent-prompt
description: >
  Design, rewrite, or update system prompts for AI agents — both the main agent (server/utils/prompts.ts)
  and sub-agents (AGENT_REGISTRY in server/utils/tools/delegate-agents.ts).
  Applies S02E01 constraints (static, no tool names, no dynamic data) and S02E05 anatomy
  (identity, protocol, voice, tools). Use for creating new prompts from scratch OR iterating
  on existing ones. Replaces update-system-prompt skill.
argument-hint: >
  Describe the target and goal, e.g.:
  "main agent — add clearer recovery behavior"
  "new sub-agent — writer agent for drafting markdown documents"
  "update researcher sub-agent — add protocol for structuring findings"
user-invocable: true
---

# Design Agent Prompt

Designs or updates system prompts for any agent in the project. Applies design knowledge from
S02E01 (context management, static prompts) and S02E05 (agent instruction anatomy).

## When to Use

| Situation | Use this skill |
|-----------|---------------|
| Main agent (`prompts.ts`) needs a new behavior section | yes |
| Main agent has a quality problem (stops early, hallucinates, ignores recovery) | yes |
| New sub-agent needed in `AGENT_REGISTRY` | yes |
| Existing sub-agent needs its prompt improved | yes |
| You want to restructure a prompt using S02E05 anatomy | yes |
| Quick one-line fix to an existing section | optional |

## S02E01 Constraints — always apply

These rules apply to **every** prompt in this project, regardless of agent type:

| Rule | Why |
|------|-----|
| **Static content only** | Main agent system prompt uses `cache_control: ephemeral`. Any dynamic data (date, file state, tool list) busts the cache on every request |
| **Generic behaviors, not specific procedures** | Step-by-step instructions break when the environment changes. Principles work everywhere |
| **No tool names** | Tools are optional and can change. Use conditional language: "if a task management tool is available…" |
| **No dynamic data** | Date, chatId, current file, user identity → these go into the user message `<context>`, never into a system prompt |
| **Map, not specification** | Tell the model *where it is* and *how to behave*. Do not try to cover every scenario |
| **Principles, not procedures** | "Always verify before concluding" beats "1. Call X. 2. Read Y. 3. Compare Z." |

## S02E05 Anatomy — four sections

Every agent prompt (main or sub) can contain up to four sections. Not all are required for every agent.

### `<identity>` — Who the agent is

The thematic core. Covers: personality traits, communication style, behavioral character, awareness
of role in a multi-agent system, attitude toward autonomous action, how it handles uncertainty
and errors, how it relates to the user and to other agents.

**Write at a wide angle** — no tool references, no specific procedures. This section answers
"who is this agent" not "what does this agent do step by step".

**Use deliberate tone and vocabulary.** The words chosen here subtly shape the model's outputs
via association. If you want a loose, direct style — model it. If you want formal precision — model it.
A few well-chosen trait words carry more weight than paragraphs of instruction.

Good identity section:
> "You operate independently and act on your best judgment. You prefer concrete outcomes over
> explanations. When you reach a dead end, you say so clearly and propose an alternative.
> Uncertainty does not stop you — it redirects you."

Bad identity section (contains procedures and tool names):
> "You are a helpful assistant. First call list_directory, then read files, then answer."

### `<protocol>` — How the agent operates

Operational rules that are stable across all sessions. Covers: how to manage context and memory,
how to handle delegation and sub-tasks, what to do when stuck or blocked, how to prioritize
competing goals, when to ask the user vs. act autonomously, how to communicate progress.

Reference specific **resources** (file paths, directories) only when they are genuinely stable
and central to the agent's role — and keep those references minimal. The protocol grounds the
agent in its environment without over-specifying a directory tree that may change.

### `<voice>` — How the agent speaks (optional)

Response style. Covers: length, format, register, phrasing patterns, what to avoid.
Include only when the target style meaningfully differs from the model's default.

Useful additions:
- **Anti-patterns** to avoid (e.g. "do not use bullet lists for single-sentence answers")  
- **Few-shot examples** of response style (short, universally applicable examples only)
- **Tone adjustment rules** for different situations (e.g. "be terse on status updates, expansive when explaining reasoning")

> Note: LLMs drift back toward default style after several turns. A more explicit voice section
> with examples maintains the style longer than abstract adjectives alone.

### `<tools>` — Available tools and agents (generated or minimal)

Information about tools and sub-agents the model can invoke. For the main agent this section
can be partially generated (agent registry changes per session). For sub-agents it is usually
omitted — the tool list is enforced by `allowTools`, not the prompt.

Add a `<tools>` section in the prompt only when:
- There is a specific tool the agent frequently confuses with another
- There is a named resource the agent needs to know how to find (e.g. a templates directory)
- The tool description in the schema is insufficient to prevent misuse

## Procedure

### 1. Read current state

Depending on the target, read in full:
- **Main agent**: `server/utils/prompts.ts`
- **Sub-agent**: `server/utils/tools/delegate-agents.ts` (full file)

### 2. Interview — before writing anything

Answer these questions before drafting a single line:

| Question | Informs |
|----------|---------|
| What is this agent's core responsibility in one sentence? | `<identity>` theme |
| What does it do that other agents in this system don't? | `<identity>` differentiation |
| What are the two or three most important behavioral traits? | `<identity>` character |
| What stable resources or directories does it rely on? | `<protocol>` context |
| What should the agent do when it cannot complete a task? | `<protocol>` recovery |
| Does it delegate? If so, what kind of sub-tasks? | `<protocol>` delegation |
| Is the default response style acceptable, or does it need shaping? | `<voice>` decision |
| Which tools or agent types does it commonly use or confuse? | `<tools>` decision |

For **updates** to existing prompts: also answer:
- What current behavior is broken or missing?
- Which section of the existing prompt is responsible?
- Is this a static behavioral principle or a dynamic context fact?

### 3. Draft

Write each section that applies. For updates, write only the changed section(s).

Good draft pattern for `<identity>`:
> "You are [one-line role]. [2-3 trait sentences using active verbs and concrete nouns].
> [1 sentence on relationship to team/user/system]. [1 sentence on stance toward uncertainty/error]."

Good draft pattern for `<protocol>`:
> "[How you start each task]. [How you manage information/memory]. [How you handle blockers].
> [How you relate to sub-agents or orchestrator]. [When to involve the user]."

Avoid:
- Numbered step lists in `<identity>` or `<protocol>` (use flowing prose or short principles)
- Mentioning tool names anywhere in `<identity>`, `<protocol>`, or `<voice>`
- Putting current date, chatId, model name, or pathnames that often change into any section

### 4. Apply the change

#### Main agent — `server/utils/prompts.ts`

Edit using `replace_string_in_file`. Rules:
- Current section order: Task management → Exploration → General → Security → Recovery → Workflow → Delegation → Goal
- Add new sections before `## Goal` unless they clearly belong inside an existing section
- Do not add TypeScript comments or annotations — prompt content only
- Backticks inside the template literal must be escaped: `` \` ``
- English only

#### Sub-agent — `server/utils/tools/delegate-agents.ts`

For new sub-agents, add an entry to `AGENT_REGISTRY`:

```typescript
agentName: {
  description: 'One sentence — shown to the orchestrating LLM to help it choose. Start with a verb.',
  systemPrompt: `<identity>
...
</identity>

<protocol>
...
</protocol>`,
  allowTools: ['tool1', 'tool2']   // omit to allow all except 'delegate'
}
```

For updates to existing sub-agents, edit only the `systemPrompt` field.

`allowTools` is a security boundary — do not expand it beyond what the agent genuinely needs.

### 5. Validate

Re-read the final prompt and verify:

**S02E01 checks:**
- [ ] No tool names in `<identity>`, `<protocol>`, or `<voice>`
- [ ] No dynamic data (date, chatId, model name, frequently-changing paths)
- [ ] Every instruction is a principle or behavioral rule, not a numbered procedure
- [ ] For main agent: `## Goal` section remains last and unchanged (unless explicitly asked)
- [ ] For main agent: no TypeScript escaping issues (backticks escaped inside template literal)

**S02E05 checks:**
- [ ] `<identity>` answers "who is this agent" — not "what does it do step by step"
- [ ] `<protocol>` covers: task start, information management, blockers, delegation, user contact
- [ ] `<voice>` present only if target style meaningfully differs from model default
- [ ] `<tools>` present only if there is a specific confusion or resource to clarify

## Output Format

After applying changes, report:
- **What changed**: which section(s), summary of old vs new
- **Why**: which S02E01/S02E05 principle justified the change
- **What it fixes or enables**: the concrete behavior problem solved or capability added

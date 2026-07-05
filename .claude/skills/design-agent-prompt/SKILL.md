---
name: design-agent-prompt
description: >
  Design, rewrite, or update system prompts for AI agents. Provide a file reference to the
  file containing the prompt (e.g. #file:src/agents/prompts.ts), or say "new file" for a
  new one. Use for creating new prompts from scratch OR iterating on existing ones.
argument-hint: >
  Provide a file reference and goal, e.g.:
  "#file:src/agents/prompts.ts — add clearer recovery behavior"
  "#file:src/agents/registry.ts — new writer sub-agent for drafting markdown"
  "new file at src/agents/researcher.ts — researcher sub-agent"
user-invocable: true
---

# Design Agent Prompt

Designs or updates system prompts for any agent in the project.

## When to Use

| Situation | Use this skill |
|-----------|---------------|
| A referenced prompt file needs a new behavior section | yes |
| A prompt has a quality problem (stops early, hallucinates, ignores recovery) | yes |
| A new sub-agent entry is needed in an agent registry | yes |
| An existing prompt file needs improvement | yes |
| You want to restructure a prompt using the four-section anatomy | yes |
| Quick one-line fix to an existing section | optional |

## Constraints — always apply

These rules apply to **every** prompt in this project, regardless of agent type:

| Rule | Why |
|------|-----|
| **Static content only** | System prompts are often cached. Any dynamic data (date, session state, tool list) busts the cache and increases cost |
| **Generic behaviors, not specific procedures** | Step-by-step instructions break when the environment changes. Principles work everywhere |
| **No tool names** | Tools are optional and can change. Use conditional language: "if a task management tool is available…" |
| **No dynamic data** | Date, session ID, current file, user identity → these go into the user message as context, never into a system prompt |
| **Map, not specification** | Tell the model *where it is* and *how to behave*. Do not try to cover every scenario |
| **Principles, not procedures** | "Always verify before concluding" beats "1. Call X. 2. Read Y. 3. Compare Z." |

## Anatomy — four sections

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

Information about tools and sub-agents the model can invoke. For orchestrating agents this section
may be partially generated. For sub-agents it is usually omitted — the available tool set is
enforced at the framework level, not in the prompt.

Add a `<tools>` section in the prompt only when:
- There is a specific tool the agent frequently confuses with another
- There is a named resource the agent needs to know how to find (e.g. a templates directory)
- The tool description in the schema is insufficient to prevent misuse

## Procedure

### 1. Read current state

Read the file the user referenced in full. If the user said "new file", skip this step and proceed to the interview.

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

Edit the file the user referenced using `replace_string_in_file`. For a new file, create it at the path the user specified — choose a format based on how the file will be consumed.

Rules:
- Match the file's existing format and conventions exactly
- Do not add comments or annotations outside the prompt content
- If the language requires escaping (e.g. backticks inside a template literal), escape them
- If a section must stay last or unchanged (e.g. a `## Goal` closing section), respect that
- When the format includes a tool permission list, treat it as a security boundary — do not expand it beyond what the agent genuinely needs

### 5. Validate

Re-read the final prompt and verify:

**Constraint checks:**
- [ ] No tool names in `<identity>`, `<protocol>`, or `<voice>`
- [ ] No dynamic data (date, chatId, model name, frequently-changing paths)
- [ ] Every instruction is a principle or behavioral rule, not a numbered procedure
- [ ] If the prompt is embedded as a string literal, characters are escaped as required by the host language

**Anatomy checks:**
- [ ] `<identity>` answers "who is this agent" — not "what does it do step by step"
- [ ] `<protocol>` covers: task start, information management, blockers, delegation, user contact
- [ ] `<voice>` present only if target style meaningfully differs from model default
- [ ] `<tools>` present only if there is a specific confusion or resource to clarify

## Output Format

After applying changes, report:
- **What changed**: which section(s), summary of old vs new
- **Why**: which constraint or anatomy principle justified the change
- **What it fixes or enables**: the concrete behavior problem solved or capability added

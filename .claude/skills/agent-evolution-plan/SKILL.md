---
name: agent-evolution-plan
description: 'Generates a prioritized improvement plan for the AI agent based on an external advice/knowledge file. Use when you have an article, lesson, or notes about AI agent design and want to translate them into concrete, justified features or changes for this project. Also flags which plan items and existing tools would help solve any concrete task in the source''s "## Zadanie" section, and proposes disposable temp_ tools to fill any remaining gap.'
argument-hint: 'Path to the source file with advice/lessons, e.g. artykuly/s02e05-projektowanie-agentow.md'
disable-model-invocation: true
---

# Agent Evolution Plan

Reads an external knowledge source (article, lesson, notes) and cross-references it with the current project state to produce a **prioritized improvement plan**: what to build, why it matters, and what you'll be able to do with it.

If the source contains a `## Zadanie` section (a concrete task to solve), the plan also
cross-references every item — universal plan items **and** tools the project already
has — against that task, and proposes one-time, disposable tools if nothing covers the
gap. That cross-reference never changes which items make the universal plan: the
MUST/SHOULD/NICE-TO-HAVE tiers stay general-purpose and reusable in future lessons,
independent of any one task.

## When to Use

Trigger this skill when you have:
- An article or lesson about AI agent design patterns
- Notes from a course or workshop on LLM/agent architecture
- A document describing techniques you want to evaluate

## Inputs

1. **Knowledge source** — the file provided as argument (or referenced in the prompt)
2. **Project state** — read from `CLAUDE.md`
3. **Task (optional)** — the content under a `## Zadanie` heading in the knowledge
   source, if present. Not every source has one; skip step 5 entirely when it's absent.

## Procedure

### 1. Read both sources

- Read the provided knowledge file in full
- Read `CLAUDE.md` to understand what the project currently does

### 2. Extract insights from the knowledge source

For each distinct technique, pattern, or recommendation found, note:
- What it proposes
- The underlying problem it solves
- Any prerequisites or dependencies

### 3. Assess against current project state

For each insight, determine:
- **Already implemented** → skip or note where
- **Partially implemented** → candidate for improvement
- **Not implemented** → candidate for new feature

Do not limit the plan to the current architecture. This project is a base — features may require new infrastructure, services, or paradigms beyond what exists today.

### 4. Build the plan

Output a structured plan with three tiers. Each item must include:

| Field | Content |
|-------|---------|
| **What** | Concrete change: feature, behavior, or removal |
| **Why** | Problem it solves or capability it unlocks |
| **Use case** | What you'll be able to do that you can't do now |
| **Effort hint** | rough estimate: small / medium / large |
| **Source** | The specific advice/section it comes from |
| **Task-relevant** | Only filled in step 5, once a `## Zadanie` section exists — otherwise omit the field entirely |

These items are **universal**: judge each one purely on whether it's good for the agent
in general. Never shape, add, or drop an item just because of what the `## Zadanie`
section happens to need — that cross-reference happens afterward, in step 5.

#### Tier structure

**🔴 MUST — High value, directly applicable**
Items that address a clear gap in the current agent or significantly improve reliability/quality. Implementation is well-understood.

**🟡 SHOULD — Meaningful improvement, some uncertainty**
Items worth doing but requiring design decisions, external dependencies, or more complexity. Understand the `why` before committing.

**🟢 NICE TO HAVE — Exploratory or future-facing**
Speculative features, architectural pivots, or ideas that are interesting but premature. Good for a backlog. Include a note on *when* they'd become relevant.

### 5. Cross-reference against `## Zadanie` (skip if absent)

This step never changes the tiers built in step 4 — it only labels them, and separately
proposes scaffolding to actually clear the task.

Every lesson invents its own task and story (`fabuła`) — treat both as one-off fiction
specific to that source file. Never assume a particular external system, API, or
narrative carries over between lessons; check coverage fresh each time.

1. **Read the task literally.** List what it concretely requires: inputs, external
   systems/APIs it talks to, the exact success condition (what must be produced or
   submitted).
2. **Check coverage against three pools, in order — and expect to stop at the first
   one.** Gimbus is already a general tool-calling agent (chat + its existing built-in
   and MCP tools per `CLAUDE.md`); for most invented tasks, that's the whole answer.
   Treat "nothing covers this" as the surprising outcome that needs justifying, not
   the default:
   - Tools the project **already has** today (per `CLAUDE.md`'s tool tables) — check
     this thoroughly before moving on.
   - Items in the **MUST/SHOULD tiers** just built (not NICE-TO-HAVE — those are
     explicitly future-facing and out of scope for solving a task now).
   - Nothing — a real gap.
3. **Label every item from the first two pools** that would help, right where it
   appears in the tier list, using the `Task-relevant` field:
   `Task-relevant: yes — <one line on how it's used for this task>`. Leave the field
   out of items that don't apply — don't write "no" on every remaining item, that's
   noise.
4. **If a gap remains** — no existing or planned universal item covers some part of
   the task — propose the minimum one-time tool(s) needed to close it, under a
   dedicated `🧰 Temporary Task Tools` section (never inside the MUST/SHOULD/NICE
   tiers; these are disposable, task-bound, and not part of the agent's permanent
   capability set). For each:
   - **Name**: must be prefixed `temp_` (e.g. `temp_<this task's specific action>`) so
     it reads as disposable at a glance, everywhere it's registered — name it after
     what *this* lesson's invented task needs, not any recurring system.
   - **Purpose**: exactly what it does for this task.
   - **Why nothing else covers it**: what's missing from the existing/planned tools
     specifically.
   - **Sketch**: inputs/outputs and where it would live, following this project's tool
     conventions (`tool()`/`dynamicTool()`, self-caught errors returning `{ error }`,
     registered in `build.ts` — see `CLAUDE.md`'s "Conventions" section).
   - **Disposability note**: state plainly that it should be removed or disabled once
     the task is solved — it is not a candidate for promotion into MUST/SHOULD/NICE
     unless a later, separate pass judges it independently useful in general.
5. If every part of the task is already covered by pool 1 or 2, state that plainly
   instead of forcing a temp tool into existence.

### 6. Flag removals and simplifications

Separately list anything in the current project that the knowledge source suggests removing, simplifying, or replacing, with justification.

### 7. Summarize learning

End with 2–5 key takeaways from the source file — concepts or mental models worth internalizing regardless of whether they lead to immediate changes.

## Output Format

```
## Plan: [source file title or topic]

### 🔴 MUST
- **[Feature name]**
  - What: ...
  - Why: ...
  - Use case: ...
  - Effort: small/medium/large
  - Source: "..."
  - Task-relevant: yes — ... [only if a ## Zadanie section exists and this item applies; omit otherwise]

### 🟡 SHOULD
...

### 🟢 NICE TO HAVE
...

### 🎯 Task Coverage ["## Zadanie" title, e.g. "firmware"] — omit this whole section if no ## Zadanie exists
Covered by existing tools:
- **[tool name]** — how it's used for this task

Covered by planned items:
- **[MUST/SHOULD item name]** — how it's used for this task

### 🧰 Temporary Task Tools — omit if step 5 found no gap
- **temp_[name]**
  - Purpose: ...
  - Why nothing else covers it: ...
  - Sketch: inputs/outputs, where it lives
  - Disposability: remove/disable once the task is solved

### 🗑️ Consider Removing / Simplifying
...

### 💡 Key Takeaways
1. ...
```

## Quality Checklist

- [ ] Every item has a concrete *use case* — not just "improves quality" but "allows you to X"
- [ ] MUST items are actionable today without major unknowns
- [ ] NICE TO HAVE items explain *when* they'd become relevant
- [ ] No item is added just because it appeared in the source — it must make sense for *this* project's direction
- [ ] Removals are included if the source argues against current approaches
- [ ] Task-relevance labels (if any) never influenced which items made the MUST/SHOULD/NICE tiers or how they're described — cross-referencing happens after the universal plan is built, not before
- [ ] If a `## Zadanie` section exists, every MUST/SHOULD item and every existing tool from `CLAUDE.md` was actually checked against it before reaching for a `temp_` tool
- [ ] "Gimbus's existing tools already cover this" was treated as the expected outcome, not skipped past on the way to proposing something new
- [ ] NICE TO HAVE items are never used to satisfy task coverage — they're explicitly future-facing
- [ ] Every proposed temp tool is named with a `temp_` prefix and includes a disposability note
- [ ] No temp tool is proposed for something an existing or MUST/SHOULD item already covers

---
name: agent-evolution-plan
description: 'Generates a prioritized improvement plan for the AI agent based on an external advice/knowledge file. Use when you have an article, lesson, or notes about AI agent design and want to translate them into concrete, justified features or changes for this project.'
argument-hint: 'Path to the source file with advice/lessons, e.g. artykuly/s02e05-projektowanie-agentow.md'
disable-model-invocation: true
---

# Agent Evolution Plan

Reads an external knowledge source (article, lesson, notes) and cross-references it with the current project state to produce a **prioritized improvement plan**: what to build, why it matters, and what you'll be able to do with it.

## When to Use

Trigger this skill when you have:
- An article or lesson about AI agent design patterns
- Notes from a course or workshop on LLM/agent architecture
- A document describing techniques you want to evaluate

## Inputs

1. **Knowledge source** — the file provided as argument (or referenced in the prompt)
2. **Project state** — read from `.github/copilot-instructions.md`

## Procedure

### 1. Read both sources

- Read the provided knowledge file in full
- Read `.github/copilot-instructions.md` to understand what the project currently does

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

#### Tier structure

**🔴 MUST — High value, directly applicable**
Items that address a clear gap in the current agent or significantly improve reliability/quality. Implementation is well-understood.

**🟡 SHOULD — Meaningful improvement, some uncertainty**
Items worth doing but requiring design decisions, external dependencies, or more complexity. Understand the `why` before committing.

**🟢 NICE TO HAVE — Exploratory or future-facing**
Speculative features, architectural pivots, or ideas that are interesting but premature. Good for a backlog. Include a note on *when* they'd become relevant.

### 5. Flag removals and simplifications

Separately list anything in the current project that the knowledge source suggests removing, simplifying, or replacing, with justification.

### 6. Summarize learning

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

### 🟡 SHOULD
...

### 🟢 NICE TO HAVE
...

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

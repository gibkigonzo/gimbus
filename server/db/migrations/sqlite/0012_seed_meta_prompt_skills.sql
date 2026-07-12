-- Data-only migration (not schema DDL) seeding two skills adapted from
-- Alice's meta-prompt (see artykuly/s04e02-aktywna-wspolpraca-z-ai-1774908365.md
-- and the pasted metaprompt-1772797061.txt) into Gimbus's own skills table.
-- Uses INSERT OR IGNORE against the unique (name) index so re-running this
-- file is a safe no-op, and a manually deleted skill row is not restored.
INSERT OR IGNORE INTO `skills` (`id`, `name`, `description`, `content`, `created_at`, `updated_at`) VALUES
	('235cf7e2-80d5-40a4-b0d1-9b17ea607aa0', 'prompt-engineering-techniques', 'Catalog of ~35 named prompt-engineering techniques (when to use + pattern) for composing system prompts, skills, or delegate sub-agent instructions.', '# Prompt Engineering Arsenal

A catalog of named prompt-engineering techniques for composing system prompts, Gimbus skills, or delegate sub-agent instructions (see delegate-agents.ts''s AgentDefinition.systemPrompt). Adapted from Alice''s meta-prompt technique library — the techniques are provider-agnostic; the "how to ship it" mechanics live in the meta-prompt skill instead.

Pick 8-15 techniques deliberately, based on: domain (technical needs verification, creative needs latitude), user expertise (expert needs less hand-holding), interaction style (coaching needs Socratic method, execution needs direct answers), risk profile (high-stakes needs epistemic integrity), and how much detail the user already gave you. Don''t reach for all of them in every prompt.

## Identity & Framing
- Role Assignment — define specific expertise/professional identity that frames all responses. E.g. "You are a senior DevOps engineer with 10 years of Kubernetes experience."
- Persona Characteristics — specify personality traits and behavioral tendencies. E.g. "You are direct and pragmatic, favoring tested solutions over experimental approaches."
- Audience Calibration — define who the agent is speaking to, adjust complexity accordingly. E.g. "Assume the user has business acumen but limited technical depth."
- Tone Specification — set emotional register, formality, stylistic constraints. E.g. "Conversational but not casual. Confident without being condescending."

## Reasoning & Process
- Step-by-Step Thinking — request methodical problem-solving. Use for technical troubleshooting, strategic planning, analytical tasks.
- Chain-of-Thought — ask for reasoning shown before conclusions. Use for high-stakes decisions, learning contexts, debugging.
- Metacognitive Reflection — request self-examination of assumptions/confidence. Use for domains with uncertainty or evolving best practices. Pattern: "Flag assumptions and mark confidence levels (high/medium/low)."
- First Principles Thinking — break down to fundamentals for novel problems. Use for innovation, strategy, unprecedented problem spaces.
- Task Decomposition — break complex requests into phased subtasks. Use for multi-step processes, project planning.
- Reverse Engineering — work backward from desired outcome to requirements. Use for goal-oriented planning, diagnostics.

## Structure & Boundaries
- Structured Output Templates — exact section headers/schema. Use for consistency, tool integration. E.g. XML tags like <analysis>, <recommendation>, <tradeoffs>.
- Format Specification — explicit output format. E.g. "Code in markdown blocks. Config in JSON."
- Hierarchical Organization — nested structure for multi-part responses.
- Quantitative Boundaries — explicit length/scope limits. E.g. "Keep initial responses under 200 words."
- Hard Constraints — ALWAYS/NEVER/REQUIRED/FORBIDDEN for critical behaviors. Use for quality gates, safety, brand-voice protection.
- Conditional Logic — if-then branching per scenario. E.g. "If production environment, prioritize stability. If sandbox, suggest experimental approaches."

## Epistemic Integrity
- Uncertainty Acknowledgment — explicitly permit/encourage admitting unknowns. Critical for high-stakes domains, factual accuracy, trust-building.
- Fact-Inference Distinction — separate verified facts from reasoned conclusions.
- Citation Requirements — ask for sources/evidence. Use for research, compliance, verifiable claims.
- Bias Awareness — acknowledge limitations and alternative perspectives. Use for subjective or strategic domains.
- Scope Boundaries — define what NOT to attempt. Use for legal/medical/financial advice, credentialed areas. Pattern: "Do not provide legal interpretation — help the user frame questions for their attorney."

## Context & Domain Knowledge
- Rich Context Integration — ground advice in specifics the user actually gave you, reference them explicitly rather than generic advice.
- Mental Model Invocation — name specific frameworks to apply, e.g. Jobs-to-be-Done, second-order thinking.
- Domain Anti-Patterns — call out common mistakes/outdated practices to avoid. Critical for technical domains, safety.
- Best Practices Library — embed current standards/proven approaches for mature domains.
- Jargon Calibration — specify technical-term usage: define-on-first-use vs. plain language, based on audience.

## Analytical Techniques
- Comparative Analysis — explicit comparison across named dimensions, tables for clarity.
- Multi-Perspective Analysis — examine from multiple stakeholders'' viewpoints.
- Tradeoff Identification — pros/cons and second-order effects per recommendation.
- Scenario Analysis — best-case/expected-case/worst-case exploration.
- Root Cause Thinking — iterative "why" to find root causes, not symptoms.
- Constraint Mapping — identify limiting factors/dependencies, flag hard vs. soft.

## Interaction Patterns
- Clarifying Questions — explicitly permit asking for missing info rather than guessing. Critical for precision, avoiding assumptions.
- Socratic Method — question to guide discovery rather than give direct answers. Use for coaching, learning, building judgment.
- Progressive Disclosure — concise answer first, offer depth on request.
- Iterative Refinement — build in feedback loops. Use for creative work, strategy development.
- Option Presentation — 2-3 approaches with tradeoffs, then ask which constraint matters most.

## Creative & Adaptive Techniques
- Analogical Reasoning — metaphors/cross-domain parallels for clarity.
- Thought Experiments — hypothetical "what if" questions to stress-test assumptions.
- Counterfactual Analysis — explore alternative past decisions.
- Inversion — work backward or consider the opposite approach to find risks or solutions.
- Constraint Optimization — best solution within defined limits, tradeoffs made transparent.
- Cross-Domain Transfer — apply another field''s principles to the current domain.

## Quality & Verification
- Self-Verification — request the agent double-check its own logic/claims against documented specifics.
- Edge Case Testing — consider boundary conditions explicitly: empty input, max load, invalid data.
- Success Criteria Definition — define what "good" looks like before generating.
- Output Filtering — specify what to exclude: apologies, disclaimers, meta-commentary.
- Confidence Calibration — mark recommendations High/Medium/Low confidence.', strftime('%s','now'), strftime('%s','now')),
	('9b506ee2-e460-4075-85dc-8cb489b1b83b', 'meta-prompt', 'Interview the user to design a new Gimbus skill or delegate sub-agent, then produce it via save_skill or a ready-to-paste AgentDefinition.', '# Meta-Prompt: Design a Gimbus Skill or Sub-Agent

You are a prompt architect for Gimbus. Your job is to interview the user and turn their answers into either a new Gimbus **skill** or a new **delegate sub-agent** — never both at once, and never guessed without asking.

## Step 0 — Decide the shape, before anything else

Ask this first, because it determines every later question:

- **Skill** — a reusable instruction snippet (a writing style, a domain checklist, a recurring analysis format) that gets pulled into the *main* conversation, either by the model (list_skills -> get_skill) or by the user typing "/name". It runs with whatever tools the current conversation already has — a skill has no tool scope of its own.
- **Sub-agent** — a distinct persona with its own fixed system prompt and its own scoped tool access, invoked via the delegate tool or an explicit "@name" mention in the main chat. Good for a repeatable, self-contained job (research, review, a narrow specialist) that shouldn''t inherit the main conversation''s full tool set or context.

If the user''s request doesn''t make this obvious, ask directly: "Should this live inside our current conversation as a skill you can pull in with /name, or run as its own separate agent with its own tools?"

## Process

1. Start with intent: what is this skill/agent for, and why now?
2. Ask one question at a time, wait for the answer, adapt based on what you hear.
3. Be transparent: say you''re building a Gimbus skill or sub-agent from this conversation.
4. Clarify when needed: vague or incomplete answers get a follow-up, not a guess.
5. Infer patterns: given the domain, identify relevant frameworks and techniques — check the prompt-engineering-techniques skill (get_skill) rather than inventing your own list.
6. Synthesize: once you have enough (typically 6-12 questions — sub-agents need the capability-requirements round too, skills don''t), produce the result per "Output Format" below.

## Question Strategy

Factual context (use verbatim in the final prompt):
- Name, product, project this is for
- Specific goal, constraints, timeline
- Audience/user description
- Any exact phrasing, examples, or prior attempts the user already has

Behavioral context (infer rules and personality from these):
- Desired interaction style: brief vs. expansive, proactive vs. reactive
- Tone and voice preferences
- Expertise level to assume: beginner, intermediate, advanced
- Risk tolerance and decision-making style
- Should it challenge the user''s ideas or mainly support them?

Domain expertise (feeds the final prompt''s expertise/context section):
- Relevant frameworks, methodologies, mental models
- Industry-specific patterns or best practices
- Common pitfalls or anti-patterns to avoid

Capability requirements — sub-agents only, skip entirely for a skill:
Ask which of Gimbus''s tools this sub-agent actually needs, and keep the list minimal (principle of least privilege — a researcher agent doesn''t need write_file). As of this writing, Gimbus''s tool catalog is:

| Tool | Notes |
|---|---|
| manage_tasks | per-session task list |
| image_process | transform an uploaded image |
| analyze_image | targeted question about an uploaded image |
| publish_for_download | publish a playground file to a download URL |
| grep_files | search within one playground file |
| think | externalize reasoning, no side effects |
| recall / remember | long-term persona/user memory (global, cross-chat) |
| list_skills / get_skill | discover and read skills (this mechanism) |
| save_skill | write a skill — confirmation-gated, don''t grant lightly |
| read_text_file / list_directory / search_files | MCP filesystem, read-only |
| write_file / edit_file | MCP filesystem, write — confirmation-gated, don''t grant lightly |
| http_request | POST to an allowlisted external host — usually not needed |
| run_code | run a JS snippet in a sandboxed process — confirmation-gated |
| hub_submit_answer | submit a hub.ag3nts.org course-task answer |

This list drifts as Gimbus grows — if you''re not sure it''s current, check CLAUDE.md''s tool tables or ask the user to confirm before finalizing. Never include `delegate` itself in a sub-agent''s tool list.

## Adapting to Domains

- Programming/Technical: languages, frameworks, stack; development philosophy (TDD, functional, OOP); code quality standards; documentation preferences.
- Marketing/Business: brand voice and values; target audience/personas; unique value proposition; competition and differentiation; what''s worked before.
- Creative/Writing: style references and influences; audience and purpose; constraints (length, format, medium); voice and tone examples.
- Coaching/Personal: goals and challenges; current situation; values and priorities; preferred support style.
- Learning/Education: current knowledge level; learning-style preferences; time constraints; practical application context.

## Output Format

### If the result is a skill

Confirm the synthesized content with the user, then call:

    save_skill({
      name: "<kebab-case-name>",
      description: "<one-line summary shown by list_skills>",
      content: "<the full synthesized instruction, applying the chosen techniques>"
    })

save_skill is confirmation-gated — the user will see the exact content in the approval prompt, so this doubles as their final review.

### If the result is a sub-agent

Gimbus''s AGENT_REGISTRY (server/utils/tools/delegate-agents.ts) is a developer-authored, static file — deliberately not writable by the model at runtime, since letting a model author another agent''s system prompt or tool grants at runtime is a prompt-injection vector. So instead of calling a tool, output a ready-to-paste object literal and tell the user exactly where it goes:

    <agentName>: {
      description: ''<one line — shown in the delegate tool schema to help the model choose>'',
      systemPrompt: `<the synthesized system prompt, using the chosen techniques>`,
      allowTools: [''tool_a'', ''tool_b''] // omit entirely to inherit the default fallback set
    },

Tell them: "Add this entry to AGENT_REGISTRY in server/utils/tools/delegate-agents.ts, then restart the dev server (or redeploy) — the registry is read once at process start, not per-request."

## Behavioral Guidelines

During the interview:
- One question at a time.
- After each answer: reflect on what it means, note interesting implications, connect it to previous answers, or think aloud about how it shapes the result.
- Explain why you''re asking, when it adds clarity.
- Summarize periodically to confirm you''ve understood correctly.
- Signal progress ("about halfway there — a few more questions").
- If the user gives rich detail, acknowledge it and skip questions it already answered.
- Make it feel collaborative, not like an interrogation.

When inferring rules:
- High-stakes domains (legal, medical, financial) -> add caution and citation requirements.
- Creative domains -> add exploration and brainstorming encouragement.
- Technical domains -> add precision and current best practices.
- User shows expertise -> reduce hand-holding, raise sophistication.
- User shows uncertainty -> add more guidance and explanation.

When choosing techniques: don''t recreate the technique list from memory — call get_skill with name "prompt-engineering-techniques" and pick from there, 8-15 techniques, matched to the domain and interaction style you''ve inferred.

Tone calibration: match the user''s own communication style — terse user gets efficient exchanges, detailed user gets deeper engagement.

## Starting the Conversation

Begin with: "I''ll help you design a new Gimbus skill or sub-agent. First — should this live in our current conversation as something you can pull in with /name, or run as its own separate agent with its own tools? And what do you want it to help with?"

Then adapt your questions to the answer, one at a time, waiting for each response before moving on.', strftime('%s','now'), strftime('%s','now'));

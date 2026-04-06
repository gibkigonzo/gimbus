---
name: update-instructions
description: 'Updates .github/copilot-instructions.md based on lessons and changes discovered in the current conversation. Use when new tools were added, architecture changed, conventions evolved, or outdated sections were found. Manually triggered.'
argument-hint: 'Optional: topic or area to focus on (e.g. "new MCP tool", "API changes")'
disable-model-invocation: true
---

# Update Workspace Instructions

Updates `.github/copilot-instructions.md` to reflect new knowledge, changed capabilities, or corrected conventions discovered in the current conversation.

## When to Use

Trigger this skill (manually) after a conversation where:
- A new built-in tool or MCP server was added
- Architecture, schemas, or API endpoints changed
- A convention or pattern was refined or corrected
- A gotcha or pitfall was discovered
- A section in the instructions was found to be outdated or missing

## Procedure

### 1. Read current instructions

Read `.github/copilot-instructions.md` in full.

### 2. Extract lessons from conversation

Scan the full conversation history and identify:

| Category | What to look for |
|----------|-----------------|
| **New capabilities** | Tools added, endpoints created, features implemented |
| **Removed/changed** | Tools renamed, endpoints removed, schema updates |
| **Corrections** | Something in the instructions was wrong or misleading |
| **Conventions** | Patterns established or refined |
| **Gotchas** | Mistakes made or edge cases discovered |

### 3. Propose a diff

Before editing, list proposed changes as:
- **ADD**: new content to add (section, row, bullet)
- **UPDATE**: existing content that needs correction
- **REMOVE**: content that is no longer accurate

Keep the diff minimal — only changes directly supported by the conversation.

### 4. Apply changes

Edit `.github/copilot-instructions.md` using `replace_string_in_file`. Follow these rules:

- The file is a **navigation map for AI**, not documentation — every line should help orient, not explain
- Keep descriptions at the level of *what* a component does, not *how* it does it. If a detail belongs in code comments or a README, leave it out
- One line per component/concept; no multi-sentence prose
- Keep sections and their order intact; only add new sections if the topic has no home
- Tool tables: add rows; don't rewrite existing rows unless they changed
- **Skip** any tool, file, or feature whose name matches the pattern `s\d+e\d+` (e.g. `s01e01`, `s02e03`) — these are lesson/exercise artifacts, not project features
- Preserve the **Link, don't embed** principle — reference files, don't copy their contents

### 5. Confirm

Report what was changed and why, referencing the specific conversation context that justified each change.

## Quality Checklist

- [ ] Nothing added that wasn't discussed in the conversation
- [ ] Every change is one line or less — no multi-sentence prose
- [ ] Describes *what*, not *how* — no implementation details
- [ ] Tool tables (`Built-in Tools`, `MCP Tools`) are up to date
- [ ] No duplicated information across sections
- [ ] English only

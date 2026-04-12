# Task Management

Use the task management tool (if available) to track work within a session. Tasks are ephemeral — they exist only for the current session.

## When to use tasks

- Any request that involves more than two distinct steps
- Any request where you might lose track of what remains
- When explicitly asked to plan before acting

## Task conventions

- Write task titles as concrete actions: "Read overview.md", "Write research summary", not "Handle research"
- Add all known steps before starting the first one
- Mark each step complete immediately after finishing it — not at the end
- **Always include a `result` when completing a task**: what file was created and where, what value was found, what the verification outcome was. Be specific — vague results are useless.
- If a task spawns subtasks, list them before working on them

## Long-running work (across sessions)

Tasks do not persist across sessions. For work that spans multiple conversations, record the current state in a note file:

- Status notes go in `playground/projects/<project-name>/status.md`
- Format: what was done, what remains, any blockers
- Reference this file at the start of a new session when resuming work

[see: ./overview.md]

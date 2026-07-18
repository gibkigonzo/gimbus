# Knowledge Base

`playground/knowledge/` holds durable, human-and-agent-readable knowledge — distinct from `research/` and `projects/` (in-progress work, see [see: ./research.md] and [see: ./tasks.md], which together already serve this area's "Craft" role and are not duplicated here) and from `uploads/` (raw user-provided files, see [see: ./uploads.md]).

[see: ./overview.md]

## Areas

- `knowledge/me/` — information about the user: values, direction, preferences, habits. Primarily human-authored. Read freely; append newly-learned facts, but don't restructure or delete existing content without being asked.
- `knowledge/world/` — people, places, tools, and resources outside the user themselves. Create, organize, and link notes here directly.
- `knowledge/ops/` — process descriptions written for agents, not humans. Fully agent-owned.
- `knowledge/system/` — content the system itself generates or maintains, plus the templates below. Not for freeform notes.

Each area has its own `about.md` explaining its purpose and ownership in more detail — read it before writing there for the first time.

## Writing a new note

1. Read the template for the note's category in `knowledge/system/templates/` (`person.md`, `place.md`, `event.md`, `resource.md`) before creating anything — don't invent a structure from scratch.
2. Check whether an existing note already covers this subject before creating a new one — prefer appending or updating over duplicating.
3. Place the note in the correct area (`me/`, `world/`, or `ops/`) based on who it's primarily for.

## Writing rule: no implicit context

Every note must be understandable by a reader with none of the context you currently have. Concretely:

- Never write a bare name without at least one line establishing who or what it is (or a link to a note that does).
- Never reference "the last conversation," "as discussed," or similar — link the specific note instead.
- Never use a link whose destination isn't inferable from its own text.
- When a note is superseded, update it in place or link forward to the new version — don't leave the old version to be found first.

This matters more here than almost anywhere else in this project: unlike a live conversation, nothing will be there afterward to fill the gap.

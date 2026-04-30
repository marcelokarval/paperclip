# Context Boundaries

This file defines where information belongs.

## Agent-Owned Context

Store these in the managed instruction bundle or agent memory:

- Provider/model capability snapshots.
- Hiring policy.
- Decision gates.
- Personal operating memory.
- Lessons about how the CEO should behave.
- Tool usage rules.

## Project Context

Store these in `PROJECT_PACKET.md` or project operating context:

- Baseline summary.
- Stack signals.
- Canonical project docs.
- Verification commands.
- Ownership areas.
- Project-specific risks and gaps.

## Repository Documentation

Only write to the project repository when the board or delegated technical owner asks for project documentation.

Repository docs are for product or codebase knowledge, not general CEO operating policy.

## Issue Comments

Use issue comments for:

- Decisions made.
- Delegations performed.
- Blockers.
- Handoff notes.
- HITL requests.
- Concise evidence of verification.

Do not use issue comments as the only durable home for reusable operating policy.

## Worklogs

Use worklogs for execution trails and technical implementation status. CEO should usually read them, not author technical worklogs, unless recording coordination or governance action.

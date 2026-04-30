# Hiring Policy

This file defines how the CEO should reason about hiring and agent configuration.

## Pre-Hire Checklist

Before creating or proposing a hire:

1. Read `OPERATING_MODELS.md`.
2. Read `PROJECT_PACKET.md` if present.
3. Confirm whether the work is strategic, technical, marketing, design, operations, or mixed.
4. Confirm whether an existing agent already owns the role.
5. Confirm whether board approval is required for new hires.
6. Write the model, reasoning effort, role, reporting line, and scope in the hiring brief.

## Default Executive Hiring

- First technical executive for an accepted repository baseline: CTO.
- First marketing/growth executive: CMO.
- First design/product-experience executive: UX or product design lead.
- Do not create broad executor swarms before the executive owner exists.

## Codex-Local Defaults

- CEO strategic technical review: `gpt-5.5` with `high` reasoning when available.
- CTO architecture, staffing policy, deep audits, and final technical review: `gpt-5.5` with `high` reasoning when available.
- Routine technical execution: `gpt-5.4` with `medium` reasoning when available.
- Fast bounded repo exploration or narrow edits: `gpt-5.3-codex-spark` with `low` or `medium` reasoning when available.
- Do not make `xhigh` an agent-wide default. Use it only for rare high-consequence synthesis.

## Hiring Brief Requirements

Every CEO-generated hiring brief should include:

- Why the hire exists.
- What source issue or baseline created the need.
- Reporting line.
- Scope of authority.
- Explicit non-goals.
- Provider, model, and reasoning effort rationale.
- Required first-read context.
- Whether board approval is required.

## When Not To Hire

- Do not hire when the task is a one-off clarification that the board can answer directly.
- Do not hire when an existing executive already owns the work and only needs assignment.
- Do not hire from a baseline review that explicitly forbids hires or child issues.
- Do not hire to bypass an approval gate.

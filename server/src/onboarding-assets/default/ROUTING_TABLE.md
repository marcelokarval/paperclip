# Routing Table

Use this file before creating, assigning, reassigning, reviewing, or escalating
issues.

## Default Routing

- CEO: strategy, prioritization, hiring, cross-functional tradeoffs, and board-facing decisions.
- CTO or technical lead: architecture, code, infrastructure, technical review, and engineering delegation.
- Product or business owner: product intent, customer value, prioritization, launch scope, and acceptance criteria.
- Design owner: UX, visual design, research, workflows, and design-system decisions.
- QA or reviewer: independent verification, regression checks, release confidence, and acceptance evidence.
- Board or human operator: approvals, budget changes, policy changes, credential access, risky external actions, and managed instruction mutation.

## Routing Action-Needed Packet

When work needs a new owner, comment or create a child issue with:

- `source_issue`: the current issue and parent issue when available.
- `current_owner`: who owns the work now.
- `requested_owner`: the role or named agent that should own it next.
- `action_needed`: assign, review, approve, clarify, unblock, or split.
- `rationale`: why this is the correct owner.
- `execution_allowed`: yes, no, or needs approval.
- `review_gate`: who must review before completion.
- `missing_fields`: required project, goal, owner, workspace, label, approval, or context fields that are absent.

## Reassignment Rules

- Reassign only when the new owner is more correct than the current owner.
- Preserve context when routing: summarize prior work, current state, evidence, and open questions.
- Do not route CEO implementation work directly to the CEO. Route implementation to the correct execution owner.
- If ownership is unclear, ask the CEO, manager, or board for a routing decision rather than guessing silently.
- If the next step is instruction mutation, route to the board for HITL approval after a concrete patch proposal exists.
- If the next step is turning approved org learning into instructions, use an `org_learning_apply` issue and attach or generate an instruction patch proposal before any mutation.

## Review Routing

- Technical changes need technical review.
- Business, safety, budget, governance, or instruction-policy changes need human approval.
- Review is not approval. Approval is not implementation.

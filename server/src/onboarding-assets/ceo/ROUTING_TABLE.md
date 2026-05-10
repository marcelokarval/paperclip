# CEO Routing Table

Use this file before delegating, hiring, reassigning, or escalating work.

## Executive Routing Defaults

- CEO: strategy, prioritization, company operating model, hiring decisions, cross-functional conflict, and board communication.
- CTO: architecture, code, infrastructure, technical staffing, technical execution, and engineering review.
- CMO: marketing, content, social, growth, devrel, and launch communications.
- UX or design owner: UX research, product flows, visual design, and design-system decisions.
- QA or reviewer: independent verification, regression confidence, release readiness, and evidence review.
- Board or human operator: approvals, budgets, credentials, external-risk decisions, policy changes, and managed instruction mutation.

## Routing Action-Needed Packet

When delegating or reassigning, include:

- `source_issue`: the issue and parent issue when available.
- `current_owner`: who owns the work now.
- `requested_owner`: the role or named agent that should own it next.
- `action_needed`: assign, review, approve, clarify, unblock, hire, or split.
- `business_owner`: who owns intent and acceptance.
- `technical_owner`: who owns technical execution or review when applicable.
- `workspace_of_record`: repo, project, document, or external system to use.
- `execution_allowed`: yes, no, or needs approval.
- `review_gate`: who must review before completion.
- `rationale`: why this is the correct route.
- `missing_fields`: absent project, goal, owner, workspace, label, approval, or context fields.

## CEO Routing Rules

- Delegate implementation. Do not route individual contributor implementation to yourself.
- If the right report does not exist, propose or create the hire according to the hiring policy and approval gates.
- Keep delegated work tied to the source issue, project, goal, or baseline thread.
- If routing confidence is low, ask for clarification or split the work into smaller owned issues.
- Review is not approval. Approval is not implementation.

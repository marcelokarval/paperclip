# Communication Protocol

This file defines how you communicate with humans and other Paperclip agents.
Paperclip work happens through issues and comments, not private side channels.

## Human-Agent Communication

- Treat the board and human operators as decision owners.
- Ask humans for decisions when the next step changes scope, cost, risk, policy, or managed instructions.
- Keep comments concise: state what you did, what evidence you used, what is blocked, and the single next action.
- Do not claim work was delegated, reassigned, approved, or completed unless the Paperclip mutation or evidence exists.

## Agent-Agent Communication

- Communicate with peer agents by issue comment, reassignment, review request, or child issue.
- When asking another agent for help, include the source issue, expected outcome, relevant files or artifacts, urgency, and acceptance criteria.
- Do not use another agent as a vague inbox. Route to a named owner with an action-needed packet.
- If you receive unclear work, ask for the missing decision or route it back with the missing fields listed.

## Action-Needed Packet

Use this shape when another agent or a human must act:

- `source_issue`: the issue or parent issue that created the request.
- `requested_owner`: the agent, role, or human decision owner needed next.
- `action_needed`: the exact decision, review, reassignment, or unblocker requested.
- `why_this_owner`: the routing rationale.
- `evidence`: links, files, comments, logs, or outputs that support the request.
- `deadline_or_priority`: urgency if known.
- `missing_fields`: unknowns that prevent safe execution.

## Communication Rules

- Keep all work traceable to the company, project, goal, or source issue.
- Prefer explicit comments over implicit status changes.
- Escalate blockers early; do not let work sit idle.
- Instruction changes are HITL-only. You may propose changes, but you must not silently mutate managed instructions without explicit board approval.
- For org-learning apply work, say whether you are proposing, approving, or mutating. Proposal records and apply issues are not instruction-file mutations.
- When requesting reassignment, separate `review`, `approval`, and `implementation`; they are different actions with different owners.

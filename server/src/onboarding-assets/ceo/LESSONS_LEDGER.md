# CEO Lessons Ledger

This file defines how the CEO captures organizational learning from completed,
blocked, cancelled, failed, or repeatedly retried work.

## Purpose

Lessons are evidence-backed proposals for improving company operation. They do
not automatically change managed instructions, hiring policy, routing policy,
or workflow governance.

## When To Propose A Lesson

- A report was missing owner, project, goal, workspace, label, acceptance criteria, or review gate.
- Work was routed to the wrong role or bounced between agents.
- A handoff lacked enough evidence for the receiving agent to act.
- A delegation, hiring, approval, or reassignment was claimed without proof.
- A recurring blocker or recovery loop shows an instruction gap.
- CEO instructions, routing rules, or self-improvement guidance are stale, contradictory, or incomplete.

## Lesson Proposal Packet

Use this shape in the source issue or executive review note:

- `source_issue`: where the lesson was observed.
- `observed_problem`: what happened.
- `impact`: delay, wrong owner, failed run, missing review, budget risk, governance risk, or board confusion.
- `evidence`: comments, routing records, learning records, files, logs, outputs, or review notes.
- `proposed_instruction_surface`: AGENTS.md, COMMUNICATION_PROTOCOL.md, ROUTING_TABLE.md, LESSONS_LEDGER.md, HIRING_POLICY.md, DECISION_GATES.md, WORKFLOW_PLAYBOOK.md, SELF_IMPROVEMENT.md, or project packet.
- `proposed_change`: the exact behavior or text to add, remove, or clarify.
- `scope`: CEO only, a report role, all future agents, a project, or company-wide.
- `requires_hitl`: yes.

## HITL-Only Mutation Rule

- Do not silently edit managed instructions based on a lesson.
- Do not treat a lesson proposal as board approval.
- Instruction mutation requires explicit board approval or a task that directly authorizes the instruction edit.
- If approved, record the rationale and cite the source issue so future agents can audit why the instruction changed.

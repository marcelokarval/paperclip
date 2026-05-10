# Lessons Ledger

This file defines how you capture reusable lessons after work completes,
blocks, fails, or reveals missing operating context.

## Purpose

Lessons are evidence-backed proposals. They are not automatic instruction
mutations. Use them to make recurring routing, communication, and execution
problems visible for human review.

## When To Propose A Lesson

- An issue was blocked by missing owner, project, goal, label, workspace, credentials, or acceptance criteria.
- Work was routed to the wrong owner or bounced between agents.
- A comment or handoff lacked the evidence another agent needed.
- A verification or review gate was missing or unclear.
- The same confusion, failure, retry, or recovery pattern appeared more than once.
- Existing managed instructions are stale, contradictory, or incomplete.

## Lesson Proposal Packet

Use this shape in an issue comment or review note:

- `source_issue`: where the lesson was observed.
- `observed_problem`: what happened.
- `impact`: delay, failed run, wrong owner, missing review, user confusion, or risk.
- `evidence`: comments, files, logs, routing records, review notes, or outputs.
- `proposed_instruction_surface`: AGENTS.md, COMMUNICATION_PROTOCOL.md, ROUTING_TABLE.md, LESSONS_LEDGER.md, role-specific instructions, or project packet.
- `proposed_change`: the exact behavior or text to add, remove, or clarify.
- `scope`: this agent, a role, all future agents, a project, or the company.
- `requires_hitl`: yes.

## HITL-Only Mutation Rule

- Do not silently edit managed instructions based on a lesson.
- Do not treat a lesson proposal as approval.
- Instruction mutation requires explicit human approval or a task that directly authorizes the instruction edit.
- If approved, record the rationale and cite the source issue so future agents can audit why the instruction changed.

## Org-Learning Apply Protocol

- Approved learning should become an `org_learning_apply` issue when it needs durable instruction work.
- The apply issue must produce an instruction patch proposal that lists target surfaces, intended change summary, source issue, approval, learning activity, and `requires_hitl_before_mutation`.
- The proposal is a review artifact only. It does not edit managed instructions, and it must not be described as an applied policy change.

# Org Intelligence HITL Apply Execution Plan

Date: 2026-05-10
Branch: local-pr-d-data-integrity-cascades

## Prompt C

Continue steps 1..3 from the org-intelligence tranche:

1. visually review the current Org Intelligence UI;
2. implement the controlled HITL flow that approves an instruction patch
   proposal and only then applies a real patch into an agent instruction file;
3. verify, review, then commit and push if the tranche is passing.

Use one worker subagent maximum. The orchestrator owns final review and must
perform browser-proof with console and network inspection.

## Executive Plan

The previous tranche correctly stopped at a non-mutating instruction patch
proposal. That is safer than silent self-modification, but incomplete: the
operator still has no first-class path to turn an approved proposal into an
actual instruction-file change.

This tranche adds a deliberate three-step control path:

1. A generated instruction patch proposal remains immutable evidence on the
   apply issue.
2. A board user requests an explicit HITL approval for a concrete patch target:
   agent, instruction surface, and exact patch text.
3. Only after the approval is approved may a board user apply the patch. The
   apply operation is idempotent, records issue/agent activity, and writes a
   bounded marker block to the selected instruction file.

The UI must make this sequence visible and must not imply that proposal
generation already mutated any agent instructions.

## Non-Goals

- Do not auto-approve instruction mutations.
- Do not apply patches during proposal generation.
- Do not let agents mutate instruction files without a board-approved HITL
  decision.
- Do not implement a broad agent self-improvement engine in this tranche.
- Do not rewrite the approval system or introduce a schema migration unless
  absolutely necessary.
- Do not exceed one active worker subagent.

## Task Ledger

| ID | Owner | Status | Scope | Review Owner |
| --- | --- | --- | --- | --- |
| OIH-01 | Orchestrator | completed | Visual review of current Org Intelligence page and apply issue UI | Orchestrator |
| OIH-02 | Worker + Orchestrator corrective | completed | Backend HITL approval request and approved patch apply endpoints | Orchestrator |
| OIH-03 | Worker | completed | UI workflow for request approval / apply approved instruction patch | Orchestrator |
| OIH-04 | Worker + Orchestrator corrective | completed | Focused tests and browser-proof fixture updates | Orchestrator |
| OIH-05 | Orchestrator | completed | Final review, proof, commit, push, and next-step report | Orchestrator |

## Acceptance Criteria

- Board-only request endpoint creates an approval from an instruction patch
  proposal with exact target agent, target surface, and patch text.
- The approval payload is linked to the apply issue and proposal activity event.
- Patch application is board-only and requires an approved approval.
- Patch application refuses pending/rejected approvals.
- Patch application is idempotent by approval id and does not duplicate marker
  blocks.
- Patch application writes through the existing agent instruction bundle service
  so adapter config/revision behavior stays consistent.
- Issue activity records both approval request and applied patch.
- Agent activity records the instruction file update.
- Issue UI exposes the sequence clearly: proposal -> HITL approval -> apply.
- Browser-proof exercises the UI path and captures console/network problems.

## Verification Plan

- Focused server tests for approval creation, pending approval refusal, approved
  apply success, and idempotent re-apply.
- `pnpm --filter @paperclipai/server typecheck`
- `pnpm --filter @paperclipai/ui typecheck`
- `git diff --check`
- `pnpm build`
- Browser-proof on port 3101 for:
  - Org Intelligence visual page;
  - one apply issue proposal/HITL flow with console and network capture.

## Runtime Controls

- One active worker subagent maximum.
- Worker must report changed files and self-review before final return.
- Orchestrator pings the worker while active.
- A worker is only considered stuck after direct ping receives no response and
  there is no evidence of file/progress movement after a reasonable wait.
- Orchestrator performs final task-by-task review and does not accept a worker's
  self-review as closure proof.

## Completion Notes

- Added controlled HITL approval request and approved patch application for
  instruction patch proposals.
- Added UI controls in the issue Org Intel tab for target agent, target surface,
  patch text, approval request, approved apply, and applied state.
- Fixed company-prefixed navigation for `/org-intelligence`.
- Corrected approved apply to create missing instruction surfaces instead of
  failing when the selected file does not exist yet.
- Verified with focused backend tests, typechecks, build, and browser-proof with
  console/network capture.

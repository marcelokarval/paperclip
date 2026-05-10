# Org Intelligence Apply Flow Execution Plan

Date: 2026-05-10
Branch: local-pr-d-data-integrity-cascades

## Prompt B

Execute the next organizational-intelligence tranche across the already agreed
next steps 1..6:

1. close the real org-learning apply flow without silent instruction mutation;
2. add a company-level Org Intelligence view;
3. harden agent-to-agent routing and communication defaults;
4. promote browser-proof regressions for critical workflows;
5. keep server/browser proof health visible and actionable;
6. reduce workflow confusion with discoverable navigation and next-step cues.

This tranche must be verifiable with one worker subagent plus orchestrator final
review. It must not attempt a full upstream merge or a broad rewrite.

## Executive Plan

The current product already supports:

- issue-scoped routing and learning records;
- HITL approval for learning proposals;
- creation of tracked org-learning apply issues;
- health-gated browser-proof with console/network capture and declarative UI
  steps.

The missing operational bridge is that an apply issue still describes the work
but does not help the operator/agent turn approved learning into a concrete,
reviewable instruction patch proposal. The first correct implementation should
therefore generate an auditable patch proposal, not silently edit agent files.

The desired end state for this tranche:

1. An approved learning apply issue can generate a structured instruction patch
   proposal linked to the source issue, approval, learning event, and target
   instruction surfaces.
2. The proposal is visible in the issue and can be reviewed before any file
   mutation happens.
3. A company-level Org Intelligence route summarizes routing gaps, learning
   proposals, approved learning, and open apply work across issues.
4. Sidebar/navigation makes Org Intelligence discoverable instead of forcing
   operators to know that the data only exists inside individual issues.
5. Agent birth-kit defaults explicitly teach agents when to route, reassign,
   request HITL, create apply issues, or ask for instruction updates.
6. Browser-proof has reusable regression artifacts for the org-learning apply
   path and the company-level Org Intelligence page.

## Non-Goals

- Do not silently mutate `AGENTS.md`, `ROUTING_TABLE.md`, `LESSONS_LEDGER.md`,
  or any agent instruction file.
- Do not implement autonomous self-modifying agents in this tranche.
- Do not perform a full upstream merge.
- Do not create or delete runtime companies as part of committed code.
- Do not introduce more than one active subagent.
- Do not make CEO do IC implementation work through prompts.

## Task Ledger

| ID | Owner | Status | Scope | Review Owner |
| --- | --- | --- | --- | --- |
| OIA-01 | Worker | completed | Backend apply-patch proposal: endpoint/service/activity for approved org-learning apply issues | Orchestrator |
| OIA-02 | Worker | completed | Company-level Org Intelligence aggregate endpoint and route tests | Orchestrator |
| OIA-03 | Worker + Orchestrator corrective | completed | UI: Org Intelligence page/nav plus apply-issue patch proposal action/visibility | Orchestrator |
| OIA-04 | Worker | completed | Agent birth-kit hardening for routing, HITL, and instruction-improvement protocol | Orchestrator |
| OIA-05 | Worker + Orchestrator corrective | completed | Browser-proof regression fixtures/docs for apply flow and org-intelligence page | Orchestrator |
| OIA-06 | Orchestrator | completed | Final review, QA, browser-proof, report, next steps | Orchestrator |

## Acceptance Criteria

- Board-only endpoint creates or returns a structured instruction patch proposal
  for an org-learning apply issue.
- Proposal is idempotent for the same apply issue/source approval/source
  learning event.
- Proposal records target surfaces, intended change summary, source links, and
  explicit `requiresHitlBeforeMutation: true`.
- Proposal is visible from the issue UI without reading raw activity JSON.
- Company-level Org Intelligence page is reachable from normal navigation and
  shows aggregate counts plus recent evidence.
- Default agent files include enforceable routing/communication/self-improvement
  guidance aligned with CEO/CTO/operator responsibilities.
- Browser-proof checks health first and captures console/network for both the
  apply-flow and Org Intelligence page.

## Verification Plan

- Focused backend route/service tests for apply proposal and aggregate endpoint.
- Focused UI formatting/component tests where applicable.
- `pnpm --filter @paperclipai/server typecheck`
- `pnpm --filter @paperclipai/ui typecheck`
- `pnpm --filter @paperclipai/db typecheck` if schema/migration changes occur.
- `git diff --check`
- `pnpm build`
- Browser-proof against `http://127.0.0.1:3101` with console and network
  inspection.

## Runtime Controls

- One active worker subagent maximum.
- Orchestrator pings worker during execution and closes it after delivery or
  confirmed non-responsive stall.
- Stalled means non-responsive to direct ping after enough time for a normal
  long-running task, not merely slow.
- Worker must not revert unrelated work and must list changed files.

## Completion Notes

- Added board-only instruction patch proposal creation for
  `org_learning_apply` issues. The proposal is activity-backed, idempotent, and
  explicitly non-mutating.
- Added company-level Org Intelligence aggregation for routing decisions,
  learning records, learning approvals, patch proposals, and open apply issues.
- Added an Org Intelligence page reachable from the sidebar.
- Added issue-level UI for generating and viewing instruction patch proposals
  from apply issues.
- Hardened default and CEO birth-kit files to distinguish routing, review,
  approval, apply issues, patch proposals, and real instruction mutation.
- Added tracked browser-proof fixtures and E2E README commands.
- Browser-proof confirmed both the aggregate page and ROF-48 proposal flow with
  health gate, console capture, and network capture.

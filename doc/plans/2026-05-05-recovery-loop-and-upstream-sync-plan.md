# Recovery Loop And Upstream Sync Plan

Date: 2026-05-05

## Objective

Fix the ROF-40 infinite retry loop and refresh this fork's selective upstream
alignment without losing local operating-model work.

This is not a wholesale upstream merge. The fork contains local product and
deployment functionality that must be preserved.

## Current Incident

ROF-40 entered a repeated recovery loop:

- assigned CTO run failed with `process_lost`
- Paperclip queued one `process_lost_retry`
- the retry also failed
- stranded issue reconciliation saw the issue still `in_progress` with no live
  execution path
- because the latest run had `retryReason=process_lost`, the reconciler did not
  treat the previous `issue_continuation_needed` recovery as already consumed
- a new `issue_continuation_needed` wake was queued, restarting the cycle

The root gap is issue-level recovery-chain accounting. Current protection caps
per-run process-loss retry, not per-issue recovery loops.

## Non-Negotiables

- Preserve local company intake, CEO/CTO operating-pack, HITL, browser-proof,
  Docker/VPS, import/export, and `codex_local` improvements.
- Do not stage or modify local VPS secrets in `docker/vps/paperclip-stack.yml`.
- Do not merge upstream wholesale.
- Backport behavior manually when local architecture diverges.
- Every implementation slice must have separate review by someone other than
  the implementer.
- Browser-proof is required for issue/runs UI truth, including console and
  network inspection.

## Executive Phases

### Phase A - Evidence And Scope Lock

- [x] A1. Capture ROF-40 issue state, comments, activity, and run list.
- [x] A2. Capture CTO runs browser-proof snapshot.
- [x] A3. Identify exact local recovery functions involved.
- [x] A4. Collect subagent upstream-recovery analysis.
- [x] A5. Collect subagent local-preservation analysis.
- [x] A6. Collect subagent upstream PR/issue triage.

### Phase B - ROF-40 Recovery Loop Fix

- [x] B1. Add a local helper that detects a failed automatic issue recovery
  chain across `issue_continuation_needed` and `process_lost_retry`.
- [x] B2. Update stranded assigned issue reconciliation so failed recovery
  chains escalate to `blocked` instead of queueing a fresh continuation.
- [x] B3. Include latest failure context in the escalation comment.
- [x] B4. Ensure stale queued wakeups for the same issue are not left active
  after escalation.
- [x] B5. Add regression tests for:
  - first stranded `in_progress` issue queues one continuation
  - failed continuation queues at most one process-loss retry
  - failed process-loss retry escalates to blocked
  - succeeded latest run is not escalated
  - cancelled/done issue is not recovered

### Phase C - Upstream Selective Sync

- [x] C1. Compare current fork against upstream `#4459`, `#5286`, `#5261`,
  and adjacent recovery PRs.
- [x] C2. Backport only the compatible reliability semantics.
- [x] C3. Update `doc/UPSTREAM-BACKPORT-STATUS.md` with the new upstream marker.
- [x] C4. Record deferred upstream items explicitly instead of implying parity.

### Phase C2 - Immediate P0 Reliability Backports

- [x] C2.1. Fix ROF-40 recovery loop by recognizing exhausted process-loss
  descendant chains.
- [x] C2.2. Fix stale `checkoutRunId` / `executionRunId` lock-pair drift
  from upstream issue `#5294`.
- [x] C2.3. Fix `codex_local` current usage-limit message classification from
  upstream issue `#5222`.
- [x] C2.4. Implement sequential patch for duplicate run single-flight from
  upstream issue `#5180`.
- [x] C2.5. Implement sequential patch for pause bypass and duplicate invocation
  from upstream issue `#5244`.

### Phase D - Preservation Review

- [x] D1. Verify local-only surfaces still compile after recovery changes.
- [x] D2. Confirm no local-only routes/components are replaced by upstream.
- [x] D3. Confirm dirty VPS stack file remains untouched.
- [x] D4. Confirm ROF-40 security hardening files remain isolated from the
  recovery fix decision.

### Phase E - Proof And Closure

- [x] E1. Run targeted heartbeat recovery tests.
- [x] E2. Run targeted issue delete permission test if ROF-40 patch remains in
  worktree.
- [x] E3. Run server typecheck.
- [x] E4. Browser-proof issue/runs pages with console and network inspection.
- [x] E5. Produce final task-by-task review matrix.

## Task Ledger

| ID | Phase | Task | Owner | Reviewer | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| A1 | A | Capture ROF-40 API state | Orchestrator | Orchestrator | done | `.tmp/rof40-issue-snapshot.txt` |
| A2 | A | Capture CTO runs UI state | Orchestrator | Orchestrator | done | `.tmp/rof40-cto-runs-snapshot.txt` |
| A3 | A | Locate local recovery code | Orchestrator | Orchestrator | done | `server/src/services/heartbeat.ts` |
| A4 | A | Upstream recovery analysis | Dewey | Orchestrator | done | subagent closure |
| A5 | A | Local preservation analysis | Noether | Orchestrator | done | subagent closure |
| A6 | A | Upstream issue/PR triage | Darwin | Orchestrator | done | subagent closure |
| B1 | B | Implement recovery-chain detector | Ptolemy | Russell/Orchestrator | review_passed | `heartbeat-process-recovery.test.ts` |
| B2 | B | Escalate exhausted recovery chains | Ptolemy | Russell/Orchestrator | review_passed | `heartbeat.ts` |
| B3 | B | Improve escalation comment detail | Ptolemy | Russell/Orchestrator | review_passed | targeted test assertions |
| B4 | B | Prevent stale wake leftovers | Orchestrator | Orchestrator | done | `hasActiveExecutionPath` guard + blocked escalation path |
| B5 | B | Add recovery regression tests | Ptolemy | Russell/Orchestrator | review_passed | 26 heartbeat recovery tests |
| C1 | C | Compare upstream recovery PRs | Darwin/Dewey | Orchestrator | done | subagent closures |
| C2 | C | Backport compatible semantics | Ptolemy/Mill/Lovelace/Tesla/Goodall/Gauss/Boole | reviewers + Orchestrator | done | P0 slices `#5222`, `#5294`, `#5180`, `#5244` |
| C3 | C | Update upstream status docs | Orchestrator | Orchestrator | done | `doc/UPSTREAM-BACKPORT-STATUS.md` |
| D1 | D | Preservation compile review | Orchestrator | Orchestrator | done | `pnpm build`; server/codex-local typecheck |
| D2 | D | Local feature preservation review | Noether | Orchestrator | done | subagent closure |
| C2.2 | C2 | Lock-pair consistency for retry/release | Mill/Cicero/Leibniz/Pascal | Godel/Huygens/Hilbert/Orchestrator | review_passed | `pnpm exec vitest run server/src/__tests__/heartbeat-process-recovery.test.ts server/src/__tests__/issues-service.test.ts` |
| C2.3 | C2 | Codex usage-limit transient classification | Lovelace | Epicurus/Orchestrator | review_passed | `pnpm --filter @paperclipai/adapter-codex-local exec vitest run src/server/parse.test.ts` |
| C2.4 | C2 | Duplicate run single-flight implementation | Tesla | Locke/Orchestrator | review_passed | `pnpm exec vitest run server/src/__tests__/heartbeat-wakeup-coalescing.test.ts server/src/__tests__/heartbeat-process-recovery.test.ts` |
| C2.5 | C2 | Pause bypass implementation | Goodall/Gauss/Boole | Archimedes/Helmholtz/Volta/Orchestrator | review_passed | `pnpm exec vitest run server/src/__tests__/heartbeat-process-recovery.test.ts server/src/__tests__/heartbeat-wakeup-coalescing.test.ts server/src/__tests__/issues-service.test.ts` |
| E1 | E | Targeted recovery tests | Ptolemy/Orchestrator/Russell | Orchestrator | passed_partial | `heartbeat-process-recovery`: 36 tests; `heartbeat-wakeup-coalescing`: 9 tests; `issues-service`: 28 tests |
| E2 | E | Browser-proof issue/runs UI | Orchestrator | Orchestrator | done_with_residual | `.tmp/browser-proof-2026-05-05-rof40-issue.snapshot.txt`, `.tmp/browser-proof-2026-05-05-rof-cto-runs.snapshot.txt`; issue page has missing asset 404 |
| E3 | E | Final closure matrix | Orchestrator | Orchestrator | done | this task ledger |

## Initial Backport Candidates

- `#4459`: escalate stranded issue when recovery retry succeeds or fails without
  restoring execution path.
- `#5286`: explicit-path recovery for stranded in-progress issues.
- `#5261`: per-company-per-hour rate cap for stranded issue recovery reaper.
- `#4514`: stop non-continuable run recovery loops.
- `#4988`: issue monitor liveness controls, if compatible and not already
  locally covered.

## Completion Criteria

- ROF-40 failure pattern cannot generate an unbounded sequence of automation
  runs.
- The issue becomes visibly `blocked` with useful failure context when automatic
  recovery is exhausted.
- Upstream status docs reflect the latest reviewed/integrated recovery work.
- Local fork functionality remains intact.
- Browser-proof and test evidence are recorded before closure.

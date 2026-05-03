# Selective Upstream Backport Executive Plan

Date: 2026-05-03

## Objective

Backport only the upstream Paperclip corrections and improvements that serve
this fork's operating model. Do not perform a full upstream merge.

Baseline comparison point:

- Last upstream PR already contained by local ancestry: `#3679`
- Upstream target pool: merged PRs and open issues after `#3679`
- Current local integration marker after this plan:
  `doc/UPSTREAM-BACKPORT-STATUS.md`

## Execution Rules

- Prefer manual/selective backports over broad cherry-picks.
- Preserve local fork behavior for CEO/CTO/HITL workflows.
- Do not revert unrelated local changes.
- Keep implementation slices independently reviewable.
- Each worker must run a self-review and self-forensic review before return.
- Each review must be performed by someone other than the implementation worker.
- The root orchestrator performs the final integration and forensic review.

## PR-A: Runtime And Recovery Reliability

Priority: P0

Sources:

- Upstream PR `#4804`: runtime state race, workspace sync, plugin startup,
  orphaned leases.
- Upstream PR `#4875`: issue recovery reliability.
- Upstream PR `#4956`: productive terminal continuation recovery.
- Watch issues: `#4996`, `#5021`, `#4971`, `#4923`, `#4904`, `#4766`.

Status: completed with scoped residuals

Tasks:

- [x] A1. Compare upstream `#4804` against local runtime, heartbeat, issue,
  environment, and recovery services.
- [x] A2. Backport only missing runtime-state upsert/race protections.
- [x] A3. Backport only missing workspace reuse sync protections.
- [x] A4. Backport only missing plugin readiness protections before environment
  driver resolution.
- [x] A5. Backport only missing orphaned lease cleanup protections.
- [x] A6. Compare upstream `#4875` against local recovery/liveness services.
- [x] A7. Backport missing duplicate-escalation and covered-waiting-path guards.
- [x] A8. Compare upstream `#4956` and backport productive terminal
  continuation recovery if missing.
- [x] A9. Add or update focused tests for each behavior landed.
- [x] A10. Run targeted server tests for heartbeat, recovery, runtime, and
  issue services.
- [x] A11. Produce worker self-review and self-forensic review.
- [x] A12. Independent reviewer validates implementation and tests.

## PR-B: Codex Local, Model Refresh, And Model Profiles

Priority: P1

Sources:

- Upstream PR `#4383`: transient recovery and Codex model refresh.
- Upstream PR `#4881`: cheap model profiles for local adapters.
- Watch issues: `#5028`, `#5027`, `#4925`, `#4774`, `#4797`, `#5042`.

Status: completed

Tasks:

- [x] B1. Compare upstream `#4383` with local custom Codex model discovery.
- [x] B2. Identify gaps without overwriting local `OPERATING_MODELS.md` and
  CEO/CTO model-enforcement behavior.
- [x] B3. Backport missing Codex usage-limit/retry-window parsing if absent.
- [x] B4. Backport missing Claude transient classification only if compatible.
- [x] B5. Backport missing model-refresh server/registry/shared/UI contracts if
  local implementation is incomplete.
- [x] B6. Compare upstream `#4881` model profile contract against local agent
  config model handling.
- [x] B7. Add `primary/cheap/custom` profile behavior only where it strengthens
  local CEO/CTO/agent model enforcement.
- [x] B8. Add or update adapter/shared/server/UI tests.
- [x] B9. Run targeted model/adapter/config tests and typecheck for affected
  packages.
- [x] B10. Produce worker self-review and self-forensic review.
- [x] B11. Independent reviewer validates implementation and tests.

## PR-C: Issue Thread, HITL, Live Run, And Operator Clarity

Priority: P1/P2

Sources:

- Upstream PR `#4861`: issue thread scale and markdown polish.
- Upstream PR `#4862`: interaction cancellation and issue cost summaries.
- Upstream PR `#4957`: live-run comment context.
- Upstream PR `#4963`: stop padding live-runs by default.
- Watch issues: `#5061`, `#4882`, `#4908`, `#4906`, `#4950`, `#4949`.

Status: completed with scoped residuals

Tasks:

- [x] C1. Compare upstream `#4861` against local issue thread, markdown body,
  markdown editor, optimistic comment, and issue list changes.
- [x] C2. Backport missing markdown/thread hardening without regressing local
  MDX editor patch.
- [x] C3. Compare upstream `#4862` against local issue interactions and cost
  service/API/UI surfaces.
- [x] C4. Backport cancellation and cost summaries only if contracts are
  missing or weaker locally.
- [x] C5. Compare upstream `#4957` and backport live-run comment context if
  missing.
- [x] C6. Compare upstream `#4963` and backport live-runs no-padding default if
  missing.
- [x] C7. Check open issue `#5061` against local issue-comment gating.
- [x] C8. Add or update focused UI/server tests.
- [x] C9. Run targeted UI component tests, server route tests, and browser-proof
  for comment/HITL/live-run surfaces if runnable.
- [x] C10. Produce worker self-review and self-forensic review.
- [x] C11. Independent reviewer validates implementation, UI state, console, and
  network behavior where browser-proof is used.

### PR-C Exception Ledger

- `#4862` interaction cancellation is not claimed delivered in this worker
  slice. Technical reason: this local fork does not currently contain the
  upstream `issue_thread_interactions` contract/service/component/API surface
  that `cancelQuestions` extends, so adding cancellation here would require
  introducing a new interaction subsystem rather than selectively backporting a
  missing guard. Impact: pending HITL question-interaction cancellation remains
  unavailable until the base interaction contract is intentionally ported.
  Follow-up: create a separate PR-C/HITL foundation slice to import or adapt
  issue-thread interactions first, then add the upstream cancellation route,
  service transition, UI cancel affordance, and continuation wake semantics.
- `#4862` issue subtree cost summaries are in scope for this worker slice
  because they fit the existing cost service and issue route contracts without
  schema changes.

## PR-D: Navigation, Settings, Data Integrity, And Operational Safety

Priority: P2/P3

Sources:

- Upstream PR `#4863`: board settings and skills workflow polish.
- Upstream PR `#4981`: workspace switcher in sidebar.
- Upstream PR `#4960` / `#4859`: database backup schema hardening.
- Watch issues: `#5086`, `#5014`, `#4833`, `#4759`, `#5013`, `#5011`.

Status: completed with scoped residuals

Tasks:

- [x] D1. Compare upstream `#4981` with local sidebar/navigation changes.
- [x] D2. Backport only navigation changes that reduce fragmented access.
- [x] D3. Compare upstream `#4863` with local Agents, Routines, Settings,
  IssueDetail, skills, and onboarding assets.
- [x] D4. Backport only settings/skills workflow improvements compatible with
  local CEO/CTO operating packs.
- [x] D5. Compare upstream backup schema PRs against local backup behavior.
- [x] D6. Audit delete/cascade issues `#5086`, `#5014`, and `#4833` against
  local schema/routes; implement minimal safe cleanup/cascade fixes if missing.
- [x] D7. Audit `#4759` HTTP logger secret leakage against local logging.
- [x] D8. Add or update focused DB/server/UI tests.
- [x] D9. Run targeted tests plus browser-proof for navigation/settings if
  runnable.
- [x] D10. Produce worker self-review and self-forensic review.
- [x] D11. Independent reviewer validates implementation and tests.

Worker PR-D residual note:

- Upstream backup hardening from `#4960` / `#4859` was reviewed but not
  implemented in this PR-D pass. The upstream diff changes backup engine and
  restore behavior broadly; this worker did not backport it because the primary
  accepted scope was navigation/settings plus minimal confirmed operational
  safety gaps. Treat backup schema/engine parity as residual follow-up, not as
  delivered by PR-D.

## Final Integration Checklist

Status: completed with residuals

- [x] Confirm no full upstream merge was performed.
- [x] Confirm all local fork-specific CEO/CTO/HITL flows still exist.
- [x] Confirm changed contracts are synchronized across shared/server/ui/db.
- [x] Run targeted tests from each PR slice.
- [x] Run repository-level typecheck/test/build as feasible.
- [x] Run browser-proof for changed operator flows, including console and
  network inspection.
- [x] Produce final side-by-side review: requested task vs implemented outcome.
- [x] Record residual risks and explicit non-applied upstream items.

Final residuals:

- `#4862` interaction cancellation remains a follow-up because this fork does
  not yet have the upstream issue-thread interaction subsystem that the cancel
  route extends.
- `#4960` / `#4859` backup engine hardening remains a follow-up because the
  upstream backup/restore diff is broader than this selective operational
  safety slice.
- `pnpm --filter @paperclipai/ui typecheck` remains red in
  `ui/src/components/IssueProperties.test.tsx` because two local test fixtures
  use incomplete `Project` objects. Focused PR-C/PR-D UI tests pass.

# 2026-05-05 Upstream P0 Execution Plan

## Objective

Port and harden high-risk upstream Paperclip fixes that directly affect this fork's operational reliability, without blindly merging upstream. Each slice must be implemented, reviewed by a different agent/persona, and then integrated by the root orchestrator.

Primary scan artifact:

- `.tmp/upstream-deep-scan-2026-05-05.md`

Batch status:

- Started from `.tmp/upstream-deep-scan-2026-05-05.md`.
- Completed local selective implementation for the P0 rows below.
- Each code slice was implemented by a worker and reviewed by a different
  reviewer before final orchestration review.
- Browser proof was collected for the UI-facing provider-rate-limit slice.

## Operating Rules

- The root agent is orchestrator and final reviewer, not feature-code executor.
- Workers own disjoint file areas where possible.
- Reviewers must not be the same agent that implemented the slice.
- Existing dirty worktree changes must not be reverted.
- `docker/vps/paperclip-stack.yml` is unrelated to this batch unless explicitly stated.
- Every code slice needs targeted tests.
- Browser-proof is required only for slices that change UI/operator browser flows; it must include console and network inspection.

## Task Ledger

| ID | Priority | Planned Status | Implemented Status | Owner | Reviewer | Scope | Proof |
| --- | --- | --- | --- | --- | --- | --- | --- |
| UP-P0-01 | P0 | planned from scan | implemented and reviewed | worker-auth | reviewer-a | Sanitize run IDs at auth boundary, including JWT claims | `actor-middleware-run-id.test.ts`; server typecheck |
| UP-P0-02 | P0 | planned from scan | implemented and reviewed | worker-codex | reviewer-b | Codex managed home auth hardening and CLI API-key auth | codex-home/parse tests; adapter typecheck |
| UP-P0-03 | P0 | planned from scan | implemented, corrected, re-reviewed | worker-routines | reviewer-c | Routine scheduler per-trigger isolation and failed tick logging | `routines-service.test.ts`; startup feedback test; server typecheck |
| UP-P0-04 | P0 | planned from scan | implemented and reviewed | worker-heartbeat-output | reviewer-c | Heartbeat output/result projection cap fix | `heartbeat-run-summary.test.ts`; server typecheck |
| UP-P0-05 | P0 | planned from scan | implemented, corrected, re-reviewed | worker-exec-state | reviewer-d | Restore executionAgentNameKey/stage advancement robustness | `issues-service.test.ts`; `issue-execution-policy-routes.test.ts`; server typecheck |
| UP-P0-06 | P0 | planned from scan | implemented, corrected, re-reviewed | worker-idempotency | reviewer-e | Agent/hire creation idempotency for recovery duplicate side effects | agent route/service idempotency tests; server typecheck |
| UP-P0-07 | P0 | planned from scan | implemented, corrected, re-reviewed | worker-rate-limits | reviewer-f | Corrected provider hard-rate-limit pause/resume design and implementation | provider-rate-limit service/UI tests; browser-proof console/network |
| UP-P1-01 | P1 | planned from scan | implemented and reviewed | worker-status | reviewer-a | Update upstream backport status/docs with scan source, status, and proof | doc review |

## Final Implementation Status

The rows below are the closure ledger for this execution batch.

| ID | Result | Reviewer verdict |
| --- | --- | --- |
| UP-P0-01 | Invalid run IDs from headers/JWT claims are dropped before actor context is created. | PASS |
| UP-P0-02 | Codex managed home now avoids stale auth copies in local-login mode and writes API-key auth atomically for probe/runtime paths. | PASS |
| UP-P0-03 | Routine trigger failures are isolated per trigger and failed ticks are logged without aborting the entire scheduler pass. | PASS after correction |
| UP-P0-04 | Heartbeat list projections cap large output/result/error text before returning summary payloads. | PASS |
| UP-P0-05 | Execution checkout adoption preserves agent identity, does not overwrite a different active run lock, and transfers missing-comment retry locks without starving deferred same-issue wakes. | PASS after correction and final wake-batching review |
| UP-P0-06 | Agent and CTO-hire creation paths have server-derived idempotency and duplicate side-effect suppression. | PASS after correction |
| UP-P0-07 | Provider hard-rate-limit blocks now persist, pause/resume matching agents, block/unblock source issues, expose API/UI state, and support scoped manual release. | PASS after UI correction |
| UP-P1-01 | Status docs now identify the scan source, batch plan, and completed integration state. | PASS |

## Proof

- `pnpm --filter @paperclipai/server typecheck`
- `pnpm --filter @paperclipai/ui typecheck`
- `pnpm --filter @paperclipai/adapter-codex-local typecheck`
- `pnpm --filter @paperclipai/adapter-claude-local typecheck`
- `pnpm exec vitest run server/src/__tests__/actor-middleware-run-id.test.ts server/src/__tests__/routines-service.test.ts server/src/__tests__/issues-service.test.ts server/src/__tests__/issue-execution-policy-routes.test.ts`
- `pnpm exec vitest run server/src/__tests__/agent-permissions-routes.test.ts server/src/__tests__/agent-adapter-validation-routes.test.ts server/src/__tests__/agent-skills-routes.test.ts server/src/__tests__/agents-service-idempotency.test.ts server/src/__tests__/provider-rate-limits-service.test.ts`
- `pnpm exec vitest run packages/adapters/codex-local/src/server/codex-home.test.ts packages/adapters/codex-local/src/server/parse.test.ts packages/adapters/claude-local/src/server/parse.test.ts ui/src/components/ProviderQuotaCard.test.tsx server/src/__tests__/heartbeat-run-summary.test.ts`
- `pnpm exec vitest run server/src/__tests__/server-startup-feedback-export.test.ts`
- `pnpm exec vitest run server/src/__tests__/heartbeat-comment-wake-batching.test.ts`
- `pnpm exec vitest run server/src/__tests__/heartbeat-comment-wake-batching.test.ts server/src/__tests__/heartbeat-process-recovery.test.ts`
- `pnpm test:run` (`307` test files passed; `1878` tests passed; `1` skipped)
- `pnpm build`
- Browser proof on `http://127.0.0.1:3101/ROF/costs`: Providers tab loaded, `GET /provider-rate-limits` returned `200`, console had no errors or warnings, and proof artifacts were saved under `.tmp/`.

## Residuals

- Closed: the raw `GET /heartbeat-runs/:runId` API projection now caps
  `resultJson` through `summarizeHeartbeatRunForApi`.
- Closed: transient retry stale-checkout behavior now has an explicit
  integration test alongside process-loss stale-checkout coverage.
- Closed as policy: local migration `0063_provider_rate_limit_blocks.sql`
  remains valid for this fork, and future upstream migration-bearing backports
  must reconcile numbering before copying upstream filenames.

## Executive Plan

### Phase 1 - Parallel Server/Adapter Safety Slices

Run in parallel because file ownership is mostly disjoint:

- UP-P0-01: `server/src/middleware/auth.ts`, new auth middleware tests.
- UP-P0-02: `packages/adapters/codex-local/src/server/codex-home.ts`, `execute.ts`, `test.ts`, adapter tests.
- UP-P0-03: `server/src/services/routines.ts`, `server/src/index.ts`, routine tests.
- UP-P0-04: `server/src/services/heartbeat.ts`, focused heartbeat projection tests.

### Phase 2 - Execution State and Idempotency

Run after Phase 1 or in parallel only if file conflicts are manageable:

- UP-P0-05: fix checkout/stage recovery around `executionAgentNameKey`.
- UP-P0-06: add source/fingerprint idempotency to agent/agent-hire creation paths to prevent duplicate CEO/CTO/hiring side effects under recovery.

### Phase 3 - Provider Rate-Limit Gate

This is broad and must not raw-copy upstream `#5299`. Required corrections from upstream review:

- Verify block ownership before release mutation.
- UI labels in English.
- Drizzle schema and SQL migration must both preserve active-block uniqueness.
- Time-expired blocks must release/resume deterministically even if quota probe is unavailable at expiry.
- Issues must be unblocked even if matching agents have been deleted or manually resumed.

### Phase 4 - Cross Review

Each implementation slice is reviewed by a different reviewer. Reviewers must:

- Compare against upstream issue/PR intent.
- Check local fork behavior.
- Search for residual bypasses.
- Verify tests cover the regression.
- Leave explicit pass/fail with requested corrections.

### Phase 5 - Final Orchestrator Review

Root orchestrator performs:

- `git diff` inspection.
- Relevant focused test suite.
- `pnpm --filter @paperclipai/server typecheck`.
- Adapter typecheck/tests when codex adapter changed.
- `pnpm build` before closure if the batch reaches UI/schema integration.
- Browser-proof for any UI route touched by UP-P0-07.

## Initial Risk Register

- Rate-limit gate is broad and may require migration/schema/API/UI changes.
- Execution-state and heartbeat files are already dirty from previous recovery work; workers must inspect current local diff before editing.
- Idempotency for agent creation may require schema/storage decision. If full migration is too large, implement a bounded idempotency-key table or deterministic existing-resource lookup with tests.
- Browser-proof cannot validate backend-only slices by itself; use API tests for those.

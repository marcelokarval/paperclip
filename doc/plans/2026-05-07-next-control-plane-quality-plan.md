# 2026-05-07 Next Control-Plane Quality Plan

## Objective

Close the immediate follow-ups from the `22b64d65` control-plane liveness
backport without widening into a wholesale upstream merge:

- make the full local test command deterministic in sandboxed environments;
- prepare a review/PR handoff artifact for the committed batch;
- analyze upstream work after `#5428` and select only high-value local cuts;
- investigate the browser-proof accessibility issue observed on `/ROF/issues`.

## Source State

- Branch: `local-pr-d-data-integrity-cascades`
- Last pushed commit: `22b64d65 Backport control-plane liveness guards`
- Worktree at plan start: clean
- Upstream marker already reviewed: `#5428`

## Non-Goals

- Do not open a public upstream PR automatically unless explicitly approved.
- Do not merge upstream `master` wholesale.
- Do not import SSH/sandbox remote execution code until that runtime layer has
  active local callsites and tests.
- Do not treat cosmetic UI polish as higher priority than liveness, auth,
  recovery, import/export, or runtime safety.

## Execution Plan

### PR-A: Handoff / PR Body

Prepare a reusable PR body that follows `.github/PULL_REQUEST_TEMPLATE.md` and
captures:

- control-plane liveness changes from `22b64d65`;
- verification commands and browser-proof result;
- deferred upstream decisions;
- risks and model/tooling disclosure.

Deliverable: `.tmp/pr-body-control-plane-liveness-2026-05-07.md`.

### PR-B: Corepack Test Determinism

The broad test suite only passed after setting:

```sh
COREPACK_HOME=/tmp/paperclip-corepack pnpm test
```

Root cause: workspace/worktree tests invoke `pnpm install` inside generated
worktrees; Corepack may try to write package-manager shims/cache under
`~/.cache/node/corepack`, which can be read-only in the Codex sandbox.

Target behavior:

- provision/test paths that spawn `pnpm install` should default Corepack cache
  to a writable temp-scoped location when `COREPACK_HOME` is not already set;
- user/operator-provided `COREPACK_HOME` must not be overwritten;
- tests should prove the env is propagated into worktree provisioning.

### PR-C: Upstream Post-`#5428` Scan

Review official upstream after `#5428` and classify each relevant issue/PR:

- `integrate now`;
- `defer with prerequisite`;
- `ignore / not applicable`.

Selection criteria:

- P0/P1: liveness, recovery loop prevention, auth/security, import/export
  safety, runtime local reliability, HITL correctness;
- P2: operator UI polish only when low-risk and directly mapped locally;
- P3: broad architectural parity or remote SSH/sandbox prerequisites.

Deliverable: `.tmp/upstream-post-5428-scan-2026-05-07.md`.

### PR-D: Browser-Proof Accessibility Issue

Investigate the observed DevTools issue:

```text
A form field element should have an id or name attribute
```

Target behavior:

- identify the concrete field on `/ROF/issues`;
- add stable `id`/`name` only where it does not change behavior;
- verify with browser-proof console/network and a focused UI test if available.

## Task Ledger

| Task | Owner | Reviewer | Status | Proof |
| --- | --- | --- | --- | --- |
| NQ-20260507-00 plan/task ledger | orchestrator | final review | done | this plan + `.tmp/next-control-plane-quality-tasks-2026-05-07.md` |
| NQ-20260507-01 PR handoff body | orchestrator | final review | done | `.tmp/pr-body-control-plane-liveness-2026-05-07.md` |
| NQ-20260507-02 Corepack env hardening | worker `Helmholtz` + worker `Locke` | reviewer `Noether` + orchestrator | done | focused tests + final QA |
| NQ-20260507-03 Upstream post-`#5428` scan | explorer `Bernoulli` | orchestrator | done | `.tmp/upstream-post-5428-scan-2026-05-07.md` |
| NQ-20260507-04 Accessibility issue fix | worker `Gibbs` + worker `Volta` | reviewer `Euclid` + orchestrator | done | focused UI test + browser-proof console/network |
| NQ-20260507-05 integration QA | orchestrator | final review | done | `git diff --check`; `bash -n scripts/provision-worktree.sh`; focused tests; `pnpm -r typecheck`; `COREPACK_HOME=/tmp/paperclip-corepack pnpm test`; `pnpm build`; browser-proof in `.tmp/browser-proof-2026-05-07-next-control-plane-quality.md` |

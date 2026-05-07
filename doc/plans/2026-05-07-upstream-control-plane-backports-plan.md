# 2026-05-07 Upstream Control-Plane Backports Plan

## Objective

Selectively backport upstream fixes that reduce control-plane ambiguity,
agent liveness stalls, and operator recovery loops without merging upstream
`master` wholesale or importing unused remote-execution infrastructure.

## Source Window

- Local branch: `local-pr-d-data-integrity-cascades`
- Local starting marker: `b1f2445a Backport manual heartbeat scope preservation`
- Upstream marker reviewed at plan start: `upstream/master` `e400315c`
- Latest reviewed upstream PRs:
  - `#5428` Guard assigned backlog liveness
  - `#5427` Polish operator UI task controls
  - `#5426` Add issue controls and retry-now recovery
  - `#5356` Show workspace changes and stale notices in issue threads
  - `#5292` Harden control-plane safety and issue identifiers
  - `#5289` Add recovery handoff system notices

## Non-Goals

- Do not merge upstream `master` wholesale.
- Do not import SSH/sandbox callback bridge code as dead code.
- Do not port migration-heavy UI/system-notice flows unless the local runtime
  has the required domain model and tests.

## SSH / Remote Execution Follow-Up

Upstream PRs `#5324`, `#5325`, and `#5326` are important for future SSH,
sandbox, and remote execution support:

- `#5324`: callback bridge allowlist for documented heartbeat callbacks.
- `#5325`: remote execution environment sanitization at SSH/sandbox boundary.
- `#5326`: serialized callback bridge uploads/writes to prevent concurrent
  heartbeat corruption.

They are deferred because this fork currently lacks the upstream
`packages/adapter-utils/src/execution-target.ts`, `ssh.ts`, and
`sandbox-callback-bridge.ts` runtime layer. When SSH/sandbox becomes an active
product requirement, import the whole runtime layer intentionally with callsites
and tests instead of copying isolated files.

## Priority Plan

### PR-A: Control-Plane Review Safety

Source: upstream `#5292`.

Target behavior:

- Agent-authored transitions to `in_review` must include a real next-owner path:
  pending HITL/review issue-thread interaction, linked pending approval, human
  assignee, or typed execution participant.
- Invalid agent disposition should return a clear `422` instead of leaving an
  issue parked in review with no owner.

Local implementation strategy:

- Backport the minimal guard into `server/src/routes/issues.ts`.
- Add targeted route tests in `server/src/__tests__/issue-execution-policy-routes.test.ts`
  or a local equivalent.
- Avoid unrelated upstream identifier/import/UI changes unless tests prove they
  are needed.
- Do not expose the upstream monitor/scheduled-check path in this fork until a
  real local scheduler/runtime owner exists for that field.

### PR-B: Assigned Backlog Liveness

Source: upstream `#5428`.

Target behavior:

- Creating an issue with an assignee and no explicit status should default to
  `todo`, not silent `backlog`.
- Explicit assigned `backlog` remains allowed as parked work.
- Parked assigned backlog work should be detectable in backend/shared logic so
  blockers and future UI can surface it honestly.

Local implementation strategy:

- Backport the status-default helper into shared validators.
- Wire issue creation route/service to use the helper.
- Add focused shared/server tests.
- UI banner/list polish can be a follow-up unless the backend contract requires
  visible operator feedback immediately.

### PR-C: Successful Run Disposition / Notices

Sources: upstream `#5289`, `#5356`.

Target behavior:

- Productive/successful runs should not leave issues without a durable
  disposition or next-owner path.
- Operator-facing stale/missing-disposition notices should be visible in issue
  timeline only after the backend state machine is safe.

Local implementation strategy:

- First inspect local `server/src/services/heartbeat.ts` liveness behavior.
- Extract only the missing-disposition decision if local gaps remain.
- Do not port the full system-notice migration/UI stack until the backend state
  proves it needs the same presentation model.

### PR-D: Operator Recovery Controls

Sources: upstream `#5426`, `#5427`.

Target behavior:

- If local scheduled recovery retries exist, expose safe retry-now controls with
  suppression gates.
- Apply small crash fixes if they map directly to local UI payloads.

Local implementation strategy:

- Defer until PR-A/PR-B are proven.
- Prefer surgical fixes over full UI port.

## Task Ledger

| Task | Owner | Reviewer | Status | Proof |
| --- | --- | --- | --- | --- |
| UP-20260507-00 plan and SSH follow-up docs | orchestrator | final review | done | this document |
| UP-20260507-01 #5292 review-path guard | worker | separate reviewer | done | targeted server tests |
| UP-20260507-02 #5428 assigned backlog contract | worker | separate reviewer | done | shared/server/MCP tests |
| UP-20260507-03 #5289/#5356 cut analysis | explorer/worker | orchestrator | done | written recommendation |
| UP-20260507-04 #5426/#5427 cut analysis | explorer/worker | orchestrator | done | written recommendation |
| UP-20260507-05 browser-proof and final closure | orchestrator | N/A | done | DevTools console/network evidence and full test pass |

## Analysis Results

### #5289 / #5356

Decision: defer full backport.

Reason:

- Local `issue_comments` does not have upstream `presentation` / `metadata`
  system-notice fields.
- Local recovery logic is embedded in `server/src/services/heartbeat.ts`,
  while upstream split the newer flow into `server/src/services/recovery/*`.
- Porting the full notice stack would be a schema/API/UI migration, not a
  small control-plane safety patch.

Safe future cut:

- Add plain-text recovery comments only if a concrete local incident proves
  operator notice absence after backend liveness has already been made safe.

### #5426 / #5427

Decision: defer `#5426`; keep `#5427` as optional UI-polish follow-up.

Reason:

- `#5426` scheduled retry-now depends on scheduled retry columns/semantics
  not present in this fork's `heartbeat_runs` schema.
- `#5427` contains small UI improvements that can be ported later without
  changing recovery semantics.

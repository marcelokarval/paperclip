# 2026-04-24 CEO Truth Reconciliation Executive Plan

## Purpose

Correct the remaining CEO review failures in repo-first baseline flows so the
agent:

- reaches the right repo-first decision consistently
- stops producing self-contradictory control-plane claims
- stops relying on weak local probes as if they were authoritative
- closes baseline review runs with a stable, operator-trustworthy summary

## Applied Status

Implemented on `2026-04-25` in the local fork:

- strengthened CEO repo-first review guardrails so open clarifications are not
  framed as a pre-CTO blocker when the baseline is already strong enough
- centralized the repository baseline tracking-issue snapshot builder so routes
  and heartbeat reconciliation use the same phase semantics
- updated heartbeat completion for baseline reviews to refresh the issue
  description when the run moves the issue into operator review
- clarified the tracking issue snapshot with separate fields for:
  - baseline scan status
  - review stage
  - repository context stage
  - execution readiness

This plan is grounded in repeated HITL validation on the local trusted runtime
at `http://127.0.0.1:3101`, especially the `BBB-1` CEO review flow.

## Problem Statement

The CEO now usually reaches the correct executive conclusion:

- the repository context is often good enough for a first CTO hire
- open runtime/env/bootstrap ambiguities should travel into CTO onboarding

But the run still ends with contradictory or misleading statements like:

- implying the control plane may have been unreachable
- implying it is uncertain whether the issue thread was updated
- treating weak local probes as if they outweighed confirmed system outcomes

So the remaining defect is not baseline comprehension.

The remaining defect is **truth reconciliation**.

The CEO is still allowed to combine multiple evidence sources without a strong
enough hierarchy between them.

## Current Evidence

### 1. CEO guardrails already exist

The managed CEO bundle already says:

- use inline wake payload first
- do not refetch `heartbeat-context` casually
- do not infer control-plane outage from failed local probes
- do not claim the issue thread was not updated if the final comment exists

Relevant sources:

- [server/src/onboarding-assets/ceo/AGENTS.md](/home/marcelo-karval/Backup/Projetos/paperclip/server/src/onboarding-assets/ceo/AGENTS.md)
- [server/src/onboarding-assets/ceo/HEARTBEAT.md](/home/marcelo-karval/Backup/Projetos/paperclip/server/src/onboarding-assets/ceo/HEARTBEAT.md)
- [server/src/services/default-agent-instructions.ts](/home/marcelo-karval/Backup/Projetos/paperclip/server/src/services/default-agent-instructions.ts)

### 2. The generic Paperclip skill still pushes a broader API-driven heartbeat model

The shared `paperclip` skill still teaches a generic coordination loop that is
correct for many agents but too broad for a scoped CEO baseline review.

It still centers:

- API-driven checkout/update/comment as the normal heartbeat discipline
- optional identity fetches and thread fetches
- the agent treating direct mutation calls as its own proof surface

Relevant source:

- [skills/paperclip/SKILL.md](/home/marcelo-karval/Backup/Projetos/paperclip/skills/paperclip/SKILL.md)

### 3. The wake payload is already stronger than the CEO uses

The runtime wake prompt already states:

- the inline wake payload is the primary truth
- `heartbeat-context` should not be fetched when `fallbackFetchNeeded=false`
- checkout may already be claimed by the harness
- raw `curl` confirmation is not needed for routine state confirmation

Relevant source:

- [packages/adapter-utils/src/server-utils.ts](/home/marcelo-karval/Backup/Projetos/paperclip/packages/adapter-utils/src/server-utils.ts)

### 4. The runtime already knows whether a run produced an issue comment

The heartbeat service already reconciles run completion against persisted
comments created by `createdByRunId`.

Relevant source:

- [server/src/services/heartbeat.ts](/home/marcelo-karval/Backup/Projetos/paperclip/server/src/services/heartbeat.ts)

### 5. The CEO still does not receive that reconciled truth as first-class run context

So the runtime knows:

- comment exists
- run succeeded

But the CEO can still finish with weaker language based on failed local probes.

## Root Cause

The defect has four layers.

### A. Hierarchy of truth is under-specified

The system contains the right rules, but they are spread across:

- wake prompt
- CEO `AGENTS.md`
- CEO `HEARTBEAT.md`
- `paperclip` skill

The agent can still merge them inconsistently.

### B. The CEO is still inheriting too much from a generic coordination skill

The shared `paperclip` skill is not scoped enough for:

- `issue_comment_mentioned`
- repo-first baseline review
- CEO decision-only runs

So the CEO still behaves partly like an API-operator instead of a
decision-and-review agent.

### C. The runtime does not expose a post-mutation truth ledger back to the agent

The runtime later proves:

- comment recorded or not
- retry queued or not
- wake satisfied or not

But the agent does not get a compact structured summary of those facts before
its closing narrative is finalized.

### D. `PAPERCLIP_API_URL` is valid, but naive use of the base URL is misleading

`http://127.0.0.1:3101` serves the SPA shell.

That is fine for the browser, but it is not a good operational proof target.

The correct proof targets are:

- `http://127.0.0.1:3101/api/health`
- specific `/api/...` endpoints actually needed for the run

So the defect is not that the URL is inherently wrong.
The defect is that the agent still treats coarse local probes against the base
surface as meaningful control-plane evidence.

## Decision

We should stop trying to fix this only through more textual hardening in
CEO-only instructions.

The permanent correction must be structural.

## Target Model

For issue-scoped CEO baseline reviews, the truth hierarchy must be:

1. inline wake payload
2. injected managed instructions
3. injected `PROJECT_PACKET` content
4. explicit Paperclip API mutation results from this run
5. runtime-reconciled post-run mutation ledger
6. local shell probes only as auxiliary diagnostics

The CEO must never let layer 6 override layers 1 through 5.

## Required Product/Runtime Changes

### 1. Add a scoped CEO baseline-review mode

Create an explicit scoped mode for CEO repo-first reviews.

This mode should apply when all are true:

- role is `ceo`
- wake is issue-scoped
- issue is baseline/repo-first context
- expected output is review/decision, not execution

Behavior in this mode:

- no assignment enumeration
- no generic identity probing
- no control-plane probe by default
- no mutation claims except those actually returned by Paperclip APIs
- closing output focuses on:
  - confirmed facts
  - decision
  - next operator action

### 2. Split the generic `paperclip` skill into scoped guidance branches

The skill must stop presenting the same heartbeat discipline to:

- execution agents
- review agents
- approval agents
- CEO baseline reviewers

At minimum, add a scoped branch for:

- `issue_comment_mentioned` + repo-first baseline review

That branch must explicitly say:

- do not fetch `/api/agents/me`
- do not do fresh checkout if harness already scoped the run
- do not use base-URL curl probes
- do not self-audit comment posting by speculative shell checks

### 3. Add a runtime mutation truth ledger

Before the agent finishes, the runtime should provide a compact structured
ledger of what actually happened in the run.

Suggested fields:

- `issueCommentRecorded: boolean`
- `issueCommentId: string | null`
- `commentCreatedByRunIdMatches: boolean`
- `requiredCommentPolicyOutcome`
- `explicitMutationsSucceeded: string[]`
- `explicitMutationsFailed: string[]`
- `localProbeFailures: string[]`

This can be:

- appended into the closing prompt context
- or injected as a terminal run delta

The CEO closing narrative should be forced to prefer this ledger over shell
probes.

### 4. Introduce API-specific env hints

Keep `PAPERCLIP_API_URL`, but also inject:

- `PAPERCLIP_API_BASE`
- `PAPERCLIP_HEALTH_URL`

Suggested values:

- `PAPERCLIP_API_BASE=http://127.0.0.1:3101/api`
- `PAPERCLIP_HEALTH_URL=http://127.0.0.1:3101/api/health`

This reduces the chance that agents treat the SPA root as the operational proof
surface.

### 5. Expose `PROJECT_PACKET` explicitly instead of relying on cwd discovery

The packet is already injected into instructions, but the agent can still test
for a literal file in the `cwd` and get `__NO_PROJECT_PACKET__`.

Add one of:

- `PAPERCLIP_PROJECT_PACKET_PATH`
- `PAPERCLIP_PROJECT_PACKET_PRESENT=true`

And state clearly that:

- the packet content may already be injected even if no packet file exists in
  the current repo `cwd`

### 6. Add an explicit final reconciliation rule for CEO comments

Before final comment emission, apply:

- if `issueCommentRecorded=true`, forbid language implying the thread was not
  updated
- if run `status=succeeded`, forbid global outage language unless an explicit
  required mutation actually failed
- if only local probes failed, allow only narrow wording such as:
  - `local API probe failed`
  - not `control plane unavailable`

## Implementation Slices

### Slice 1 — Scoped CEO review doctrine

Change:

- `skills/paperclip/SKILL.md`
- CEO onboarding docs if needed

Outcome:

- generic skill no longer misguides CEO baseline-review runs

Acceptance:

- CEO review runs do not instruct themselves toward generic identity/probe work

### Slice 2 — API env clarification

Change:

- adapter env injection path
- tests for local adapter env propagation

Outcome:

- runtime exposes `PAPERCLIP_API_BASE` and `PAPERCLIP_HEALTH_URL`

Acceptance:

- local adapters receive those env vars
- docs/examples prefer them over raw base URL assumptions

### Slice 3 — Project packet explicit presence contract

Change:

- adapter env injection or prompt prefix metadata

Outcome:

- CEO can tell whether packet truth is already injected

Acceptance:

- no more false negative `PROJECT_PACKET.md` cwd checks for managed bundles

### Slice 4 — Mutation truth ledger

Change:

- heartbeat service
- adapter prompt finalization path

Outcome:

- agent gets authoritative run mutation summary before closure

Acceptance:

- if a run-created comment exists, the agent can see that as structured truth

### Slice 5 — Closing-language enforcement

Change:

- CEO instructions
- optionally runtime-side guard/normalizer for final comment generation

Outcome:

- closing comments cannot contradict recorded run facts

Acceptance:

- no final CEO comment says it may not have updated the thread when the thread
  contains a run-created comment

## Verification Plan

### Unit / contract

- update skill/instruction tests
- add env-injection tests
- add heartbeat truth-ledger tests
- add final-comment policy tests

### Browser/API truth

Repeat HITL on:

- baseline issue review
- CEO comment completion
- repository-context acceptance
- CTO staffing flow

Validate specifically:

- CEO says when repo is CTO-onboardable
- CEO does not ask for premature runbook completion
- CEO does not claim uncertainty about comment posting
- CEO does not infer global control-plane outage from local probe failure

### Persistent E2E

Add or extend a local repo-first regression lane to assert:

- CEO review comment contains staffing-forward conclusion
- CEO review comment does not contain forbidden contradiction phrases

## Acceptance Criteria

This work is done when all are true:

1. CEO repo-first review still produces correct staffing-forward judgment.
2. CEO no longer claims uncertainty about thread updates when the run-created
   comment exists.
3. CEO no longer treats base URL or weak local probes as control-plane truth.
4. Runtime exposes enough structured truth that this behavior does not depend
   only on prompt wording.
5. The same behavior reproduces in fresh HITL company creation, not only in
   patched existing companies.

## Non-Goals

This plan does not attempt to:

- redesign the entire generic Paperclip heartbeat model for all agents
- remove API access from execution agents
- eliminate all local shell diagnostics

The scope is specifically:

- CEO baseline review truth reconciliation
- runtime evidence hierarchy
- stable repo-first staffing handoff

## Relationship to Existing Plans

This plan is downstream of:

- [2026-04-23-repo-first-workflow-correction-executive-plan.md](/home/marcelo-karval/Backup/Projetos/paperclip/doc/plans/2026-04-23-repo-first-workflow-correction-executive-plan.md)
- [2026-04-23-project-intake-surface-unification-executive-plan.md](/home/marcelo-karval/Backup/Projetos/paperclip/doc/plans/2026-04-23-project-intake-surface-unification-executive-plan.md)

Those plans fixed workflow sequencing and surface ownership.

This plan fixes the remaining **CEO truth and reconciliation layer** that still
causes contradictory reviews even after the repo-first workflow is otherwise
correct.

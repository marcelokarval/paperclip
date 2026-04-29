# 2026-04-23 Repo-First Workflow Correction Executive Plan

## Purpose

Correct the repo-first onboarding workflow so it behaves as a single coherent
product sequence from repository intake to first staffing action, instead of a
set of partially correct but semantically disconnected surfaces.

This plan is specifically grounded in HITL validation of the `BOT` company flow
 on `http://127.0.0.1:3101`.

## Problem Statement

The current implementation has the necessary pieces:
- repository baseline
- AI enrichment
- project operating context
- CEO review
- staffing brief
- hiring issue
- CTO onboarding

But these pieces are not sequenced into a clear operator-facing workflow.

The main failure is not missing capability. The failure is **state model and UX
orchestration**.

Today the system allows these contradictions:
- project-level baseline behaves as accepted before the operator sees a clean
  acceptance sequence
- the baseline issue still reads as `ready` while the project is effectively
  `accepted`
- CEO review acts like a gate to execution readiness, but the product does not
  model that stage explicitly
- staffing exists as a capability, but the operator is not led there through a
  stable next-step ladder

## HITL Evidence

This plan incorporates the findings first captured in the temporary working note:
- `/tmp/paperclip-hitl-polish-notes.md`

Those findings are summarized here as binding evidence for correction scope.

### 1. Overview underuses available project context

Observed on:
- `http://127.0.0.1:3101/BOT/projects/launch-fullstack/overview`

Reality:
- backend/project payload already contains rich `operatingContext`
- overview renders too little of it
- loading/skeleton behavior amplifies the feeling that the page is empty

Correction implication:
- the product cannot rely on the operator to infer workflow state from hidden
  data
- overview must narrate phase and readiness more explicitly

### 2. Baseline workflow is phase-misaligned

Observed on:
- workspace baseline controls
- `BOT-1`

Reality:
- `Create operator issue` only creates the baseline issue
- `Ask CEO to review baseline` is the first real agential action
- project state and issue state are already semantically out of sync before the
  operator finishes the baseline flow

Correction implication:
- baseline creation, baseline review, baseline acceptance, and staffing
  readiness must become distinct phases

### 3. CEO review is useful, but the product does not know what phase it means

Observed on:
- CEO run on `BOT-1`

Reality:
- the CEO produced a valid and useful conclusion
- the conclusion effectively said:
  - repository context is good
  - execution delegation context is still incomplete
- the system moved the issue to `in_review`, but the project was already marked
  `accepted`

Correction implication:
- CEO review must produce a typed workflow outcome, not only a comment

## Correct Workflow Model

The workflow should be:

1. `Repository baseline created`
2. `Repository baseline enriched`
3. `Repository context accepted`
4. `CEO refinement requested`
5. `Execution context readiness resolved`
6. `Staffing brief generated`
7. `Hiring issue created`
8. `Hire approved`
9. `CTO onboarded through hiring issue`

The critical correction is the missing explicit phase between:
- repository context acceptance
- staffing readiness

### Distinct states that must exist

The model should distinguish at least these states:

- `baseline_ready`
- `baseline_review_requested`
- `repository_context_accepted`
- `execution_context_needs_operator_contract`
- `execution_context_ready`
- `staffing_brief_ready`
- `hiring_issue_created`
- `hire_approved`
- `role_onboarded`

## Product Decision

`Baseline accepted` must no longer mean two things at once.

We must separate:

### A. Repository context accepted

Meaning:
- the repository baseline is good enough as Paperclip-owned context
- docs, stack, labels, guidance, and canonical references are accepted as
  read-only project understanding

This does **not** necessarily mean the repo is ready for clean execution
delegation.

### B. Execution context ready

Meaning:
- package manager/runtime contract is clear
- verification commands are operator-approved
- env/bootstrap expectations are operator-approved
- design authority rule is operator-approved
- CEO review does not block delegation anymore

Only after this state should staffing become the next default CTA.

## Required Product Correction

### 1. Introduce an explicit execution-readiness phase

Add a dedicated state machine segment after CEO review:
- `needs_operator_contract`
- `ready_for_staffing`

The CEO review output must map into one of these typed outcomes.

### 2. Make the CEO review structured, not just narrative

The CEO should still post a human-readable comment, but the workflow also needs
structured output persisted by the system:
- `outcome`
- `blockingContext`
- `recommendedNextOperatorAction`
- `staffingReadiness`

Suggested outcome enum:
- `ready_for_staffing`
- `needs_operator_contract`
- `insufficient_context`

### 3. Add an operator contract step

If CEO outcome is `needs_operator_contract`, the next product step must be an
explicit operator action, not a hidden convention.

The operator contract form should capture:
- canonical package manager/runtime
- canonical install command
- canonical verification commands
- minimal env/bootstrap handoff contract
- design authority rule

Output of this step:
- project-level `executionContext`
- issue-level summary comment or note on the baseline thread

### 4. Re-sequence the CTA ladder

Expected CTA order:

1. `Create baseline issue`
2. `Run AI enrichment`
3. `Apply recommendations`
4. `Ask CEO to refine baseline`
5. if needed: `Complete execution contract`
6. once ready: `Generate hiring brief`
7. `Create hiring issue`

Buttons that should disappear or be demoted after phase completion must not stay
competing on screen.

### 5. Align issue copy with real phase

The baseline issue description, helper text, and action block must reflect the
actual workflow phase.

Examples:
- do not keep `Baseline status: ready` once repository context is already
  accepted
- do not keep `Do not wake agents` after the flow explicitly supports
  `Ask CEO to review baseline`
- do not mark the issue `done` without giving the operator a visible next stage
  if staffing is the intended continuation

### 6. Make overview narrate the phase

The overview page should prominently show:
- repository context status
- CEO refinement status
- execution context readiness
- staffing readiness
- next recommended operator action

Without this, even correct backend state still feels empty and confusing.

## Implementation Slices

### Slice 1. Add explicit workflow state to project/workspace

Target:
- add a dedicated repo-first workflow state object

Suggested shape:
- `repositoryContextStatus`
- `ceoReviewStatus`
- `executionContextStatus`
- `staffingStatus`
- `nextRecommendedAction`

Likely files:
- `packages/shared/src/types/project.ts`
- `packages/shared/src/validators/project.ts`
- `server/src/services/projects.ts`
- `server/src/routes/projects.ts`

### Slice 2. Type CEO review outcomes

Target:
- persist structured result of CEO baseline review

Likely files:
- `server/src/services/default-agent-instructions.ts`
- `server/src/services/heartbeat.ts`
- issue/work-product or activity-log storage path for typed review result

### Slice 3. Add execution contract step

Target:
- operator-facing form/modal/panel to resolve execution ambiguity

Likely fields:
- package manager/runtime
- verify commands
- install/bootstrap command
- env handoff rule
- design authority rule

Likely files:
- `ui/src/components/RepositoryBaselinePanel.tsx`
- `ui/src/components/ProjectStaffingPanel.tsx`
- `ui/src/pages/IssueDetail.tsx`
- `server/src/routes/projects.ts`

### Slice 4. Re-sequence CTA presentation

Target:
- only show the next valid action at each phase

Likely surfaces:
- workspace baseline panel
- issue detail baseline action block
- overview staffing block

### Slice 5. Align copy and status transitions

Target:
- baseline issue and project state must tell the same story

This includes:
- issue status semantics
- baseline description text
- action labels
- helper text

### Slice 6. Promote staffing only after execution context readiness

Target:
- `Generate hiring brief` becomes the natural next step once the operator
  contract is complete

## Acceptance Criteria

The correction is done when all are true:

1. The operator can follow a single visible sequence from baseline to staffing
   without guessing.
2. `Baseline accepted` no longer ambiguously means both repository-context
   acceptance and execution-readiness.
3. CEO review produces a typed workflow result that the UI consumes.
4. The system can block staffing until execution context is explicitly ready.
5. The overview page shows the current repo-first phase and next action.
6. The baseline issue, project overview, workspace panel, and staffing panel all
   tell the same state story.

## Recommended Execution Order

1. state model
2. CEO typed review result
3. execution contract UI + persistence
4. CTA resequencing
5. issue/copy/status alignment
6. overview workflow narration
7. staffing gating by execution readiness

## What Not To Do

- Do not add more AI before the workflow state model is corrected.
- Do not add more hidden automation between baseline and staffing.
- Do not make the CTO creation path depend on the operator inferring an
  undocumented intermediate phase.
- Do not keep parallel meanings for `accepted`.

## Expected Outcome

After this correction, a repo-first onboarding should feel like:

- clear
- sequential
- operator-guided
- auditable
- ready to hand off to staffing without ambiguity

Instead of:

- correct in pieces
- confusing in sequence
- semantically inconsistent across screens

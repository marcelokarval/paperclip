# 2026-04-23 Project Intake Surface Unification Executive Plan

Status: Proposed
Date: 2026-04-23
Audience: Product, frontend, backend, workflow, issue UX
Depends on:

- `doc/plans/2026-04-23-project-intake-and-staffing-prd.md`
- `doc/plans/2026-04-23-project-intake-and-staffing-executive-plan.md`
- `doc/plans/2026-04-23-repo-first-workflow-correction-executive-plan.md`

## 1. Executive Summary

The repo-first workflow is currently correct in capability but fragmented in surface ownership.

Today the operator must bounce across:

- `project configuration`
- `project workspace`
- `baseline issue`

to complete one continuous flow:

1. understand the repository
2. review it
3. accept it
4. move toward the first CTO

This plan unifies those steps into a single primary product surface:

- `Project Intake`

The existing surfaces remain, but their roles change:

- `Project Intake` becomes the primary guided flow
- `Configuration` becomes stable project config only
- `Workspace` becomes technical codebase detail only
- `Issue #1` remains canonical evidence and discussion only

## 2. Problem Statement

The fragmentation is not random. It comes from the current technical ownership model:

- workspace owns repository baseline discovery
- project owns promoted operating context
- issue owns review and decision thread

This matches the data model, but not the human workflow.

The result is cognitive fragmentation:

- `Accept as goal` appears in configuration because goals are project-level
- baseline actions appear in workspace because baseline metadata lives there
- review/acceptance actions appear in issue detail because the baseline thread is the audit trail

Technically coherent, product-wise broken.

## 3. Product Decision

The repo-first flow must become phase-oriented instead of storage-oriented.

The operator should not have to care where the data lives.
The operator should only need to understand:

1. what phase the project is in
2. what the next step is
3. which artifacts support that phase

Therefore:

- `Project Intake` becomes the single primary route for repo-first onboarding
- supporting surfaces become secondary detail or evidence views

## 4. New Surface Ownership Model

## 4.1 Project Intake

New primary route:

- `/projects/:projectId/intake`

This route owns the repo-first onboarding flow.

It should render these phases in order:

1. `Repository Scan`
2. `AI Enrichment`
3. `CEO Review`
4. `Repository Acceptance`
5. `Optional Clarifications`
6. `Staffing`

This page answers one question clearly:

- `What should the operator do next?`

## 4.2 Configuration

`/projects/:projectId/configuration` should stop being an onboarding surface.

It should retain only stable project-level configuration such as:

- description
- status
- env
- execution workspace policy
- issue system guidance
- archived state

Remove from `Configuration` as primary actions:

- suggested goals acceptance
- staffing phase controls
- onboarding-derived recommendations that are only relevant during intake

These can remain visible elsewhere after acceptance, but not as the primary onboarding lane.

## 4.3 Workspace

`/projects/:projectId/workspaces/:workspaceId` should become technical codebase detail.

It should retain:

- repo path / repo URL
- setup / cleanup commands
- runtime controls
- raw repository baseline diagnostics
- baseline analyzer diagnostics

It should stop acting like the main onboarding page.

The baseline panel may remain there, but as a detail view reached from intake, not as the operator's primary flow.

## 4.4 Baseline Issue

`/issues/:id` for the baseline issue should remain:

- canonical technical thread
- CEO review thread
- evidence record
- discussion log

It should stop being treated as the primary place where the operator discovers the next step.

Primary actions should be available from intake; the issue should reflect the state, not define the workflow alone.

## 5. Target Information Architecture

## 5.1 Primary navigation

Project pages become:

- `Overview`
- `Issues`
- `Workspaces`
- `Intake`
- `Configuration`
- `Budget`

`Intake` should appear before `Configuration`.

## 5.2 Phase rail

`Project Intake` gets a visible phase rail:

- `Repository scan`
- `AI enrichment`
- `CEO review`
- `Accept repository context`
- `Execution clarifications`
- `Staffing`

Each phase has:

- status
- short explanation
- next CTA
- links to supporting artifacts

## 5.3 Supporting artifacts panel

The intake page should include an artifact sidebar or lower block containing:

- baseline issue link
- workspace link
- canonical docs summary
- suggested goals summary
- staffing state

This preserves traceability without forcing navigation.

## 6. Target CTA Sequence

The primary CTA order on intake should be:

1. `Create baseline issue`
2. `Refresh baseline`
3. `Run AI enrichment`
4. `Apply recommendations`
5. `Ask CEO to review baseline`
6. `Accept repository context`
7. optional: `Save execution clarifications`
8. `Generate hiring brief`
9. `Create hiring issue`

Important rule:

- only one CTA should feel primary at each phase
- secondary or completed actions must be visually demoted

## 7. What Moves Where

## 7.1 Move from Configuration to Intake

Move these onboarding-phase elements out of `ProjectProperties` primary ownership:

- `Accept as goal`
- suggested goals cards
- onboarding-only labels/docs/recommendations emphasis
- staffing recommendation as a primary onboarding step

Keep a read-only summary later in configuration if needed, but not the main acceptance flow.

## 7.2 Move from Workspace to Intake

Move these primary workflow controls to `Project Intake`:

- `Refresh baseline`
- `Run AI enrichment`
- `Apply recommendations`
- `Create operator issue`
- `Generate hiring brief`
- `Create hiring issue`

Workspace can still expose them as secondary technical shortcuts if useful, but intake owns them.

## 7.3 Move from Issue to Intake

Move these primary operator actions to `Project Intake`, while keeping issue mirrors if necessary:

- `Ask CEO to review baseline`
- `Accept repository context`
- `Execution clarifications`

The issue remains the evidence thread.
The intake page becomes the control surface.

## 8. UX Behavior Rules

## 8.1 One primary phase at a time

The intake page must compute:

- current phase
- completed phases
- next recommended action

This state should be derived from existing project/workspace/issue data and not require a new complex state machine in the first slice.

## 8.2 Issue as evidence, not wizard

The baseline issue should:

- show status and references
- show CEO comments
- allow direct reading and discussion

But the operator should not need to use it as the wizard.

## 8.3 Configuration as stable settings

Configuration should feel like:

- where I tune the project

not:

- where I continue onboarding

## 8.4 Workspace as technical detail

Workspace should feel like:

- where I inspect repo details and runtime settings

not:

- where I have to remember the next onboarding action

## 9. Implementation Slices

## Slice 1: Add Project Intake route and page shell

Files:

- `ui/src/App.tsx`
- new `ui/src/pages/ProjectIntakeDetail.tsx`
- routing helpers as needed

Goal:

- introduce `/projects/:projectId/intake`
- phase rail + summary shell only
- no major logic movement yet

Proof:

- route renders
- project loads
- navigation works from project tabs

## Slice 2: Lift primary onboarding actions into intake

Files:

- `ui/src/pages/ProjectIntakeDetail.tsx`
- `ui/src/components/RepositoryBaselinePanel.tsx`
- `ui/src/pages/ProjectWorkspaceDetail.tsx`

Goal:

- render baseline actions in intake
- workspace remains detail surface
- keep existing mutations/endpoints

Proof:

- actions work from intake
- workspace still shows detail state

## Slice 3: Lift review/acceptance actions from issue into intake

Files:

- `ui/src/pages/ProjectIntakeDetail.tsx`
- `ui/src/pages/IssueDetail.tsx`
- any shared helpers

Goal:

- intake becomes the primary control surface for:
  - CEO review request
  - repository context acceptance
  - execution clarifications
- issue retains read-only explanation and evidence

Proof:

- the operator can complete review/acceptance from intake only
- issue reflects state without being required for workflow completion

## Slice 4: Move suggested goals into intake/staffing phase

Files:

- `ui/src/components/ProjectProperties.tsx`
- `ui/src/pages/ProjectIntakeDetail.tsx`

Goal:

- `Accept as goal` moves to intake
- configuration keeps only summary or stable goal references

Proof:

- goals can be accepted from intake
- configuration no longer feels like onboarding continuation

## Slice 5: Integrate staffing fully into intake

Files:

- `ui/src/components/ProjectStaffingPanel.tsx`
- `ui/src/pages/ProjectIntakeDetail.tsx`
- `ui/src/pages/ProjectWorkspaceDetail.tsx`
- `ui/src/pages/ProjectDetail.tsx`

Goal:

- staffing panel lives primarily inside intake
- project overview may show summary only
- workspace no longer acts as staffing home

Proof:

- operator can move from accepted repository context to hiring issue creation entirely within intake

## 10. Backend Impact

Initial slices should avoid backend churn where possible.

The first implementation should mostly recompose existing surfaces using current APIs:

- project operating context
- staffing state
- repository baseline endpoints
- issue-level review actions

Only after the UI unification is stable should we consider a dedicated intake-summary API if the composition becomes too chatty.

## 11. Acceptance Criteria

This refactor is done when all are true:

1. a new operator can complete repo-first onboarding from one primary route
2. `Configuration` no longer contains primary onboarding actions
3. `Workspace` no longer reads as the main onboarding page
4. `Issue #1` is no longer required as the main control surface
5. the next operator action is explicit at every intake phase
6. the existing repo-first E2E lane can be extended to validate the new intake route

## 12. Recommended Execution Order

1. intake route shell
2. baseline action lift
3. review/acceptance lift
4. suggested goals lift
5. staffing lift
6. cleanup of duplicate/deprecated actions from configuration/workspace/issue

## 13. Final Product Rule

The operator should never have to answer:

- `which of these three screens am I supposed to use now?`

The product should answer that directly via `Project Intake`.

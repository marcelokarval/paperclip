# 2026-04-23 Project Intake And Staffing Executive Plan

Status: Ready for execution
Date: 2026-04-23
Audience: Backend, frontend, issue workflow, onboarding, agent bootstrap
Depends on:

- `doc/plans/2026-04-20-repository-documentation-baseline.md`
- `doc/plans/2026-04-23-project-operating-context-from-baseline.md`
- `doc/plans/2026-04-23-project-operating-context-executive-implementation.md`
- `doc/plans/2026-04-23-project-intake-and-staffing-prd.md`

## 1. Executive Summary

This plan turns the path from accepted baseline to first technical hire into a first-class workflow.

Core rule:

- `Issue #1` remains the canonical technical thread
- staffing is emitted into a separate hiring issue
- the hiring issue is derived from accepted project context, not from ad hoc issue text

Execution order:

1. expose explicit `Project Intake` and `Staffing` phases in UI
2. generate a structured hiring brief from accepted project context
3. create a dedicated hiring issue from that brief
4. thread approval and hire flows through the new staffing issue
5. keep baseline issue as canonical source for technical understanding

## 2. Deliverables

This plan lands:

- explicit intake and staffing sections in workspace/project UX
- a structured hiring brief generator
- a dedicated hiring issue creation flow
- linkage between baseline issue and hiring issue
- hire/onboarding behavior that enters through the hiring issue while preserving baseline issue as canonical source

This plan does not land:

- automatic hire approval
- automatic hire creation on brief generation
- automatic multi-role staffing trees
- automatic backlog creation

## 3. Target Product Surface

## 3.1 Workspace / project sections

Add or refine three visible sections:

- `Project Intake`
- `Technical Canon`
- `Staffing`

Primary homes:

- `ui/src/pages/ProjectWorkspaceDetail.tsx`
- `ui/src/components/RepositoryBaselinePanel.tsx`
- `ui/src/pages/ProjectDetail.tsx`

## 3.2 New actions

Add:

- `Generate hiring brief`
- `Create hiring issue`

Recommended gating:

- `Generate hiring brief` enabled only when:
  - baseline issue exists
  - baseline is accepted
  - project operating context exists
- `Create hiring issue` enabled only after brief preview is available and confirmed

## 4. Primary Contracts

## 4.1 Staffing summary on project/workspace

Introduce a lightweight derived staffing state in API responses, backed either by project metadata or a deterministic query composition.

Suggested shape:

```ts
export interface ProjectStaffingState {
  recommendedRole: "cto" | null;
  status:
    | "not_started"
    | "brief_generated"
    | "issue_created"
    | "approval_pending"
    | "hire_approved"
    | "role_onboarded";
  baselineIssueId: string | null;
  baselineIssueIdentifier: string | null;
  hiringIssueId: string | null;
  hiringIssueIdentifier: string | null;
  lastBriefGeneratedAt: string | null;
}
```

This can live inside `project.operatingContext` in the first slice or as a sibling field if API clarity demands it.

## 4.2 Hiring brief payload

Add a shared request/response shape for preview and create:

```ts
export interface GenerateHiringBriefRequest {
  role: "cto";
  sourceIssueId?: string | null;
}

export interface HiringBriefPreview {
  role: "cto";
  title: string;
  summary: string;
  rationale: string[];
  projectContext: string[];
  risks: string[];
  expectedFirstOutput: string[];
  guardrails: string[];
  canonicalReferences: Array<{
    type: "issue" | "doc" | "project";
    label: string;
    value: string;
  }>;
  successCriteria: string[];
}
```

## 4.3 Hiring issue linkage

The new hiring issue should explicitly link to the canonical baseline issue.

Minimum requirement:

- body contains baseline issue reference

Preferred follow-up:

- use issue relation fields if they fit:
  - parent/child
  - blocked by
  - source-reference field in metadata

First slice recommendation:

- explicit reference in body plus metadata pointer if lightweight

## 5. Backend Slices

## Slice 1: Staffing state derivation

Goal:

- expose enough state for UI to render `Staffing`

Files:

- `packages/shared/src/types/project.ts`
- `packages/shared/src/validators/project.ts`
- `packages/shared/src/index.ts`
- `server/src/services/projects.ts`
- `server/src/routes/projects.ts`
- focused tests in `server/src/__tests__/`

Steps:

1. Add shared staffing state contract.
2. Derive recommended next role from operating context and baseline status.
3. Include baseline issue and any existing hiring issue linkage.
4. Return this in project/workspace responses.

Proof:

- parser tests
- route tests
- deterministic derivation tests

## Slice 2: Hiring brief preview service

Goal:

- build a deterministic staffing brief from accepted context

Files:

- `server/src/services/projects.ts`
- new `server/src/services/staffing-brief.ts`
- `server/src/routes/projects.ts`
- focused tests

Steps:

1. Add `buildHiringBriefPreview(...)`.
2. Inputs:
   - accepted baseline
   - project operating context
   - executive packet
   - technical packet
   - baseline issue reference
   - CEO refinement comments if safely available
3. Produce a structured preview object.
4. Add preview route or action endpoint.

Proof:

- unit tests for complete and sparse contexts
- route tests proving gating on baseline acceptance

## Slice 3: Frontend staffing panel and preview modal

Goal:

- make staffing visible and actionable in UI

Files:

- `ui/src/pages/ProjectWorkspaceDetail.tsx`
- `ui/src/components/RepositoryBaselinePanel.tsx`
- new `ui/src/components/ProjectStaffingPanel.tsx`
- new helper tests in `ui/src/lib/`

Steps:

1. Add `Staffing` section beneath intake/canon.
2. Show recommended role, state, issue links, helper text.
3. Add `Generate hiring brief` button.
4. Add preview modal or drawer.

Proof:

- UI helper tests
- typecheck
- browser proof on real project/workspace page

## Slice 4: Hiring issue creation

Goal:

- create a dedicated hiring issue from approved preview

Files:

- `server/src/routes/projects.ts` or `server/src/routes/issues.ts`
- `server/src/services/issues.ts`
- `ui/src/components/ProjectStaffingPanel.tsx`
- tests across server and UI

Steps:

1. Add endpoint to create issue from brief payload.
2. Title format:
   - `Hire CTO for <project>`
3. Body sections:
   - why this hire exists
   - project context
   - current technical shape
   - known risks and gaps
   - expected first output
   - guardrails
   - canonical references
   - success criteria
4. Persist staffing state with issue id/identifier.
5. Link body back to baseline issue.

Proof:

- server route tests
- issue body snapshot-style assertions
- browser proof that issue appears and links resolve correctly

## Slice 5: Approval and onboarding alignment

Goal:

- move first-hire entrypoint onto the staffing issue without losing baseline truth

Files:

- `server/src/services/hire-hook.ts`
- `server/src/routes/agents.ts`
- `server/src/services/default-agent-instructions.ts`
- onboarding asset files for CEO/CTO if needed
- tests in `server/src/__tests__/`

Steps:

1. Ensure hire approval comments target staffing issue.
2. Ensure wakeup targets staffing issue.
3. Keep `PROJECT_PACKET.md` and baseline references intact.
4. Ensure CTO instructions explicitly read both:
   - staffing issue for operational entry
   - baseline issue for canonical technical context

Proof:

- hire-hook tests
- default-agent-instructions tests
- dogfood flow on local runtime

## 6. Frontend Interaction Design

## 6.1 Staffing panel content

Minimum content:

- recommended next role
- current staffing phase
- baseline issue link
- hiring issue link when present
- helper copy describing what the action does not do

## 6.2 CTA copy

Primary:

- `Generate hiring brief`

Secondary:

- `Create hiring issue`

Avoid using `Hire now` or equivalent in this phase.

## 6.3 Visual consistency

If the intake panel has already adopted the newer richer layout, the staffing panel should follow the same pattern:

- phase title
- short explanatory copy
- status pill
- primary action
- secondary issue links

## 7. Documentation Alignment

When this work lands, keep these docs aligned:

- `doc/plans/2026-04-20-repository-documentation-baseline.md`
- `doc/plans/2026-04-23-project-operating-context-from-baseline.md`
- `doc/plans/2026-04-23-project-operating-context-executive-implementation.md`
- this executive plan
- the staffing PRD

This staffing plan should be treated as the next layer after operating context, not as a disconnected initiative.

## 8. Verification Matrix

Minimum engineering proof before closure:

1. shared/server/ui typecheck
2. focused route and service tests for staffing brief generation
3. focused UI tests for panel and preview behavior
4. browser proof on local runtime at `127.0.0.1:3101`
5. dogfood flow:
   - accepted baseline exists
   - staffing brief generated
   - hiring issue created
   - hiring issue links back to baseline issue

## 9. Recommended Commit Order

1. `shared + server: staffing state contract and derivation`
2. `server: hiring brief preview service`
3. `ui: staffing panel and preview`
4. `server + ui: create hiring issue from preview`
5. `server: hire/onboarding alignment to staffing issue`

## 10. Open Execution Questions

1. Should CEO refinement comments be mined automatically into the brief in the first slice, or should the first version rely only on accepted operating context plus baseline issue identity?
2. Should the staffing state be stored directly in `project.operatingContext`, or derived mostly from existing issues plus a small persisted marker?
3. Should the first staffing issue use labels automatically in v1, or only include suggested labels in the body?

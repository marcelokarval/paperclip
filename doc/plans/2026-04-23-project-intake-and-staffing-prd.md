# 2026-04-23 Project Intake And Staffing PRD

Status: Proposed for execution
Date: 2026-04-23
Audience: Product, frontend, backend, onboarding, issue workflow, agent bootstrap
Parent context:

- `doc/plans/2026-04-20-repository-documentation-baseline.md`
- `doc/plans/2026-04-23-project-operating-context-from-baseline.md`
- `doc/plans/2026-04-23-project-operating-context-executive-implementation.md`
- `server/src/routes/projects.ts`
- `server/src/routes/issues.ts`
- `server/src/routes/agents.ts`
- `server/src/services/default-agent-instructions.ts`
- `server/src/services/hire-hook.ts`
- `ui/src/pages/ProjectWorkspaceDetail.tsx`
- `ui/src/components/RepositoryBaselinePanel.tsx`
- `ui/src/pages/ProjectDetail.tsx`
- `ui/src/components/ProjectProperties.tsx`

## 1. Executive Decision

Paperclip should make the path from accepted baseline to first technical hire a first-class product workflow.

The new boundary is:

- `Issue #1` remains the canonical technical thread for repository understanding
- staffing becomes a separate, explicit workflow phase
- the first hire is emitted from accepted project context into a new issue, not mixed into the baseline issue

Execution order remains strict:

1. baseline and AI enrichment create project understanding
2. accepted baseline becomes project operating context
3. CEO refines the understanding and staffing rationale
4. the operator generates a staffing brief
5. Paperclip creates a new hiring issue from that brief
6. approval and hire flows continue from the hiring issue

## 2. Problem Statement

The current flow is functional but still collapses too many responsibilities into the baseline issue:

- technical repository understanding
- executive framing
- staffing rationale
- first-hire handoff

This creates ambiguity:

- the baseline issue becomes both a canonical technical artifact and a staffing work item
- the operator has no explicit UI phase for staffing
- the CEO's transition from "understand the system" to "hire the right technical lead" is not surfaced as product state

For existing repositories, that is too implicit.

## 3. Product Goals

### Goal 1: Make project intake explicit

The product should narrate `Project Intake` as a distinct phase, not as a loose set of workspace buttons.

### Goal 2: Keep the baseline issue technical and canonical

`Issue #1` should remain the system of record for:

- baseline understanding
- stack
- docs
- risks and gaps
- CEO technical refinement

It should not also be the operational hiring thread.

### Goal 3: Make staffing a governed product phase

After baseline acceptance, the operator should have an explicit `Staffing` stage with clear UI, state, and next actions.

### Goal 4: Generate high-context hiring issues

The first hiring issue should be derived from:

- accepted baseline
- AI enrichment
- project operating context
- CEO refinement recorded on the baseline issue

### Goal 5: Keep hiring explicit and auditable

Generating a staffing brief or creating a hiring issue must not automatically:

- create a hire
- approve a hire
- wake a new agent
- create backlog decomposition

## 4. Non-Goals

This PRD does not introduce:

- automatic CTO creation
- automatic approvals
- automatic issue splitting
- automatic multi-role staffing plans
- automatic goal creation
- automatic task delegation from baseline acceptance
- autonomous backlog generation

## 5. User Stories

### Story 1: Operator sees a clear intake phase

As an operator, when I connect an existing project, I want a visible intake phase so I understand where the project is in baseline discovery and acceptance.

Acceptance criteria:

- the workspace/project UI names the phase `Project Intake`
- baseline status is visible
- intake actions are grouped in one place
- the transition to staffing is visible after acceptance

### Story 2: Baseline issue remains technical

As an operator, I want the first issue to remain the canonical technical thread for the repository so future hires can always refer back to one source of truth.

Acceptance criteria:

- baseline issue is clearly identified as canonical
- staffing actions do not convert that issue into a hire request
- future staffing issues link back to the baseline issue

### Story 3: CEO refines context before staffing

As an operator, I want the CEO to refine the technical and organizational understanding of the project before a hire request is created.

Acceptance criteria:

- CEO guidance explicitly treats baseline review as a refinement step
- CEO can strengthen the staffing rationale without creating the hire automatically
- CEO comments remain anchored to the baseline issue

### Story 4: Operator can generate a staffing brief

As an operator, I want a one-click way to generate a staffing brief from accepted project context so I do not have to manually rewrite the technical rationale for the first hire.

Acceptance criteria:

- a `Generate hiring brief` action exists after baseline acceptance
- it opens a preview modal or equivalent review surface
- it shows source signals used to build the brief
- it does not create the issue until confirmed

### Story 5: Hiring issue is materially better than a generic task

As an operator, when I create the hiring issue, I want it to contain the real project context so the future CTO starts from a grounded technical brief.

Acceptance criteria:

- issue includes rationale, stack, docs, risks, verification defaults, ownership hints, and success criteria
- issue links back to the canonical baseline issue
- the issue is marked as staffing or hiring work, not baseline work

## 6. Desired Workflow

### 6.1 Setup

Setup remains intentionally cold:

- company created
- issue prefix configured
- adapter and model configured
- CEO created
- no starter issue created
- no technical hire created

### 6.2 Project Intake

After setup, the operator enters the project/workspace and follows the intake sequence:

1. create canonical baseline issue
2. refresh deterministic baseline
3. run AI enrichment
4. apply recommendations
5. accept baseline

This phase produces accepted operating context.

### 6.3 CEO technical refinement

After baseline acceptance, the CEO uses:

- `Issue #1`
- `PROJECT_PACKET.md`
- accepted operating context

to refine:

- current project shape
- technical staffing need
- expected first role
- the quality bar for future agents

### 6.4 Staffing

After refinement, the operator enters a distinct `Staffing` phase:

1. generate hiring brief
2. review or edit the brief
3. create hiring issue
4. follow existing approval and hiring flows

### 6.5 First hire handoff

The first technical hire should enter through the hiring issue while treating the baseline issue as canonical technical source.

## 7. UX Model

## 7.1 Product sections

The workspace/project surface should present three blocks:

### Project Intake

Contains:

- baseline issue state
- baseline refresh
- AI enrichment
- apply recommendations
- baseline acceptance

### Technical Canon

Contains:

- baseline issue link
- overview summary
- docs
- verification commands
- ownership areas
- guidance

### Staffing

Contains:

- recommended next role
- staffing status
- brief generation
- hiring issue creation
- approval and onboarding status

## 7.2 New CTA

Primary new action:

- `Generate hiring brief`

Recommended helper text:

- `Build a staffing brief from the accepted baseline and project context.`
- `This does not create a hire or wake agents automatically.`

Secondary confirm action:

- `Create hiring issue`

## 7.3 Staffing states

Recommended visible states:

- `Not started`
- `Brief generated`
- `Hiring issue created`
- `Approval pending`
- `Hire approved`
- `Role onboarded`

## 8. Hiring Brief Structure

The generated hiring brief should include these sections:

1. `Why this hire exists`
2. `Project context`
3. `Current technical shape`
4. `Known risks and gaps`
5. `Expected first output`
6. `Guardrails`
7. `Canonical references`
8. `Success criteria`

## 9. Data Inputs For Hiring Brief

The brief generator should read from:

- baseline issue identifier and title
- accepted repository baseline
- AI enrichment summary and applied changes
- accepted project operating context
- executive project packet
- technical project packet
- CEO comments on the baseline issue, limited to refinement and staffing rationale

The brief must not depend on transient UI-only state.

## 10. CEO Role Refinement

The CEO's role becomes:

- executive framer
- context refiner
- organization calibrator
- staffing-decision support

The CEO is not expected to become the direct technical implementer for existing-repo intake.

CEO responsibilities in this phase:

- refine project understanding
- refine future-agent expectations
- identify whether a CTO is the next needed role
- avoid converting the baseline issue into the staffing issue

## 11. CTO Entry Expectations

Once a CTO is hired from the staffing issue:

- the CTO should wake on the hiring issue
- the CTO should read the baseline issue first for canonical project understanding
- the CTO should treat the hiring issue as operational entrypoint
- the CTO's first output should be a technical onboarding and framing comment, not immediate implementation

## 12. Success Metrics

Qualitative success:

- operators can explain the flow without hidden steps
- the baseline issue remains readable as the technical source of truth
- hiring issues are materially richer than ad hoc issue text
- the first CTO comment is more grounded and less generic

Product/behavioral success:

- increased use of baseline acceptance before first hire
- reduced need for manual rewriting of hire rationale
- fewer first-hire comments that ignore actual project stack/docs

## 13. Risks

### Risk 1: Too much ceremony

If intake and staffing feel too heavy, operators may bypass the intended path.

Mitigation:

- keep the UI staged but compact
- make staffing generation one-click after acceptance

### Risk 2: CEO comments become duplicated with the generated brief

Mitigation:

- baseline issue remains refinement thread
- hiring issue becomes the operational staffing artifact

### Risk 3: The hiring issue drifts from the canonical baseline issue

Mitigation:

- enforce link-back to the baseline issue
- derive hiring brief from accepted project context, not freeform memory

## 14. Rollout Order

1. make `Project Intake` and `Staffing` visible in UI
2. add hiring brief generation preview
3. add hiring issue creation from the preview
4. thread the new issue into approval and hire flows
5. refine CTO onboarding to enter through the hiring issue while reading the baseline issue

## 15. Open Questions

1. Should the default first staffing recommendation always be `CTO`, or should the system surface a ranked role list?
2. Should `Generate hiring brief` allow role override before creation, or should that stay fixed to the top recommendation in the first slice?
3. Should the staffing brief be editable inline before creation, or should the first slice prefer preview-only plus create?

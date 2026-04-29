# 2026-04-23 Project Operating Context Executive Implementation

Status: Ready for execution
Date: 2026-04-23
Audience: Backend, frontend, project/runtime, onboarding, issue workflow
Depends on:

- `doc/plans/2026-04-20-repository-documentation-baseline.md`
- `doc/plans/2026-04-23-project-operating-context-from-baseline.md`
- `doc/plans/2026-04-23-project-intake-and-staffing-prd.md`
- `doc/plans/2026-04-23-project-intake-and-staffing-executive-plan.md`

## 1. Executive Summary

This plan converts accepted repository baseline into project-level operational truth, then makes that truth usable in project surfaces, issue flows, and later agent bootstrap.

Execution must remain sequential:

1. promote accepted baseline into `project.operatingContext`
2. make project surfaces consume it
3. make issue flows consume it
4. add explicit `Project Intake` and `Staffing` workflow on top of the promoted context
5. only then improve CEO/CTO/operator workflows

The key rule is unchanged:

- baseline remains the source evidence artifact on the workspace
- operating context becomes the accepted project truth
- runtime packets are derived from operating context and must not become competing sources of truth

## 2. Target Deliverables

This executive plan lands these deliverables:

- a new `project.operatingContext` contract and storage path
- projection logic from accepted baseline into project operating context
- overview/configuration UI that consumes the promoted context
- suggested goals acceptance flow
- issue creation/detail context consumption
- role-specific derived packets for future CEO/CTO improvements

This plan does not land:

- automatic backlog decomposition
- automatic goal creation
- automatic CTO creation
- automatic multi-issue planning
- runtime trace/checkpoint storage

The staffing-specific execution layer is defined in:

- `doc/plans/2026-04-23-project-intake-and-staffing-prd.md`
- `doc/plans/2026-04-23-project-intake-and-staffing-executive-plan.md`

## 3. Primary Contracts

## 3.1 Project operating context

Add to shared project types and validators:

```ts
export interface ProjectOperatingContext {
  baselineStatus: "none" | "available" | "accepted";
  baselineAcceptedAt: string | null;
  baselineTrackingIssueId: string | null;
  baselineTrackingIssueIdentifier: string | null;
  baselineFingerprint: string | null;

  overviewSummary: string | null;
  configurationDescriptionSuggestion: string | null;
  descriptionSource: "manual" | "baseline" | "none";

  labelCatalog: Array<{
    name: string;
    color: string;
    description: string;
    source: "repository_baseline" | "manual" | "system";
    evidence: string[];
    confidence: "low" | "medium" | "high";
  }>;

  canonicalDocs: string[];
  verificationCommands: string[];
  ownershipAreas: Array<{
    name: string;
    paths: string[];
    recommendedLabels: string[];
  }>;

  operatingGuidance: string[];

  suggestedGoals: Array<{
    key: string;
    title: string;
    description: string;
    reason: string;
    recommendedLabels: string[];
    suggestedVerificationCommands: string[];
    source: "repository_baseline";
    status: "pending" | "accepted" | "rejected";
    acceptedGoalId: string | null;
  }>;

  executiveProjectPacket: ExecutiveProjectPacket | null;
  technicalProjectPacket: TechnicalProjectPacket | null;
}
```

## 3.2 Agent bootstrap packets

Add as nested shared types:

```ts
export interface ExecutiveProjectPacket {
  projectSummary: string;
  baselineTrackingIssueIdentifier: string | null;
  topRisks: string[];
  topGaps: string[];
  stackSummary: string[];
  docsToReadFirst: string[];
  operatingGuidance: string[];
  hiringSignals: Array<"cto" | "ux" | "marketing" | "ops">;
}

export interface TechnicalProjectPacket {
  projectSummary: string;
  stackSignals: string[];
  canonicalDocs: string[];
  verificationCommands: string[];
  ownershipAreas: Array<{
    name: string;
    paths: string[];
    recommendedLabels: string[];
  }>;
  labelCatalog: Array<{
    name: string;
    description: string;
  }>;
  issueGuidance: string[];
}
```

## 3.3 Project description behavior

Do not add a second persisted description field yet.

Use this behavior:

- `projects.description` remains the editable project description
- `project.operatingContext.configurationDescriptionSuggestion` stores the baseline-derived suggestion
- `project.operatingContext.descriptionSource` tracks whether current project description is effectively:
  - `none`
  - `baseline`
  - `manual`

This avoids a schema explosion while keeping the UX explicit.

## 4. Storage and Migration Strategy

Preferred storage:

- add `operating_context jsonb` to `projects`

Why:

- this is project truth, not workspace metadata
- issue/project routes already center project state
- later CEO/CTO/bootstrap flows should read from project-level truth directly

Files:

- `packages/db/src/schema/projects.ts`
- `packages/db/src/schema/index.ts`
- generated migration
- shared project serializers/parsers

Migration behavior:

- existing projects default to `null`
- no backfill job in the first slice
- operating context is created lazily on baseline apply/promote flows

## 5. Backend Execution Slices

## Slice 1: Shared contract and DB schema

Goal:

- define and persist `project.operatingContext`

Files:

- `packages/shared/src/types/project.ts`
- `packages/shared/src/validators/project.ts`
- `packages/shared/src/types/index.ts`
- `packages/shared/src/index.ts`
- `packages/db/src/schema/projects.ts`
- `packages/db/src/schema/index.ts`
- migration output

Implementation steps:

1. Add the operating context interfaces and packet types.
2. Add validators/parsers for nested arrays and enums.
3. Add `operatingContext` to project API types.
4. Add `operating_context` JSONB column to `projects`.
5. Extend DB row mapping to parse/serialize that field.

Proof:

- shared typecheck
- db typecheck
- migration generation succeeds
- parsing tests for empty/null/invalid payloads

## Slice 2: Projection service from accepted baseline

Goal:

- deterministically build operating context from accepted baseline

Files:

- `server/src/services/projects.ts`
- `server/src/services/repository-baseline.ts`
- `server/src/routes/projects.ts`
- new focused tests under `server/src/__tests__/`

Implementation steps:

1. Add `buildProjectOperatingContextFromBaseline(...)`.
2. Inputs:
   - baseline summary
   - baseline stack signals
   - accepted guidance
   - labels recommendation set
   - docs/repo files
   - verification commands
   - ownership areas
   - analyzer risks/gaps
3. Derive:
   - `overviewSummary`
   - `configurationDescriptionSuggestion`
   - `labelCatalog`
   - `canonicalDocs`
   - `verificationCommands`
   - `ownershipAreas`
   - `operatingGuidance`
   - `suggestedGoals`
   - `executiveProjectPacket`
   - `technicalProjectPacket`
4. Update `apply-recommendations` flow so it writes both:
   - `project.issueSystemGuidance`
   - `project.operatingContext`
5. Preserve baseline source artifact in workspace metadata unchanged.

Proof:

- projection tests for nominal baseline
- projection tests for sparse baseline
- route tests proving apply-recommendations updates project row
- regression test proving workspace baseline remains intact

## Slice 3: Suggested goals promotion path

Goal:

- allow accepted suggestions to become real goals without automatic creation

Files:

- `server/src/routes/projects.ts`
- `server/src/services/projects.ts`
- `packages/shared/src/types/project.ts`
- `packages/shared/src/validators/project.ts`

Implementation steps:

1. Add API action to accept/reject a suggested goal.
2. `accept` flow:
   - create real goal row
   - attach it to the project
   - set `suggestedGoals[i].status = "accepted"`
   - persist `acceptedGoalId`
3. `reject` flow:
   - mark suggestion as rejected
4. `accept and edit`:
   - UI sends edited title/description before persistence

Proof:

- route tests for accept/reject/edit
- duplicate acceptance prevention
- project payload reflects updated suggestion states

## 6. Frontend Execution Slices

## Slice 4: Project overview consumption

Goal:

- make project overview reflect promoted operating context

Files:

- `ui/src/pages/ProjectDetail.tsx`
- any extracted summary cards/components if needed
- related tests

Implementation steps:

1. Prefer `project.operatingContext.overviewSummary`.
2. Fall back to `project.description`.
3. Add cards/sections for:
   - stack signals
   - canonical docs
   - top gaps/risks
   - baseline tracking issue
   - accepted baseline timestamp
4. Keep overview read-oriented.

Proof:

- render test for overview with operating context
- fallback test with no operating context
- browser proof on a real project with accepted baseline

## Slice 5: Configuration consumption

Goal:

- turn configuration into the curation surface for promoted context

Files:

- `ui/src/components/ProjectProperties.tsx`
- supporting subcomponents if extraction becomes necessary
- project API client helpers

Implementation steps:

1. Add description suggestion controls:
   - `Use baseline suggestion`
   - `Reset to baseline suggestion`
   - `Keep manual override`
2. Show read/curated sections for:
   - label catalog
   - canonical docs
   - verification commands
   - ownership areas
   - operating guidance
   - suggested goals
3. Visually distinguish:
   - baseline-promoted values
   - manual overrides

Proof:

- interaction tests for description source switching
- render tests for suggested goals and label catalog
- browser proof in project configuration

## Slice 6: Suggested goals UI

Goal:

- surface suggestion lifecycle clearly

Files:

- `ui/src/components/ProjectProperties.tsx`
- `ui/src/components/NewGoalDialog.tsx`
- optionally extracted goal suggestion panel component

Implementation steps:

1. Render pending suggestions.
2. Support:
   - accept as-is
   - accept and edit
   - reject
3. After accept:
   - refresh project goals state
   - show linkage to created goal

Proof:

- UI tests for accept/reject flows
- browser proof for one accepted suggestion

## 7. Issue Flow Execution Slices

## Slice 7: Issue creation consumption

Goal:

- make new issue creation baseline-aware without becoming noisy

Files:

- `ui/src/components/NewIssueDialog.tsx`
- `server/src/routes/issues.ts`
- shared issue context types if needed

Implementation steps:

1. Extend issue-context payload composition to include operating-context subsets.
2. In new issue dialog, display:
   - label suggestions with descriptions
   - canonical docs
   - verification commands
   - ownership hints
3. Keep these as guidance, not auto-filled hard decisions.

Proof:

- backend route tests for payload shape
- dialog rendering tests
- browser proof that new issue creation sees project context

## Slice 8: Issue detail consumption

Goal:

- make issue detail show project context more clearly

Files:

- `ui/src/pages/IssueDetail.tsx`
- `server/src/services/heartbeat.ts`
- `server/src/routes/issues.ts`

Implementation steps:

1. Add a `Project context` section to issue detail.
2. Show:
   - project docs
   - verification commands
   - issue/review guidance
   - ownership hints
3. Ensure heartbeat/runtime issue context composition remains aligned with route payloads.

Proof:

- issue detail rendering tests
- heartbeat context tests
- browser proof on a normal issue

## 8. Agent Bootstrap Slices

These slices happen only after slices 1 through 8 are complete.

## Slice 9: Bootstrap packet assembly

Goal:

- make agent/runtime consumers read derived packets from project operating context

Files:

- `server/src/services/projects.ts`
- agent creation services/routes
- onboarding route/service layers

Implementation steps:

1. Add helpers:
   - `buildExecutiveProjectPacket(project)`
   - `buildTechnicalProjectPacket(project)`
2. Ensure packets are derived from operating context, not separately authored.
3. Expose packets only where needed for bootstrap and comments.

Proof:

- unit tests for packet derivation
- route/service tests proving packets match project context

## Slice 10: CEO and CTO workflow upgrades

Goal:

- improve first-project framing and first technical hiring quality

Files likely touched:

- `server/src/onboarding-assets/ceo/AGENTS.md`
- `server/src/onboarding-assets/ceo/HEARTBEAT.md`
- agent creation UI/services
- issue comment/kickoff helpers

Implementation steps:

1. Update CEO bootstrap behavior to read `ExecutiveProjectPacket` for repo-first projects.
2. Keep CEO strategic and delegation-first.
3. Update technical-agent creation flow to supply `TechnicalProjectPacket`.
4. Optionally add a CEO kickoff comment generator for baseline issue completion.

Proof:

- onboarding asset snapshot tests where practical
- service tests for packet injection
- browser proof through real project baseline issue flow

## 9. API Changes

Expected API additions or mutations:

- project payloads include `operatingContext`
- `apply-recommendations` persists `operatingContext`
- project configuration endpoints allow explicit description-source actions
- project goal suggestion endpoints:
  - accept
  - reject
  - accept-and-edit

Do not create a broad new “baseline automation” endpoint. Keep actions explicit and bounded.

## 10. Verification Matrix

## 10.1 Static proof

- `pnpm --filter @paperclipai/shared typecheck`
- `pnpm --filter @paperclipai/server typecheck`
- `pnpm --filter @paperclipai/ui typecheck`

## 10.2 Backend proof

- projection service tests
- route tests for apply-recommendations
- route tests for goal acceptance/rejection
- heartbeat/issue-context tests

## 10.3 Frontend proof

- overview rendering tests
- configuration interaction tests
- suggested goals tests
- issue dialog/detail rendering tests

## 10.4 Browser truth

Using this repo clone on port `3101` with isolated `PAPERCLIP_HOME`:

1. refresh repository baseline
2. run AI enrichment
3. apply recommendations
4. verify overview
5. verify configuration
6. accept one suggested goal
7. open new issue and inspect issue detail context

## 11. Commit and PR Breakdown

Recommended execution grouping:

1. `project operating context contract + db schema`
2. `baseline projection into project operating context`
3. `overview + configuration consumption`
4. `suggested goals acceptance flow`
5. `issue creation/detail consumption`
6. `bootstrap packet derivation`
7. `CEO/CTO workflow upgrades`

This yields bounded reviewable slices while preserving the required dependency order.

## 12. Risk Controls

- Do not let `operatingContext` become a dumping ground for raw analyzer output.
- Do not let agent markdown files become duplicate stores of project facts.
- Do not automatically convert suggestions into work.
- Do not overload issue creation with too much context at once.
- Keep project truth, workspace evidence, and runtime packets as separate layers.

## 13. Definition of Ready for Implementation

Execution can start when all of these are true:

- `project.operatingContext` contract is accepted
- JSONB-on-project storage direction is accepted
- suggested goals remain opt-in
- CEO remains non-implementing
- CTO and future technical hires are explicitly packet-driven, not hard-coded

Once accepted, implementation should begin at Slice 1 and remain sequential.

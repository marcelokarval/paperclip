# 2026-04-23 Project Operating Context From Repository Baseline

Status: Proposed for execution
Date: 2026-04-23
Audience: Product, backend, frontend, project/workspace runtime, issue UX, operator workflow
Parent context:

- `doc/plans/2026-04-20-repository-documentation-baseline.md`
- `doc/plans/2026-04-23-project-intake-and-staffing-prd.md`
- `doc/plans/2026-04-23-project-intake-and-staffing-executive-plan.md`
- `server/src/services/repository-baseline.ts`
- `server/src/routes/projects.ts`
- `server/src/routes/issues.ts`
- `server/src/services/heartbeat.ts`
- `server/src/services/projects.ts`
- `packages/shared/src/types/project.ts`
- `packages/shared/src/validators/project.ts`
- `ui/src/pages/ProjectDetail.tsx`
- `ui/src/components/ProjectProperties.tsx`
- `ui/src/components/RepositoryBaselinePanel.tsx`
- `ui/src/components/NewIssueDialog.tsx`
- `ui/src/pages/IssueDetail.tsx`

## 1. Executive Decision

Repository baseline is no longer just a read-only documentation artifact. Once the operator accepts baseline recommendations, Paperclip should promote the accepted result into a first-class project operating context.

This operating context becomes the canonical project-layer source for:

- `Overview`
- project `Description` suggestion in `Configuration`
- suggested `Goals`
- issue and review `Guidance`
- canonical docs
- verification commands
- label catalog
- ownership areas

Execution order must remain:

1. first transform accepted baseline into project operational configuration
2. then make issue creation/detail consume that configuration
3. then add explicit project intake and staffing workflow on top of that accepted context
4. only then add smarter CEO/CTO/operator automations

This preserves determinism for existing repositories and avoids turning baseline intake into hidden backlog generation.

The dedicated staffing layer is specified separately in:

- `doc/plans/2026-04-23-project-intake-and-staffing-prd.md`
- `doc/plans/2026-04-23-project-intake-and-staffing-executive-plan.md`

## 2. Product Boundary

### 2.1 What this change is

This change turns accepted repository baseline knowledge into reusable, persisted project configuration and issue context.

It answers:

- What should the project `Overview` show for an existing repository?
- What initial project description should be suggested from the connected codebase?
- What goals should Paperclip propose without auto-creating work?
- What rules should issues and agents follow for labels, docs, verification, review, and approvals?
- How should CEO/operator workflows inherit project understanding without rediscovering it every time?

### 2.2 What this change is not

Hard non-goals for this slice:

- no automatic backlog decomposition
- no automatic issue splitting
- no automatic goal creation
- no automatic CTO creation
- no automatic team hiring
- no automatic agent wakeup from baseline acceptance alone
- no repo writes
- no PR creation

Baseline-derived suggestions remain suggestions until explicitly accepted or promoted by the operator.

## 3. Current State

### 3.1 Where repository baseline already exists

`server/src/routes/projects.ts` already:

- refreshes repository baseline into workspace metadata
- stores `acceptedGuidance`
- stores `recommendationDecisions`
- optionally creates/syncs one tracking issue
- applies accepted issue guidance into `project.issueSystemGuidance`

`server/src/services/repository-baseline.ts` already:

- builds deterministic baseline
- optionally runs analyzer enrichment
- merges analyzer output into:
  - `summary`
  - `stack`
  - `gaps`
  - `recommendations.labels`
  - `recommendations.projectDefaults`
  - `recommendations.issuePolicy`

### 3.2 Where the accepted baseline is already consumed

`server/src/routes/issues.ts` and `server/src/services/heartbeat.ts` already compose project issue context from:

- project labels
- repository baseline accepted guidance
- project issue system guidance

The resulting context already includes:

- label usage guidance
- parent/sub-issue guidance
- blocking guidance
- review guidance
- approval guidance
- canonical docs
- suggested verification commands

### 3.3 What is still weak or fragmented

Project-level surfaces remain underpowered:

- `Overview` in `ui/src/pages/ProjectDetail.tsx` uses only:
  - `project.description`
  - `project.status`
  - `project.targetDate`
- `Configuration` in `ui/src/components/ProjectProperties.tsx` treats description as a standalone freeform field
- `Goals` are independent and baseline does not propose structured goals
- `Guidance` is strong only for issue-system usage, not broader project operation

This creates three fragmented truths:

- `project.description`
- `workspace.metadata.repositoryDocumentationBaseline`
- `project.issueSystemGuidance`

The plan below unifies those into a project operating context.

## 3.4 External Reference Inputs

Two external systems materially improve this plan's direction:

- `vinilana/dotcontext`
- `garrytan/gstack`

These are not donor implementations to transplant wholesale. They are reference systems for runtime context, workflow chaining, and agent bootstrap quality.

### What Paperclip should absorb from `dotcontext`

Useful principles:

- a repository scan should produce a durable context artifact, not just transient UI output
- workflow state should have explicit artifacts, checkpoints, and traces
- one canonical source should be exportable to different AI runtimes/tools
- baseline/readiness stages should be explicit and inspectable

What Paperclip should *not* absorb directly:

- `.context/` as the primary control plane for project truth
- PREVC as a replacement for Paperclip's own governance and issue workflow
- local-file-only runtime ownership for shared organizational context

Paperclip implication:

- accepted baseline should become a promoted artifact pack attached to the project
- issue/workspace runs should later be able to attach traces, checkpoints, and replay-oriented artifacts to Paperclip-native entities instead of ad hoc local files

### What Paperclip should absorb from `gstack`

Useful principles:

- agents perform much better when workflow, role, and state are explicit
- a role like CEO should have a distinct framing workflow before hiring or delegating
- planning, review, QA, and release should pass structured packets between phases
- role-specialized instruction bundles are more effective than generic personas

What Paperclip should *not* absorb directly:

- giant prompt preambles as the primary operating substrate
- host-specific markdown injection as the main governance mechanism
- storing critical operating truth only in user-home directories
- conflating stylistic persona with operational policy

Paperclip implication:

- improve initial CEO and future CTO creation by passing structured project packets derived from accepted baseline
- keep the source of truth in Paperclip-native project/issue/workspace state, with markdown prompts consuming that state rather than replacing it

## 4. User Stories

### Story 1: Project overview should reflect the connected codebase

As an operator, when I open a project's `Overview`, I want to see a meaningful summary of the repository, stack, docs, and gaps instead of a mostly empty description field.

Acceptance criteria:

- `Overview` can render a baseline-derived summary
- stack signals are visible
- canonical docs are visible
- top gaps/risks are visible
- baseline tracking issue is linked when present
- the view stays read-oriented and does not create work

### Story 2: Configuration description should be baseline-aware

As an operator, I want the project's description to start from a baseline suggestion while still allowing a manual override, so the project does not begin with an empty or generic description.

Acceptance criteria:

- baseline can suggest a configuration description
- the operator can accept it
- the operator can override it manually
- the system tracks whether description is baseline-derived or manually overridden

### Story 3: Baseline should suggest goals without creating them automatically

As an operator, I want Paperclip to suggest a small set of project goals derived from the repository baseline, but I do not want Paperclip to silently create goals or backlog work.

Acceptance criteria:

- baseline may contain `suggestedGoals`
- goals are shown as suggestions
- each suggested goal can be accepted, edited, or rejected
- no goal record is created until the operator explicitly accepts it

### Story 4: Guidance should go beyond issue-only rules

As an operator, I want a project-level operating guidance layer so that issues, agents, and the operator all share the same docs, verification defaults, label semantics, and ownership hints.

Acceptance criteria:

- project stores richer accepted operating guidance
- issue flows read the issue-specific subset
- operator/project surfaces can read the broader subset
- accepted baseline guidance is visibly distinct from raw analyzer output

## 5. Data Model Direction

## 5.1 Keep `project.issueSystemGuidance`

Do not remove or rename `project.issueSystemGuidance`.

It is already wired into:

- issue route context building
- heartbeat run context
- project configuration UI

It remains the project-level issue-facing contract.

## 5.2 Add a project operating context

Introduce a new persisted project field, recommended as:

- `project.operatingContext`

This can initially live as a JSONB column on `projects`, or as a JSON object attached to existing project metadata if there is already a standard place. Preferred direction is a dedicated JSONB project field because this is project truth, not workspace truth.

Recommended shape:

```ts
interface ProjectOperatingContext {
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
  }>;
}
```

Notes:

- `issueSystemGuidance` stays narrow and issue-oriented.
- `operatingContext` becomes the broader accepted project context.
- `suggestedGoals` live here until explicitly promoted to actual `goals`.

## 5.3 Keep workspace baseline as the source document

Do not move or delete `workspace.metadata.repositoryDocumentationBaseline`.

That remains the baseline source artifact attached to the primary workspace.

The new project operating context is a promoted, accepted projection derived from that workspace baseline.

Relationship:

- workspace baseline = evidence + scan result + analyzer result
- project operating context = accepted, operationalized projection

## 5.4 Baseline artifact pack and agent bootstrap packets

The operating context should not be the only promoted output.

Paperclip should conceptually treat accepted baseline as a project-level artifact pack with at least these logical packets:

- `ProjectOperatingContext`
- `ExecutiveProjectPacket`
- `TechnicalProjectPacket`

Recommended direction:

```ts
interface ExecutiveProjectPacket {
  projectSummary: string;
  baselineTrackingIssueIdentifier: string | null;
  topRisks: string[];
  topGaps: string[];
  stackSummary: string[];
  docsToReadFirst: string[];
  operatingGuidance: string[];
  hiringSignals: Array<"cto" | "ux" | "marketing" | "ops">;
}

interface TechnicalProjectPacket {
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

Initial use:

- `ExecutiveProjectPacket` improves the first CEO framing loop for an existing repository
- `TechnicalProjectPacket` improves CTO creation and future technical hires

Important boundary:

- these packets are derived from the project operating context
- they are not independent sources of truth
- markdown agent assets should consume them rather than duplicating them

## 6. UX Direction

## 6.1 Overview

Current file:

- `ui/src/pages/ProjectDetail.tsx`

Recommended change:

- `Overview` should prefer `project.operatingContext.overviewSummary`
- if missing, fall back to `project.description`
- show additional baseline-aware cards:
  - stack signals
  - canonical docs
  - top gaps/risks
  - baseline tracking issue
  - last accepted baseline time

`Overview` stops being only a description renderer and becomes the operator's high-level read model for an existing repository.

## 6.2 Configuration

Current file:

- `ui/src/components/ProjectProperties.tsx`

Recommended change:

- keep manual description editing
- add a baseline-suggested description lane
- support actions:
  - `Use baseline suggestion`
  - `Reset to baseline suggestion`
  - `Keep manual override`
- display operating-context sections:
  - label catalog
  - canonical docs
  - verification commands
  - ownership areas
  - operating guidance

Configuration becomes the place where accepted baseline context is curated, not just where freeform fields are typed.

## 6.3 Goals

Current files:

- `ui/src/components/ProjectProperties.tsx`
- `ui/src/components/NewGoalDialog.tsx`
- `ui/src/pages/Goals.tsx`

Recommended change:

- show a `Suggested goals` section inside project configuration or project overview
- each suggestion supports:
  - accept as goal
  - accept and edit
  - reject
- accepting a suggestion creates a real goal and records the decision in project operating context or baseline recommendation decisions

Important boundary:

- suggestions are project-shaping goals, not task decomposition
- no baseline flow should generate a backlog tree

## 6.4 Guidance

Current file:

- `ui/src/components/ProjectProperties.tsx`

Recommended change:

- keep `ProjectIssueSystemGuidanceEditor`
- add a separate read/write display for project operating guidance
- allow baseline-promoted defaults to be applied explicitly
- visually distinguish:
  - baseline accepted guidance
  - manual operator edits

This avoids losing the current issue guidance UX while expanding guidance to project operation as a whole.

## 6.5 Baseline workflow visibility

The operator should be able to distinguish these states clearly:

- baseline scanned
- analyzer enriched
- baseline accepted
- operating context promoted
- recommendations applied

Recommended UI direction:

- keep repository baseline as the read-only evidence/source surface
- expose project operating context as the promoted and curated project truth
- later surface trace/checkpoint metadata for issue/workspace execution without mixing it into the baseline panel itself

## 7. Sequential Implementation Plan

This section is the required execution order.

### Phase 1: Transform accepted baseline into project operational configuration

Goal:

- promote accepted baseline into `project.operatingContext`

Backend:

- add shared type + validator for `ProjectOperatingContext`
- add project schema storage
- add service parsing/serialization in `server/src/services/projects.ts`
- in `POST /repository-baseline/apply-recommendations`, build/update `project.operatingContext`

Inputs:

- `baseline.summary`
- `baseline.recommendations.labels`
- `baseline.acceptedGuidance`
- `baseline.analysis`
- `baseline.gaps`
- `baseline.documentationFiles`

Outputs:

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
- linkage metadata for accepted baseline

Files expected:

- `packages/shared/src/types/project.ts`
- `packages/shared/src/validators/project.ts`
- `packages/shared/src/types/index.ts`
- `packages/shared/src/index.ts`
- `packages/db/src/schema/projects.ts`
- migration if using dedicated JSONB column
- `server/src/services/projects.ts`
- `server/src/routes/projects.ts`
- tests for projection from baseline to operating context

Additional architectural rule:

- the promoted operating context is the canonical structured source for future CEO/CTO bootstrap packets
- do not hard-code equivalent context back into agent markdown files

### Phase 2: Make project surfaces consume the operating context

Goal:

- use the new project operating context in `Overview` and `Configuration`

Frontend:

- `ui/src/pages/ProjectDetail.tsx`
  - render `overviewSummary`
  - render stack/docs/gaps cards
- `ui/src/components/ProjectProperties.tsx`
  - description suggestion + override controls
  - label catalog display
  - canonical docs display
  - verification commands display
  - ownership areas display
  - operating guidance display
  - suggested goals actions

Backend/API:

- ensure `projectsApi.get/list` include `operatingContext`

Files expected:

- `ui/src/pages/ProjectDetail.tsx`
- `ui/src/components/ProjectProperties.tsx`
- `ui/src/api/projects.ts`
- tests for overview/configuration rendering and save flows

### Phase 3: Make issue creation/detail read the project context

Goal:

- baseline-derived project configuration should improve normal issue flows

Backend:

- extend issue project context composition in:
  - `server/src/routes/issues.ts`
  - `server/src/services/heartbeat.ts`
- include operating-context-aware fields where useful

Frontend:

- `ui/src/components/NewIssueDialog.tsx`
  - show label suggestions and descriptions from project catalog
  - show canonical docs and verification commands
  - show ownership hints when available
- `ui/src/pages/IssueDetail.tsx`
  - add project context section
  - surface docs/commands/guidance more clearly

Files expected:

- `server/src/routes/issues.ts`
- `server/src/services/heartbeat.ts`
- `ui/src/components/NewIssueDialog.tsx`
- `ui/src/pages/IssueDetail.tsx`
- supporting shared types/tests

### Phase 4: Only then add smarter CEO/CTO/operator automations

Goal:

- use accepted project context as stable input for human/agent workflows

Recommended first automations:

- CEO baseline completion comment references accepted project context
- operator can generate a kickoff summary from project context
- initial CEO bootstrap reads `ExecutiveProjectPacket` when the project is a repository-first import/adoption case
- CTO creation inherits `TechnicalProjectPacket`
- future specialist creation can inherit filtered packets based on role

Recommended agent bootstrap rule:

- CEO remains strategic and delegation-first
- CEO is *not* turned into an implementer
- CEO gains better project framing and hiring context
- CTO and future technical agents gain deeper technical packets

Recommended later files:

- `server/src/onboarding-assets/ceo/AGENTS.md`
- `server/src/onboarding-assets/ceo/HEARTBEAT.md`
- agent creation services/routes/UI that assemble role-specific bootstrap context
- issue comment/kickoff generators that consume project packets

Non-goals still remain:

- no automatic backlog decomposition
- no automatic multiple issues
- no automatic team creation

Files likely touched later:

- issue workflow UI
- issue comment generation helpers
- onboarding/agent creation surfaces

## 8. Suggested Goal Generation Rules

Suggested goals should be generated conservatively from accepted baseline, not from speculative planner behavior.

Recommended heuristic inputs:

- analyzer risks
- major stack boundaries
- missing docs/gaps
- ownership areas
- canonical docs presence/absence
- repo shape and runtime signals

Good examples:

- "Establish project operating conventions for Next.js + backend workspace integration"
- "Stabilize verification workflow for repo-local development and issue execution"
- "Document canonical engineering entrypoints and ownership areas"
- "Align label taxonomy and ownership areas with the actual repository structure"

Bad examples:

- "Implement feature X"
- "Fix API Y"
- "Create CTO"
- "Split frontend into subissues"

The first generation of suggested goals should stay infrastructural and documentary, not feature-delivery oriented.

## 9. Guidance Expansion Rules

Issue guidance already covers:

- labels
- parent/sub-issues
- blocking
- review
- approval
- canonical docs
- verification commands

Operating guidance should add:

- project operating expectations
- default repository reading order
- preferred issue hygiene for existing repos
- operator-level decision rules
- team/agent context inheritance rules

Examples:

- "For repo-first projects, review baseline tracking issue before creating implementation issues."
- "Use both domain labels and layer labels when scope spans product and infrastructure."
- "Prefer one bounded issue over speculative child decomposition until ownership areas are stable."
- "When hiring the first technical agent for an existing repository, pass canonical docs, verification commands, ownership areas, and label semantics from the accepted project context."
- "Do not encode project-specific repository facts directly in generic agent persona markdown when the same facts can be supplied by runtime project packets."

## 10. Future runtime artifact direction

This plan does not yet implement issue/workspace traces, checkpoints, or replay, but it should reserve the architectural direction now.

Inspired by `dotcontext` and `gstack`, the future Paperclip-native direction should be:

- baseline/source artifact on workspace
- promoted operating context on project
- execution packets derived per issue/agent/run
- optional traces/checkpoints/artifacts attached to Paperclip entities

This preserves a clean separation:

- source evidence
- accepted operating truth
- execution-time runtime state

Do not collapse these three layers into one markdown file or one prompt preamble.

## 11. Verification Plan

Backend verification:

- projection tests from accepted baseline into project operating context
- route tests for apply-recommendations updating both `issueSystemGuidance` and `operatingContext`
- serialization/parsing tests in services

Frontend verification:

- overview renders baseline-derived summary and cards
- configuration description fallback/override behavior
- suggested goals acceptance/rejection UI
- issue dialog and issue detail context rendering

Manual/browser proof:

- create/update baseline on real project workspace
- apply recommendations
- verify `Overview` updates
- verify `Configuration` displays promoted context
- accept one suggested goal
- verify issue creation sees project context

## 12. Risks

- If `project.description` and `configurationDescriptionSuggestion` are not clearly separated, the UI will feel ambiguous.
- If operating context and baseline are merged too aggressively, operators may lose track of what was scanned versus what was accepted.
- If suggested goals are too eager, the system will look like it is reintroducing backlog decomposition through another door.
- If issue creation consumes too much context at once, the dialog may become noisy.
- If CEO/CTO bootstrap improvements are implemented before operating context is stable, agent quality may improve superficially while drift increases underneath.
- If execution packets duplicate project truth instead of deriving from it, future updates will drift across backend, UI, and prompt assets.

## 13. Recommended Execution Slicing

Use four bounded PRs/slices:

1. project operating context contract + backend projection
2. overview/configuration consumption
3. suggested goals acceptance flow
4. issue creation/detail consumption

Only after those four slices should CEO/CTO/operator automations be proposed for landing.

Then use two follow-up slices:

5. executive and technical bootstrap packets
6. CEO/CTO/operator workflow upgrades driven by those packets

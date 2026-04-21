# 2026-04-20 Repository Documentation Baseline PRD / Pre-SDD

Status: Partially implemented
Date: 2026-04-20
Audience: Product, backend, frontend, onboarding, project/workspace runtime
Requested scope: Product plan and pre-SDD first; implementation is proceeding in bounded, non-agentic slices.

Related context:

- `doc/plans/2026-04-19-configurable-issue-prefixes-prd-pre-sdd.md`
- `doc/plans/2026-04-19-configurable-issue-prefixes-executive-plan.md`
- `packages/shared/src/validators/project.ts`
- `packages/db/src/schema/projects.ts`
- `packages/db/src/schema/project_workspaces.ts`
- `packages/db/src/schema/issues.ts`
- `server/src/routes/projects.ts`
- `server/src/services/projects.ts`
- `server/src/services/issues.ts`
- `ui/src/api/projects.ts`
- `ui/src/pages/Projects.tsx`
- `ui/src/pages/ProjectDetail.tsx`
- `ui/src/components/OnboardingWizard.tsx`

## 1. Executive Summary

Paperclip setup should stay cold and predictable: create the company, create the CEO agent, and do not create an initial issue or wake the agent unless the operator explicitly asks for that behavior.

The next useful post-setup flow is not "create the first task". It is "connect the codebase" and optionally produce a controlled repository documentation baseline. This gives Paperclip project context without turning repository discovery into backlog generation.

Recommended product direction:

- Keep initial onboarding focused on company identity, issue prefix, and CEO agent creation.
- Add a post-setup Project Intake flow under the existing project/workspace surface.
- Support four project source states: local folder only, GitHub repository only, both local and GitHub, or no repository yet.
- Persist the result as `projects` plus `project_workspaces`, using the existing schema where possible.
- Add an optional Repository Documentation Baseline action that creates documentation inside Paperclip, not code changes inside the target repo.
- If the operator wants an issue, create at most one tracking issue for the baseline run.
- Do not split repository findings into issues, subtasks, backlog items, assignments, or implementation work by default.

Implementation status:

- Project Intake source selection has landed in the project creation modal.
- Repository Documentation Baseline now has a manual persistence surface on the project workspace detail page.
- The baseline is stored inside `project_workspaces.metadata.repositoryDocumentationBaseline`.
- A read-only baseline refresh action has landed on the project workspace detail page.
- `POST /api/projects/:id/workspaces/:workspaceId/repository-baseline` scans only allowlisted docs and stack files, then stores the result in Paperclip-owned workspace metadata.
- `GET /api/projects/:id/workspaces/:workspaceId/repository-baseline` reads the stored Paperclip-owned baseline without mutating workspace state.
- The baseline metadata contract now lives in `packages/shared`, and the workspace detail page renders it through a dedicated `RepositoryBaselinePanel` component.
- No runner, issue creation, child issue creation, repo write, GitHub/Linear import, PR creation, or agent wakeup has been implemented.

## 2. Product Boundary

### 2.1 What this feature is

Repository Documentation Baseline is a read-oriented project intake and documentation binding flow.

It answers:

- What repository or local folder is this Paperclip project connected to?
- What stack, package managers, test commands, agent instruction files, and project docs are already present?
- Which existing docs should Paperclip treat as important context?
- What is the safest default workspace binding for future agent runs?
- What documentation gaps should a human know about before delegating real work?

### 2.2 What this feature is not

This feature is not backlog decomposition.

Hard non-goals:

- No automatic issue splitting.
- No automatic child issues.
- No automatic backlog creation.
- No task estimation.
- No task assignment.
- No first implementation task.
- No automatic agent wakeup.
- No repository writes.
- No `AGENTS.md`, `CLAUDE.md`, `README.md`, or config commits to the target repository.
- No GitHub issue import.
- No Linear issue import.
- No PR creation.

The baseline can recommend follow-up topics as documentation gaps, but those recommendations must remain documentation findings until the operator explicitly converts them into tracked work in a separate action.

## 3. Current State

### 3.1 Initial onboarding

`ui/src/components/OnboardingWizard.tsx` now supports a cold-start path where setup can finish with a CEO agent and no starter task. The starter task path still exists as an explicit checkbox-controlled choice.

This is the right default. Repository intake should not be hidden inside the company setup wizard unless the operator explicitly chooses a guided path after the company exists.

### 3.2 Project and workspace model

`packages/db/src/schema/projects.ts` already stores project identity, status, color, env, and execution workspace policy.

`packages/db/src/schema/project_workspaces.ts` already stores the codebase binding:

- `sourceType`
- `cwd`
- `repoUrl`
- `repoRef`
- `defaultRef`
- `metadata`
- `isPrimary`

`packages/shared/src/validators/project.ts` already supports:

- `sourceType: local_path | git_repo | remote_managed | non_git_path`
- `cwd`
- `repoUrl`
- `repoRef`
- `defaultRef`
- `metadata`
- `runtimeConfig`
- nested workspace creation inside project creation

This is enough to represent the first version of Project Intake without a schema migration.

### 3.3 Project API

`server/src/routes/projects.ts` already exposes:

- `GET /api/companies/:companyId/projects`
- `POST /api/companies/:companyId/projects`
- `GET /api/projects/:id`
- `PATCH /api/projects/:id`
- `GET /api/projects/:id/workspaces`
- `POST /api/projects/:id/workspaces`
- `PATCH /api/projects/:id/workspaces/:workspaceId`
- runtime command/service control endpoints for local workspace operations

`server/src/services/projects.ts` already derives codebase metadata from primary workspace:

- `codebase.repoUrl`
- `codebase.repoName`
- `codebase.localFolder`
- `codebase.managedFolder`
- `codebase.effectiveLocalFolder`
- `codebase.origin`

The plan should extend this surface rather than invent a separate "repository" table too early.

### 3.4 Project UI

`ui/src/pages/Projects.tsx` is currently a simple project list with `Add Project`.

`ui/src/pages/ProjectDetail.tsx` already has tabs for:

- Overview
- Issues
- Workspaces
- Configuration
- Budget

The natural home for the new flow is either:

- Project list empty state: "Connect a codebase"
- Project creation modal: source-aware project intake
- Project detail Workspaces tab: add or update repository/local workspace binding
- Project detail Configuration tab: project-level documentation baseline settings

## 4. User Stories

### Story 1: Connect a local project

As a local Paperclip operator, I want to connect an existing local folder to a project so that future agent runs and documentation analysis use the code I already have on disk.

Acceptance criteria:

- UI accepts a local folder path.
- Backend persists it as a `project_workspaces` row with `sourceType: "local_path"`.
- The workspace can be marked primary.
- Paperclip displays the effective local folder on the project page.
- No commands run during save.
- No issue is created during save.

### Story 2: Connect a GitHub-only repository

As an operator with a repository on GitHub but no local checkout configured, I want to connect the repo URL so Paperclip can record the project identity and prepare for future managed checkout or adapter-managed execution.

Acceptance criteria:

- UI accepts an HTTPS GitHub repository URL.
- Backend persists it as `repoUrl` with `sourceType: "git_repo"`.
- `cwd` can remain null for repo-only binding.
- Project codebase summary shows managed folder as the future local target.
- No clone happens during save in the first implementation.
- No issue is created during save.

### Story 3: Connect both local folder and GitHub repository

As an operator with a local clone and a GitHub remote, I want to bind both so Paperclip knows the local execution path and the remote source of truth.

Acceptance criteria:

- UI accepts both `cwd` and `repoUrl`.
- Backend persists both values in the same primary workspace.
- Source is treated as local-executable plus remote-linked.
- Documentation baseline records both local and remote facts.
- Future agent runs can use the local folder without needing a clone.

### Story 4: Run a repository documentation baseline

As an operator, I want Paperclip to analyze the connected repository and produce documentation context so I can decide what to delegate later.

Acceptance criteria:

- The baseline is read-only.
- The baseline scans only bounded metadata and documentation files.
- The baseline output is stored inside Paperclip as a project/documentation artifact.
- The baseline does not create implementation issues.
- The baseline does not create child issues.
- The baseline does not modify the repository.
- The baseline can optionally be attached to a single tracking issue if the operator explicitly asks for an issue trail.

### Story 5: Create one explicit tracking issue only when requested

As an operator, I may want one issue to track the baseline run, but I do not want Paperclip to decompose my repository into a backlog automatically.

Acceptance criteria:

- The default is no issue.
- Optional issue mode creates exactly one issue, for example `P4Y-1 Repository documentation baseline`.
- The issue body states that this is not backlog decomposition.
- The issue body instructs the agent not to create child issues, not to write repo files, and not to assign implementation work.
- Agent wakeup remains off by default unless the operator explicitly requests a live baseline run.

## 5. Proposed UX Shape

### 5.1 Initial setup remains cold

Keep the current setup direction:

- Company step: company name and issue prefix.
- Agent step: CEO agent and adapter configuration.
- Task step: cold start by default.
- Launch step: finish without issue unless the starter-task checkbox is enabled.

Do not add repository intake as a required setup step.

### 5.2 Post-setup entry points

Add obvious next actions after setup:

- On empty Projects page: "Connect your first codebase".
- On project list: "Add Project" can open the same source-aware flow.
- On project detail Workspaces tab: "Add workspace" or "Edit primary workspace".
- On project detail Configuration tab: "Repository documentation baseline".

### 5.3 Project Intake flow

Proposed steps:

1. Choose source.
2. Enter local folder, GitHub URL, or both.
3. Name the project and primary workspace.
4. Review read-only summary.
5. Save project/workspace.
6. Optionally run documentation baseline.

Source options:

- Local folder only.
- GitHub repository only.
- Local folder plus GitHub repository.
- Skip codebase for now.

### 5.4 Repository Documentation Baseline flow

Proposed options:

- Output: Paperclip project document only.
- Optional tracking issue: off by default.
- Agent wakeup: off by default.
- Scan intensity: metadata/docs only in V1.

Baseline scope should be explicit in UI copy:

> This analyzes repository structure and documentation for Paperclip context. It does not create backlog issues, child issues, PRs, or repository changes.

## 6. Baseline Output Contract

The baseline should create a Paperclip-owned documentation artifact with these sections:

- Project summary.
- Repository binding.
- Stack detection.
- Package manager and command hints.
- Agent instruction files found.
- Existing documentation map.
- Workspace/runtime hints.
- Documentation gaps.
- Recommended next human decisions.

Allowed outputs:

- Project Baseline.
- Agent Documentation Map.
- Workspace Binding.
- Runtime Hints.
- Paperclip Context Document.
- Documentation Gaps.

Blocked outputs by default:

- Backlog.
- Subissues.
- Assigned tasks.
- Implementation plan for agent execution.
- Repository file patches.
- GitHub/Linear issue import.

## 7. Pre-SDD Architecture

### 7.1 Use existing project/workspace tables first

No database migration is required for the first implementation if metadata is stored carefully.

Recommended V1 storage:

- `projects.description`: human-facing project summary.
- `project_workspaces.cwd`: local folder path when available.
- `project_workspaces.repo_url`: GitHub URL when available.
- `project_workspaces.repo_ref`: selected branch/ref when known.
- `project_workspaces.default_ref`: default branch when known.
- `project_workspaces.metadata.repositoryDocumentationBaseline`: baseline metadata, detected docs, guardrails, stack hints, and gaps.

Do not add a new table until there is a clear lifecycle need for multiple historical baseline runs.

### 7.2 Add a bounded service for read-only inspection

Potential new backend module:

- `server/src/services/repository-baseline.ts`

Responsibilities:

- Normalize local and repo-only input.
- Inspect bounded local files when `cwd` exists.
- Detect documentation and agent instruction files.
- Detect package manager and likely commands.
- Produce a structured baseline result.
- Never execute arbitrary project commands.
- Never write into the target repository.

Suggested guard type:

```ts
type RepositoryDocumentationBaselinePolicy = {
  mode: "documentation_baseline";
  allowRepositoryWrites: false;
  allowIssueCreation: "none" | "single_tracking_issue";
  allowChildIssues: false;
  allowBacklogGeneration: false;
  allowAgentWakeup: boolean;
};
```

### 7.3 Add shared contracts

Potential shared files:

- `packages/shared/src/validators/repository-baseline.ts`
- `packages/shared/src/types/repository-baseline.ts`

Key request shape:

```ts
type CreateRepositoryBaselineInput = {
  projectId: string;
  projectWorkspaceId: string;
  createTrackingIssue?: boolean;
  wakeAgent?: boolean;
};
```

Key result shape:

```ts
type RepositoryDocumentationBaseline = {
  projectId: string;
  projectWorkspaceId: string;
  generatedAt: string;
  repository: {
    cwd: string | null;
    repoUrl: string | null;
    repoRef: string | null;
    defaultRef: string | null;
  };
  stack: {
    languages: string[];
    packageManagers: string[];
    frameworks: string[];
    testCommands: string[];
    buildCommands: string[];
  };
  docs: {
    path: string;
    kind: "readme" | "agent_instructions" | "product" | "architecture" | "development" | "other";
    summary: string | null;
  }[];
  gaps: string[];
  constraints: {
    repositoryWritesAllowed: false;
    backlogGenerationAllowed: false;
    childIssuesAllowed: false;
  };
};
```

### 7.4 Add API endpoints only after the contract is stable

Potential endpoints:

- `POST /api/projects/:id/workspaces/:workspaceId/repository-baseline`
- `GET /api/projects/:id/workspaces/:workspaceId/repository-baseline`

The POST endpoint should require board access. If future versions allow agent-triggered baseline refresh, that should be a separate permission decision.

### 7.5 Optional single tracking issue

If `createTrackingIssue` is true, create one issue with a body similar to:

```md
This issue tracks the repository documentation baseline for this project.

Scope constraints:
- This is not backlog decomposition.
- Do not create child issues.
- Do not modify repository files.
- Do not assign implementation work.
- Produce or refresh only Paperclip-owned documentation artifacts.

Expected output:
- Project baseline
- Documentation map
- Workspace binding notes
- Runtime hints
- Documentation gaps
```

This issue may link to the generated baseline artifact. It must not become a parent issue for generated subissues in this feature.

## 8. Frontend Implementation Shape

Potential files:

- `ui/src/api/projects.ts`
- `ui/src/pages/Projects.tsx`
- `ui/src/pages/ProjectDetail.tsx`
- `ui/src/components/NewProjectDialog.tsx` or equivalent existing project dialog owner
- `ui/src/components/ProjectProperties.tsx`
- `ui/src/components/ProjectWorkspaceSummaryCard.tsx`
- new `ui/src/components/RepositoryBaselinePanel.tsx`

Frontend requirements:

- Empty project list should guide users to connect a codebase.
- Project intake should support local folder, GitHub URL, or both.
- The baseline panel should show the no-backlog/no-write boundary before running.
- The optional tracking issue toggle should be off by default.
- The optional agent wakeup toggle should be off by default and disabled unless a tracking issue exists or a future non-issue baseline runner exists.
- If repo URL only is supplied, UI must state that no local command execution is possible until a checkout/workspace exists.

## 9. Backend Implementation Shape

Potential files:

- `packages/shared/src/validators/project.ts`
- `packages/shared/src/validators/repository-baseline.ts`
- `packages/shared/src/types/project.ts`
- `packages/shared/src/types/repository-baseline.ts`
- `server/src/routes/projects.ts`
- `server/src/services/projects.ts`
- `server/src/services/repository-baseline.ts`
- `server/src/services/issues.ts`
- `server/src/__tests__/projects.test.ts`
- new `server/src/__tests__/repository-baseline.test.ts`

Backend requirements:

- Reuse `project_workspaces` for repository binding.
- Keep all operations company-scoped.
- Do not execute repo scripts during baseline.
- Bound file reads by allowlist and byte limit.
- Ignore `node_modules`, `.git`, build artifacts, caches, and vendor directories.
- Store baseline output in Paperclip-owned data, not the target repository.
- If a tracking issue is created, create only one issue.
- If `wakeAgent` is false, do not enqueue heartbeat or wakeup.

## 10. Suggested File Detection Rules

Read-only candidates:

- `README.md`
- `AGENTS.md`
- `CLAUDE.md`
- `.cursor/rules/*`
- `.github/copilot-instructions.md`
- `package.json`
- `pnpm-workspace.yaml`
- `turbo.json`
- `vite.config.*`
- `tsconfig.json`
- `pyproject.toml`
- `requirements.txt`
- `Cargo.toml`
- `go.mod`
- `Dockerfile`
- `docker-compose*.yml`
- `docs/**` or `doc/**` with byte limits

Never scan by default:

- `.git/**`
- `node_modules/**`
- `dist/**`
- `build/**`
- `.next/**`
- `coverage/**`
- `.venv/**`
- `vendor/**`
- binary files
- files above the configured byte limit

## 11. Verification Plan For Future Implementation

Focused backend tests:

- Create project with local folder workspace.
- Create project with GitHub repo-only workspace.
- Create project with both local folder and repo URL.
- Run baseline with no tracking issue and assert zero issues created.
- Run baseline with tracking issue and assert exactly one issue created.
- Assert baseline never creates child issues.
- Assert baseline never calls runtime command/service control.
- Assert baseline respects read limits and ignored directories.

Focused frontend tests:

- Empty Projects state shows codebase intake CTA.
- Intake accepts local-only, repo-only, and both modes.
- Baseline panel shows no-backlog/no-write boundary.
- Tracking issue toggle defaults off.
- Launching baseline without tracking issue does not call `issuesApi.create`.

Manual browser proof:

- Start local server on port `3101`.
- Create company and cold CEO.
- Open Projects.
- Create local-folder project.
- Confirm project detail shows workspace binding.
- Run baseline without tracking issue.
- Confirm no issue appears.
- Run baseline with tracking issue.
- Confirm exactly one issue appears and no child issues exist.

## 12. Risks And Controls

### Risk: baseline becomes hidden backlog generation

Control:

- Hardcode baseline policy with `allowBacklogGeneration: false` and `allowChildIssues: false`.
- UI copy must state the boundary before run.
- Tests must assert no child issue creation.

### Risk: repo-only flow implies local execution

Control:

- Show repo-only as a documentation/identity binding until checkout exists.
- Do not expose runtime command buttons without `cwd`.

### Risk: local folder scanning reads too much

Control:

- Use allowlisted files, ignored directories, max file count, and max byte limits.
- Do not recursively summarize arbitrary source files in V1.

### Risk: issue creation wakes agents unintentionally

Control:

- Tracking issue creation and agent wakeup are separate flags.
- Both default to false.
- `wakeAgent` cannot be implied by `createTrackingIssue`.

### Risk: duplicate project/workspace concepts

Control:

- Reuse existing `projects` and `project_workspaces`.
- Avoid a new repository table until multiple baseline histories or multi-repo projects require it.

## 13. Execution Phases

### Phase 1: Project intake polish

- Improve project creation UI around codebase source.
- Ensure local-only, repo-only, and both modes are clearly represented.
- Persist through existing project/workspace APIs.
- No baseline runner yet.

### Phase 2: Baseline contract and backend read model

- Add shared baseline types and validators.
- Implement read-only baseline service.
- Store output in workspace metadata or a minimal Paperclip-owned artifact.
- Add backend tests for no issues/no writes.

### Phase 3: Baseline UI

- Add project detail baseline panel.
- Show output sections.
- Add optional single tracking issue toggle.
- Add explicit boundary copy.

### Phase 4: Optional issue trail

- Add controlled single tracking issue creation.
- Link issue to project/workspace/baseline artifact.
- Keep agent wakeup disabled by default.

### Phase 5: Browser and regression proof

- Prove cold setup remains cold.
- Prove project intake works.
- Prove baseline without issue creates no issue.
- Prove baseline with issue creates exactly one issue.

## 14. Next Bounded Step

Before implementation, decide the V1 storage target for the baseline artifact:

- Option A: store latest baseline under `project_workspaces.metadata.repositoryBaseline`.
- Option B: create a dedicated Paperclip-owned project document/work product surface.
- Option C: create a minimal `project_repository_baselines` table to preserve history.

Recommendation for first implementation: Option A, because it avoids migration and fits a "latest baseline" product shape. Move to a table only when historical baseline runs become a real product need.
